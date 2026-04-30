import { GoogleGenAI } from '@google/genai';
import OpenAI from 'openai';
import { chunkText, TextChunk } from './chunker';

export interface VectorStore {
  chunks: TextChunk[];
  embeddings: number[][];
  dimensions: number;
  sourceName: string;
}

export interface RAGState {
  stores: VectorStore[];
  status: 'idle' | 'processing' | 'ready' | 'error';
  progress: string;
  keywordFallbackActive: boolean;
}

const DB_NAME = 'milo-rag-db';
const DB_VERSION = 1;
const STORE_NAME = 'vector-stores';

let db: IDBDatabase | null = null;
let state: RAGState = { stores: [], status: 'idle', progress: '', keywordFallbackActive: false };
let initPromise: Promise<void> | null = null;
const listeners: Set<(s: RAGState) => void> = new Set();

function notify() { listeners.forEach(fn => fn({ ...state })); }

function openDB(): Promise<IDBDatabase> {
  if (db) return Promise.resolve(db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const database = req.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: 'sourceName' });
      }
    };
    req.onsuccess = () => { db = req.result; resolve(db); };
    req.onerror = () => reject(req.error);
  });
}

async function persistStore(store: VectorStore): Promise<boolean> {
  try {
    const database = await openDB();
    const tx = database.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(store);
    return new Promise((resolve) => {
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => {
        console.warn('Failed to persist RAG store:', tx.error);
        resolve(false);
      };
    });
  } catch (e) {
    console.warn('Failed to persist RAG store:', e);
    return false;
  }
}

async function loadPersistedStores(): Promise<VectorStore[]> {
  try {
    const database = await openDB();
    const tx = database.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).getAll();
    return new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  } catch (e) {
    console.warn('Failed to load persisted RAG stores:', e);
    return [];
  }
}

async function deletePersistedStore(sourceName: string): Promise<void> {
  try {
    const database = await openDB();
    const tx = database.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(sourceName);
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {
    console.warn('Failed to delete persisted RAG store:', e);
  }
}

async function clearPersistedStores(): Promise<void> {
  try {
    const database = await openDB();
    const tx = database.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).clear();
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {
    console.warn('Failed to clear persisted RAG stores:', e);
  }
}

export async function initRAG(): Promise<void> {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    const persisted = await loadPersistedStores();
    if (persisted.length > 0) {
      state.stores = persisted;
      state.status = 'ready';
      state.progress = `Restored ${persisted.length} indexed document(s)`;
      notify();
    }
  })();
  return initPromise;
}

export function onRAGStateChange(listener: (s: RAGState) => void) {
  listeners.add(listener);
  listener({ ...state });
  return () => { listeners.delete(listener); };
}

export function getRAGState(): RAGState { return { ...state }; }
export function isKeywordFallbackActive(): boolean { return state.keywordFallbackActive; }

export async function clearRAG() {
  state = { stores: [], status: 'idle', progress: '', keywordFallbackActive: false };
  await clearPersistedStores();
  notify();
}

export function hasStoredDocuments(): boolean {
  return state.stores.length > 0;
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB) || 1);
}

function keywordScore(query: string, chunk: string): number {
  const qTerms = query.toLowerCase().split(/\s+/).filter(t => t.length > 2);
  const cTerms = chunk.toLowerCase().split(/\s+/);
  let score = 0;
  for (const qt of qTerms) {
    for (const ct of cTerms) {
      if (ct.includes(qt) || qt.includes(ct)) score += 1;
    }
  }
  return score / (qTerms.length || 1);
}

