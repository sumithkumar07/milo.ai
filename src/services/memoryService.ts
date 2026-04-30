import { Message } from '../core/types';
import { GoogleGenAI } from '@google/genai';
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';

// ─── Token Estimation ────────────────────────────────────────────────
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function estimateMessageTokens(msg: { role: string; content: string }): number {
  return 4 + estimateTokens(msg.role) + estimateTokens(msg.content);
}

function estimateMessagesTokens(messages: { role: string; content: string }[]): number {
  return messages.reduce((sum, m) => sum + estimateMessageTokens(m), 0);
}

const CONTEXT_LIMITS: Record<string, number> = {
  'gemini-2.5-pro': 128000,
  'gemini-2.5-flash': 128000,
  'gpt-4o': 128000,
  'gpt-4o-mini': 128000,
  'gpt-3.5-turbo': 16385,
  'claude-3-5-sonnet': 200000,
  'claude-3-haiku': 200000,
  'claude-3-opus': 200000,
};

function getContextLimit(modelName: string): number {
  const lower = modelName.toLowerCase();
  for (const [key, limit] of Object.entries(CONTEXT_LIMITS)) {
    if (lower.includes(key.toLowerCase())) return limit;
  }
  return 128000;
}

// ─── Sliding Window with Summarization ───────────────────────────────
interface WindowedMessages {
  engineMessages: { role: 'user' | 'assistant' | 'model'; content: string; imageUrl?: string }[];
  wasSummarized: boolean;
}

async function summarizeMessages(
  messages: { role: string; content: string }[],
  config: { provider: string; geminiKey?: string; openaiKey?: string; anthropicKey?: string; customBaseUrl?: string; customApiKey?: string; customModelName?: string }
): Promise<string> {
  const summaryPrompt = `Summarize this conversation excerpt in 3-5 sentences. Focus on: key topics discussed, decisions made, important context, and any unresolved questions. Be concise but preserve all critical information.\n\nConversation:\n${messages.map(m => `${m.role}: ${m.content.slice(0, 500)}`).join('\n\n')}`;

  try {
    if (config.provider === 'gemini' && config.geminiKey) {
      const client = new GoogleGenAI({ apiKey: config.geminiKey });
      const result = await client.models.generateContent({
        model: 'gemini-2.0-flash-lite',
        contents: summaryPrompt,
        config: { temperature: 0.3, maxOutputTokens: 300 },
      });
      return (result as any).text || '';
    } else if ((config.provider === 'openai' || config.provider === 'custom') && (config.openaiKey || config.customApiKey)) {
      const apiKey = config.provider === 'custom' ? config.customApiKey! : config.openaiKey!;
      const baseURL = config.provider === 'custom' ? config.customBaseUrl : undefined;
      const client = new OpenAI({ apiKey, baseURL, dangerouslyAllowBrowser: true,
        fetch: async (url, init) => {
          const finalHeaders: Record<string, string> = {};
          if (init?.headers) {
            if (init.headers instanceof Headers) init.headers.forEach((v, k) => { finalHeaders[k] = v; });
            else if (Array.isArray(init.headers)) init.headers.forEach(([k, v]) => { finalHeaders[k] = v; });
            else Object.assign(finalHeaders, init.headers);
          }
          if (apiKey) finalHeaders['Authorization'] = `Bearer ${apiKey}`;
          delete finalHeaders['authorization'];
          return fetch('/api/proxy', {
            method: init?.method || 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ targetUrl: url.toString(), method: init?.method, headers: finalHeaders, body: typeof init?.body === 'string' ? JSON.parse(init.body) : init?.body })
          });
        }
      });
      const res = await client.chat.completions.create({
        model: config.provider === 'custom' ? (config.customModelName || 'gpt-4o-mini') : 'gpt-4o-mini',
        messages: [{ role: 'user', content: summaryPrompt }],
        temperature: 0.3,
        max_tokens: 300,
      });
      return res.choices[0]?.message?.content || '';
    } else if (config.provider === 'anthropic' && config.anthropicKey) {
      const client = new Anthropic({ apiKey: config.anthropicKey, dangerouslyAllowBrowser: true,
        fetch: async (url, init) => {
          return fetch('/api/proxy', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ targetUrl: url.toString(), method: init?.method, headers: init?.headers, body: typeof init?.body === 'string' ? JSON.parse(init.body) : init?.body })
          });
        }
      });
      const res = await client.messages.create({
        model: 'claude-3-haiku-20240307',
        max_tokens: 300,
        messages: [{ role: 'user', content: summaryPrompt }],
      });
      return (res.content as any[]).find((b: any) => b.type === 'text')?.text || '';
    }
  } catch (e) {
    console.warn('Summarization failed, falling back to truncation:', e);
  }

  // Fallback: just take first 200 chars of each message
  return messages.slice(0, 3).map(m => `${m.role}: ${m.content.slice(0, 200)}...`).join('\n\n');
}