export async function ingestDocument(
  text: string,
  sourceName: string,
  config: {
    provider: string;
    geminiKey?: string;
    openaiKey?: string;
    customBaseUrl?: string;
    customApiKey?: string;
  }
): Promise<VectorStore | null> {
  state.status = 'processing';
  state.progress = `Chunking ${sourceName}...`;
  notify();

  const chunks = chunkText(text, { chunkSize: 1000, overlap: 200 });
  if (chunks.length === 0) {
    state.status = 'idle';
    state.progress = `No content to index from ${sourceName}`;
    notify();
    return null;
  }

  state.progress = `Creating embeddings for ${chunks.length} chunks...`;
  notify();

  let embeddings: number[][] = [];
  let dimensions = 0;

  try {
    if (config.provider === 'gemini' && config.geminiKey) {
      embeddings = await embedWithGemini(chunks, config.geminiKey);
      dimensions = embeddings[0]?.length ?? 0;
    } else if ((config.provider === 'openai' || config.provider === 'custom') && (config.openaiKey || config.customApiKey)) {
      const apiKey = config.provider === 'custom' ? config.customApiKey! : config.openaiKey!;
      const baseUrl = config.provider === 'custom' ? config.customBaseUrl : undefined;
      embeddings = await embedWithOpenAI(chunks, apiKey, baseUrl);
      dimensions = embeddings[0]?.length ?? 0;
    } else {
      state.progress = `No embedding API available, using keyword search...`;
      notify();
      embeddings = chunks.map(() => []);
      dimensions = 0;
    }
  } catch (err: any) {
    console.error('Embedding failed, falling back to keyword search:', err);
    embeddings = chunks.map(() => []);
    dimensions = 0;
  }

  const existingIdx = state.stores.findIndex(s => s.sourceName === sourceName);
  const store: VectorStore = { chunks, embeddings, dimensions, sourceName };

  if (existingIdx !== -1) {
    state.stores[existingIdx] = store;
  } else {
    state.stores.push(store);
  }

  await persistStore(store);

  state.status = 'ready';
  state.progress = `Indexed ${chunks.length} chunks from ${sourceName}`;
  notify();

  return store;
}

async function embedWithGemini(chunks: TextChunk[], apiKey: string): Promise<number[][]> {
  const client = new GoogleGenAI({ apiKey });
  const embeddings: number[][] = [];
  const batchSize = 100;

  for (let i = 0; i < chunks.length; i += batchSize) {
    const batch = chunks.slice(i, i + batchSize);
    const texts = batch.map(c => c.text);
    const result = await client.models.embedContent({
      model: 'models/text-embedding-004',
      contents: texts
    });
    const emb = (result as any).embeddings;
    if (Array.isArray(emb)) {
      for (const e of emb) {
        embeddings.push(e.values || []);
      }
    }
  }
  return embeddings;
}

async function embedWithOpenAI(chunks: TextChunk[], apiKey: string, baseUrl?: string): Promise<number[][]> {
  const client = new OpenAI({
    apiKey,
    baseURL: baseUrl,
    dangerouslyAllowBrowser: true,
    fetch: async (url, init) => {
      let bodyPayload = init?.body;
      if (typeof init?.body === 'string') {
        try {
          bodyPayload = JSON.parse(init.body);
        } catch {
          bodyPayload = init.body;
        }
      }
      return fetch('/api/proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetUrl: url.toString(),
          method: init?.method,
          headers: init?.headers,
          body: bodyPayload
        })
      });
    }
  });

  const embeddings: number[][] = [];
  const batchSize = 100;

  for (let i = 0; i < chunks.length; i += batchSize) {
    const batch = chunks.slice(i, i + batchSize);
    const texts = batch.map(c => c.text);
    const model = baseUrl?.includes('nvidia') ? 'nvidia/nv-embed-v1' : 'text-embedding-3-small';
    const result = await client.embeddings.create({
      model: model,
      input: texts,
    });
    for (const d of result.data) {
      embeddings.push(d.embedding);
    }
  }
  return embeddings;
}

export interface RetrievalResult {
  chunks: TextChunk[];
  scores: number[];
}