export async function applySlidingWindow(
  messages: { role: 'user' | 'assistant' | 'model'; content: string; imageUrl?: string }[],
  existingSummary: string,
  modelName: string,
  config: { provider: string; geminiKey?: string; openaiKey?: string; anthropicKey?: string; customBaseUrl?: string; customApiKey?: string; customModelName?: string }
): Promise<WindowedMessages> {
  if (messages.length <= 6) {
    const summaryMsg = existingSummary ? [{ role: 'model' as const, content: `[System: ${existingSummary}]` }] : [];
    return {
      engineMessages: [...summaryMsg, ...messages] as WindowedMessages['engineMessages'],
      wasSummarized: false,
    };
  }

  const contextLimit = getContextLimit(modelName);
  const buffer = 0.7;
  const maxTokens = Math.floor(contextLimit * buffer);
  const currentTokens = estimateMessagesTokens(messages as any);

  if (currentTokens < maxTokens) {
    const summaryMsg = existingSummary ? [{ role: 'model' as const, content: `[System: ${existingSummary}]` }] : [];
    return {
      engineMessages: [...summaryMsg, ...messages] as WindowedMessages['engineMessages'],
      wasSummarized: false,
    };
  }

  // Need to summarize: keep the most recent 8 messages, compress the rest
  const keepCount = 8;
  const toSummarize = messages.slice(0, -keepCount);
  const recent = messages.slice(-keepCount);

  const newSummary = await summarizeMessages(toSummarize as any, config);
  const fullSummary = existingSummary
    ? `${existingSummary}\n\nEarlier discussion summary: ${newSummary}`
    : newSummary;

  const summaryMsg = { role: 'model' as const, content: `[System: Conversation history summary: ${fullSummary}]` };

  return {
    engineMessages: [summaryMsg, ...recent],
    wasSummarized: true,
  };
}

// ─── Session Archive ─────────────────────────────────────────────────
interface SessionRecord {
  sessionId: string;
  title: string;
  timestamp: number;
  topics: string[];
  summary: string;
  keyDecisions: string[];
}

const ARCHIVE_KEY = 'milo_session_archive';

function loadArchive(): SessionRecord[] {
  try {
    const raw = localStorage.getItem(ARCHIVE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveArchive(archive: SessionRecord[]) {
  try {
    localStorage.setItem(ARCHIVE_KEY, JSON.stringify(archive));
  } catch {}
}

function extractTopicsAndSummary(messages: Message[]): { topics: string[]; summary: string; keyDecisions: string[] } {
  const allText = messages.map(m => m.content).join(' ');
  const words = allText.toLowerCase().split(/\s+/).filter(w => w.length > 3);
  const stopWords = new Set(['this', 'that', 'with', 'from', 'have', 'what', 'would', 'could', 'should', 'about', 'which', 'there', 'their', 'these', 'those', 'being', 'were', 'been', 'them', 'will', 'some', 'when', 'where', 'than', 'then', 'also', 'just', 'like', 'more', 'make', 'many', 'much', 'each', 'does', 'into', 'other', 'your', 'know', 'dont', 'cant', 'want']);
  const freq: Record<string, number> = {};
  for (const w of words) {
    const clean = w.replace(/[^a-z0-9]/g, '');
    if (clean.length > 3 && !stopWords.has(clean)) freq[clean] = (freq[clean] || 0) + 1;
  }
  const topics = Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([word]) => word);

  const userMessages = messages.filter(m => m.role === 'user').map(m => m.content.slice(0, 200));
  const summary = userMessages.slice(0, 3).join('. ').slice(0, 300);

  const keyDecisions = messages
    .filter(m => m.role === 'model' && (m.content.includes('decided') || m.content.includes('recommend') || m.content.includes('solution') || m.content.includes('fix')))
    .slice(0, 2)
    .map(m => m.content.slice(0, 150));

  return { topics, summary, keyDecisions };
}

export function archiveSession(sessionId: string, title: string, messages: Message[]) {
  if (messages.length === 0) return;
  const { topics, summary, keyDecisions } = extractTopicsAndSummary(messages);
  const archive = loadArchive();
  const existingIdx = archive.findIndex(r => r.sessionId === sessionId);
  const record: SessionRecord = { sessionId, title, timestamp: Date.now(), topics, summary, keyDecisions };
  if (existingIdx >= 0) archive[existingIdx] = record;
  else archive.unshift(record);
  // Keep only last 50 sessions
  if (archive.length > 50) archive.length = 50;
  saveArchive(archive);
}

export function searchSessionArchive(query: string, maxResults: number = 3): SessionRecord[] {
  const archive = loadArchive();
  const terms = query.toLowerCase().split(/\s+/).filter(t => t.length > 3);
  if (terms.length === 0) return [];

  const scored = archive.map(r => {
    let score = 0;
    const searchable = `${r.title} ${r.topics.join(' ')} ${r.summary} ${r.keyDecisions.join(' ')}`.toLowerCase();
    for (const term of terms) {
      const count = (searchable.match(new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
      score += count;
      if (r.topics.some(t => t.includes(term))) score += 3;
    }
    const daysOld = (Date.now() - r.timestamp) / (1000 * 60 * 60 * 24);
    score += Math.max(0, 2 - daysOld / 30);
    return { record: r, score };
  });

  return scored
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxResults)
    .map(s => s.record);
}

export function getArchivedSessions(): SessionRecord[] {
  return loadArchive();
}

export function clearSessionArchive() {
  localStorage.removeItem(ARCHIVE_KEY);
}

// ─── Fact Sheet ──────────────────────────────────────────────────────
const FACTS_KEY = 'milo_user_facts';

export function getUserFacts(): string[] {
  try {
    const raw = localStorage.getItem(FACTS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveUserFacts(facts: string[]) {
  try {
    const unique = [...new Set(facts)];
    if (unique.length > 20) unique.length = 20;
    localStorage.setItem(FACTS_KEY, JSON.stringify(unique));
  } catch {}
}

export function addUserFact(fact: string) {
  const facts = getUserFacts();
  if (!facts.some(f => f.toLowerCase().includes(fact.toLowerCase()) || fact.toLowerCase().includes(f.toLowerCase()))) {
    facts.push(fact);
    saveUserFacts(facts);
  }
}

export function removeUserFact(fact: string) {
  const facts = getUserFacts().filter(f => f !== fact);
  saveUserFacts(facts);
}

export function getFactsPrompt(): string {
  const facts = getUserFacts();
  if (facts.length === 0) return '';
  return `\n\nAbout the user:\n${facts.map(f => `- ${f}`).join('\n')}`;
}

export async function extractFactsFromConversation(
  messages: { role: string; content: string }[],
  config: { provider: string; geminiKey?: string; openaiKey?: string; anthropicKey?: string; customBaseUrl?: string; customApiKey?: string; customModelName?: string }
): Promise<string[]> {
  const existing = getUserFacts();
  const existingText = existing.length > 0 ? `Already known facts (don't repeat these):\n${existing.map(f => `- ${f}`).join('\n')}` : '';
  const prompt = `${existingText ? existingText + '\n\n' : ''}From this conversation, extract any NEW facts about the user. Focus on: their preferences, work, goals, technical stack, opinions, and personal details. Return ONLY bullet points, one per line. If no new facts found, return "none".\n\nConversation:\n${messages.slice(-10).map(m => `${m.role}: ${m.content.slice(0, 300)}`).join('\n\n')}`;

  try {
    let rawText = '';

    if (config.provider === 'gemini' && config.geminiKey) {
      const client = new GoogleGenAI({ apiKey: config.geminiKey });
      const result = await client.models.generateContent({
        model: 'gemini-2.0-flash-lite',
        contents: prompt,
        config: { temperature: 0.1, maxOutputTokens: 200 },
      });
      rawText = (result as any).text || '';
    } else if ((config.provider === 'openai' || config.provider === 'custom') && (config.openaiKey || config.customApiKey)) {
      const apiKey = config.provider === 'custom' ? config.customApiKey! : config.openaiKey!;
      const baseURL = config.provider === 'custom' ? config.customBaseUrl : undefined;
      const client = new OpenAI({ apiKey, baseURL, dangerouslyAllowBrowser: true,
        fetch: async (url, init) => {
          const finalHeaders: Record<string, string> = {};
          if (init?.headers) {
            if (init.headers instanceof Headers) init.headers.forEach((v, k) => { finalHeaders[k] = v; });
            else if (Array.isArray(init.headers)) init.headers.forEach(([k, v]) => { finalHeaders[k] = v; });
            else Object.assign(finalHeaders, init.headers);
          }
          if (apiKey) finalHeaders['Authorization'] = `Bearer ${apiKey}`;
          delete finalHeaders['authorization'];
          return fetch('/api/proxy', {
            method: init?.method || 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ targetUrl: url.toString(), method: init?.method, headers: finalHeaders, body: typeof init?.body === 'string' ? JSON.parse(init.body) : init?.body })
          });
        }
      });
      const res = await client.chat.completions.create({
        model: config.provider === 'custom' ? (config.customModelName || 'gpt-4o-mini') : 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1,
        max_tokens: 200,
      });
      rawText = res.choices[0]?.message?.content || '';
    } else if (config.provider === 'anthropic' && config.anthropicKey) {
      const client = new Anthropic({ apiKey: config.anthropicKey, dangerouslyAllowBrowser: true,
        fetch: async (url, init) => {
          return fetch('/api/proxy', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ targetUrl: url.toString(), method: init?.method, headers: init?.headers, body: typeof init?.body === 'string' ? JSON.parse(init.body) : init?.body })
          });
        }
      });
      const res = await client.messages.create({
        model: 'claude-3-haiku-20240307',
        max_tokens: 200,
        messages: [{ role: 'user', content: prompt }],
      });
      rawText = (res.content as any[]).find((b: any) => b.type === 'text')?.text || '';
    }

    if (!rawText || rawText.toLowerCase() === 'none') return [];

    return rawText
      .split('\n')
      .map(line => line.replace(/^[-*•]\s*/, '').trim())
      .filter(line => line.length > 5 && line.length < 200 && line.toLowerCase() !== 'none');
  } catch (e) {
    console.warn('Fact extraction failed:', e);
    return [];
  }
}