export async function retrieveRelevantChunks(
  query: string,
  topK: number = 5,
  config?: {
    provider: string;
    geminiKey?: string;
    openaiKey?: string;
    customBaseUrl?: string;
    customApiKey?: string;
  }
): Promise<RetrievalResult> {
  if (state.stores.length === 0) {
    return { chunks: [], scores: [] };
  }

  const hasEmbeddings = state.stores.some(s => s.dimensions > 0);

  if (!hasEmbeddings) {
    state.keywordFallbackActive = true;
    notify();
    return keywordRetrieve(query, topK);
  }

  // Group stores by dimension so we never compare mismatched vectors
  const dimGroups = new Map<number, VectorStore[]>();
  for (const store of state.stores) {
    if (store.dimensions === 0) continue;
    const group = dimGroups.get(store.dimensions) || [];
    group.push(store);
    dimGroups.set(store.dimensions, group);
  }

  // Try each dimension group — pick the first one we can embed for
  let queryEmbedding: number[] = [];
  let targetDim = 0;

  for (const [dim, stores] of dimGroups.entries()) {
    const sample = stores[0].embeddings[0];
    if (!sample || sample.length !== dim) continue;

    try {
      if (dim === 768) {
        queryEmbedding = await embedQueryGemini(query, config?.geminiKey || '');
      } else if (dim === 1536 || dim === 3072 || dim === 4096) {
        const apiKey = config?.provider === 'custom' ? config?.customApiKey : config?.openaiKey;
        const baseUrl = config?.provider === 'custom' ? config?.customBaseUrl : undefined;
        queryEmbedding = await embedQueryOpenAI(query, apiKey || '', baseUrl, dim);
      }
      if (queryEmbedding.length > 0) {
        targetDim = dim;
        break;
      }
    } catch {
      continue;
    }
  }

  if (queryEmbedding.length === 0) {
    state.keywordFallbackActive = true;
    notify();
    return keywordRetrieve(query, topK);
  }

  state.keywordFallbackActive = false;
  notify();

  const scored: { chunk: TextChunk; score: number }[] = [];

  // Only score stores with matching dimension
  const matchingStores = dimGroups.get(targetDim) || [];
  for (const store of matchingStores) {
    for (let i = 0; i < store.chunks.length; i++) {
      const emb = store.embeddings[i];
      if (!emb || emb.length !== targetDim) continue;
      const sim = cosineSimilarity(queryEmbedding, emb);
      scored.push({ chunk: store.chunks[i], score: sim });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  const top = scored.slice(0, topK);

  return {
    chunks: top.map(s => s.chunk),
    scores: top.map(s => s.score)
  };
}

async function embedQueryGemini(query: string, apiKey: string): Promise<number[]> {
  if (!apiKey) return [];
  const client = new GoogleGenAI({ apiKey });
  const result = await client.models.embedContent({
    model: 'models/text-embedding-004',
    contents: query
  });
  const emb = (result as any).embeddings;
  if (Array.isArray(emb) && emb.length > 0) {
    return emb[0].values || [];
  }
  return [];
}

async function embedQueryOpenAI(query: string, apiKey: string, baseUrl?: string, targetDim?: number): Promise<number[]> {
  if (!apiKey) return [];
  const client = new OpenAI({
    apiKey,
    baseURL: baseUrl,
    dangerouslyAllowBrowser: true,
    fetch: async (url, init) => {
      let bodyPayload = init?.body;
      if (typeof init?.body === 'string') {
        try {
          bodyPayload = JSON.parse(init.body);
        } catch {
          bodyPayload = init.body;
        }
      }
      return fetch('/api/proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetUrl: url.toString(),
          method: init?.method,
          headers: init?.headers,
          body: bodyPayload
        })
      });
    }
  });
  const isNvidia = baseUrl?.includes('nvidia');
  const model = isNvidia ? 'nvidia/nv-embed-v1' : (targetDim === 3072 ? 'text-embedding-3-large' : 'text-embedding-3-small');
  const result = await client.embeddings.create({
    model: model,
    input: query,
  });
  return result.data[0]?.embedding || [];
}


function keywordRetrieve(query: string, topK: number): RetrievalResult {
  const scored: { chunk: TextChunk; score: number }[] = [];

  for (const store of state.stores) {
    for (const chunk of store.chunks) {
      const score = keywordScore(query, chunk.text);
      if (score > 0) {
        scored.push({ chunk, score });
      }
    }
  }

  scored.sort((a, b) => b.score - a.score);
  const top = scored.slice(0, topK);

  return {
    chunks: top.map(s => s.chunk),
    scores: top.map(s => s.score)
  };
}

export function getIndexedDocumentsInfo(): { name: string; chunks: number }[] {
  return state.stores.map(s => ({ name: s.sourceName, chunks: s.chunks.length }));
}
