import { GoogleGenAI } from '@google/genai';
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { FeatureId, ResponseMode } from '../core/types';
import { getFactsPrompt } from './memoryService';

export type ModelProvider = 'gemini' | 'openai' | 'anthropic' | 'custom';

export interface LLMConfig {
  provider: ModelProvider;
  geminiKey?: string;
  openaiKey?: string;
  anthropicKey?: string;
  customBaseUrl?: string;
  customApiKey?: string;
  customModelName?: string;
  geminiModel?: string;
  openaiModel?: string;
  anthropicModel?: string;
  searchBackend?: 'duckduckgo' | 'searxng' | 'unsearch';
  searxngUrl?: string;
}

const TOOL_GATE_PROMPT = `\n\nTOOL USAGE GUIDELINES (CRITICAL FOR EFFICIENCY):
- Only use web search when the question requires current, real-time, or highly specific factual information.
- Do NOT search for: greetings, general knowledge, creative writing, code review without web context, opinions, or mathematical calculations.
- Do NOT re-search if the conversation already contains sufficient context to answer.
- When using search, be precise and cite sources with [1], [2] markers.`;

const FEATURE_PROMPTS: Record<FeatureId, string> = {
  'deep-search': `You are MILO Deep Search Engine. Explore the topic exhaustively. Break down complex subjects into structured, detailed analysis. Provide pros/cons, historical context, and future outlooks. You have been provided with live web search results below — use them to ground your response. Cite sources using [1], [2], [3] markers inline when referencing specific facts from the search data.`,
  'code-gen': `You are MILO Code Engine, an expert programming assistant that writes executable, production-quality code.

CODE EXECUTION ENVIRONMENT:
- Code runs in the browser via Pyodide (Python in WebAssembly). It does NOT run on a server.
- Pre-installed packages: matplotlib, numpy, pandas, pillow. Other pip installs will fail.
- NO file I/O (open, read, write), NO network requests (requests, urllib), NO subprocess/os.system calls.
- NO interactive input (input() will not work).

PYTHON CODE RULES:
- Always wrap Python code in \`\`\`python code blocks.
- Include ALL imports explicitly at the top.
- Use print() for all output. Do NOT return values.
- Handle errors with try/except — print user-friendly error messages.
- For plots: use matplotlib.pyplot, call plt.show() ONLY when the user requests a visualization.
- Keep code self-contained, immediately runnable, and free of placeholders.
- Add brief comments for non-obvious logic.
- Follow PEP 8: descriptive variable names, consistent formatting, no dead code.

FOR OTHER LANGUAGES:
- JavaScript/TypeScript: use \`\`\`javascript or \`\`\`typescript blocks. These run in a browser sandbox.
- HTML: use \`\`\`html blocks. Rendered in a sandboxed iframe.
- For languages without execution support (Rust, Go, C, etc.), provide the code with clear instructions on how to compile and run locally.

GENERAL STYLE:
- Provide a brief explanation BEFORE each code block.
- If multiple approaches exist, recommend the best one and explain why.
- When the user asks for modifications, update existing code rather than rewriting from scratch.
- Never leave TODO comments or placeholder functions — write complete, working code.`,
  'doc-analysis': `You are MILO Document Analyzer, an expert at analyzing and extracting insights from uploaded documents.

DOCUMENT CONTEXT:
- The user has uploaded documents that have been indexed and retrieved as relevant excerpts.
- Document excerpts are marked as [Chunk N] in the user's message.
- Multiple chunks may come from the same document or different documents.

ANALYSIS GUIDELINES:
1. Start with an Executive Summary (2-3 sentences) capturing the core message.
2. Extract Key Insights — list the most important findings with bullet points.
3. Identify Key Arguments, metrics, data points, or quotes that support the main thesis.
4. Structure your response with clear headings, subheadings, and bullet points.
5. Cite specific chunks using [Chunk N] notation when referencing content.
6. If analyzing multiple documents, compare and contrast their perspectives.
7. Highlight any contradictions, gaps, or areas needing further investigation.
8. If the retrieved excerpts don't contain enough information, state this explicitly.

RESPONSE FORMAT:
## Executive Summary
[Brief overview]

## Key Insights
- [Insight 1] [Chunk 1]
- [Insight 2] [Chunk 3]

## Detailed Analysis
[Structured breakdown with headings]

## Notable Quotes / Metrics
[Direct quotes, numbers, or data points] [Chunk N]

## Recommendations / Next Steps
[If applicable]

GENERAL RULES:
- Be thorough but concise. Avoid filler.
- Ground every claim in the provided excerpts.
- When information is ambiguous, flag it rather than guessing.
- For technical documents, explain complex concepts in accessible terms.
- For data-heavy documents, extract and summarize key statistics.`,
};

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  source: string;
}

async function searchDuckDuckGo(query: string): Promise<SearchResult[]> {
  const htmlRes = await fetch(`/api/proxy`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      targetUrl: `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`,
      method: 'GET',
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' }
    })
  });
  if (!htmlRes.ok) return [];
  const html = await htmlRes.text();
  const results: SearchResult[] = [];

  const patterns = [
    /<div class="result__body">[\s\S]*?<a[^>]+href="([^"]+)"[^>]*class="result__a"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi,
    /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<p class="result__snippet"[^>]*>([\s\S]*?)<\/p>/gi,
    /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi,
    /<a[^>]+href="(https?:\/\/[^"]+)"[^>]*class="result__a"[^>]*>([\s\S]*?)<\/a>/gi,
    /<a[^>]+href="[^"]*uddg=([^&"]+)[^"]*"[^>]*>([\s\S]*?)<\/a>/gi,
  ];

  for (const pattern of patterns) {
    if (results.length >= 8) break;
    let match;
    pattern.lastIndex = 0;
    while ((match = pattern.exec(html)) !== null && results.length < 8) {
      let url = match[1];
      const title = match[2].replace(/<\/?[^>]+>/g, '').trim();
      const snippet = match[3] ? match[3].replace(/<\/?[^>]+>/g, '').trim() : '';
      if (url && title) {
        try { url = decodeURIComponent(url); } catch {}
        if (!url.startsWith('http')) url = 'https://' + url;
        if (!url.includes('duckduckgo.com') && !results.some(r => r.url === url)) {
          results.push({ title, url, snippet, source: 'DuckDuckGo' });
        }
      }
    }
  }

  return results;
}

async function searchWikipedia(query: string): Promise<SearchResult[]> {
  try {
    const res = await fetch(`/api/proxy`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        targetUrl: `https://en.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(query)}&limit=5&format=json`,
        method: 'GET'
      })
    });
    if (!res.ok) return [];
    const data = await res.json();
    // data format: [query, [titles], [descriptions], [urls]]
    if (!Array.isArray(data) || data.length < 4) return [];
    return data[1].map((title: string, i: number) => ({
      title,
      url: data[3][i] || '',
      snippet: data[2][i] || '',
      source: 'Wikipedia'
    }));
  } catch {
    return [];
  }
}

const PUBLIC_SEARXNG_INSTANCES = [
  'https://search.sapti.me',
  'https://searx.tiekoetter.com',
  'https://searx.be',
  'https://search.bus-hit.me',
  'https://searx.work',
  'https://priv.au',
  'https://searx.tuxcloud.net',
  'https://searxng.site',
];

async function searchSearXNGWithRetry(query: string, preferredUrl?: string): Promise<{ results: SearchResult[]; usedUrl: string }> {
  const instances = preferredUrl ? [preferredUrl, ...PUBLIC_SEARXNG_INSTANCES.filter(u => u !== preferredUrl)] : [...PUBLIC_SEARXNG_INSTANCES];
  let lastError: Error | null = null;

  for (const instanceUrl of instances) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(`${instanceUrl}/search?q=${encodeURIComponent(query)}&format=json&categories=general&engines=google,bing,duckduckgo,wikipedia&qformat=json`, { signal: controller.signal });
      clearTimeout(timeout);
      if (!res.ok) continue;
      const data = await res.json();
      const results = (data.results || []).slice(0, 8).map((r: any) => ({
        title: r.title || '',
        url: r.url || '',
        snippet: r.content || '',
        source: r.engine || 'SearXNG'
      })).filter((r: SearchResult) => r.url && r.title);
      if (results.length > 0) return { results, usedUrl: instanceUrl };
    } catch (err: any) {
      lastError = err;
    }
  }
  return { results: [], usedUrl: '' };
}

async function searchSearXNG(query: string, baseUrl: string): Promise<SearchResult[]> {
  const res = await searchSearXNGWithRetry(query, baseUrl);
  return res.results;
}

// ─── Smart Snippet Extraction ────────────────────────────────────────
function extractRelevantSnippets(fullContent: string, query: string, maxChars: number = 2000): string {
  const paragraphs = fullContent.split(/\n\s*\n/).filter(p => p.trim().length > 20);
  if (paragraphs.length === 0) return fullContent.slice(0, maxChars);

  const terms = query.toLowerCase().split(/\s+/).filter(t => t.length > 2);
  if (terms.length === 0) return fullContent.slice(0, maxChars);

  const scored = paragraphs.map(p => {
    const lower = p.toLowerCase();
    let score = 0;
    for (const term of terms) {
      const count = (lower.match(new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
      score += count * 2;
    }
    const termPositions: number[] = [];
    for (const term of terms) {
      let idx = lower.indexOf(term);
      while (idx !== -1) { termPositions.push(idx); idx = lower.indexOf(term, idx + 1); }
    }
    if (termPositions.length > 1) {
      termPositions.sort((a, b) => a - b);
      const span = termPositions[termPositions.length - 1] - termPositions[0];
      if (span < 200) score += 5;
      else if (span < 500) score += 2;
    }
    const titleWords = new Set(terms.slice(0, 3));
    const firstSentence = p.split(/[.!?]/)[0].toLowerCase();
    for (const tw of titleWords) { if (firstSentence.includes(tw)) score += 3; }
    return { paragraph: p.trim(), score };
  });

  scored.sort((a, b) => b.score - a.score);
  let result = '';
  let charCount = 0;
  for (const s of scored) {
    if (charCount + s.paragraph.length > maxChars) break;
    if (result) result += '\n\n---\n\n';
    result += s.paragraph;
    charCount += s.paragraph.length;
  }
  return result || fullContent.slice(0, maxChars);
}

async function fetchUrlContent(url: string): Promise<string> {
  try {
    const res = await fetch(`/api/fetch-url`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url })
    });
    if (!res.ok) return '';
    const data = await res.json();
    return data.content || '';
  } catch {
    return '';
  }
}

function formatResults(results: SearchResult[]): string {
  if (results.length === 0) return 'No web results found.';
  return results.map((r, i) =>
    `[${i + 1}] ${r.title}\nURL: ${r.url}\nSource: ${r.source}\nSummary: ${r.snippet}`
  ).join('\n\n');
}

// ─── Search Cache ─────────────────────────────────────────────────────
const CACHE_TTL = 3_600_000; // 1 hour

interface CacheEntry {
  results: SearchResult[];
  fetchedContent: string;
  timestamp: number;
}

function getCached(query: string): CacheEntry | null {
  try {
    const raw = localStorage.getItem(`milo_search_${hashStr(query)}`);
    if (!raw) return null;
    const entry: CacheEntry = JSON.parse(raw);
    if (Date.now() - entry.timestamp > CACHE_TTL) {
      localStorage.removeItem(`milo_search_${hashStr(query)}`);
      return null;
    }
    return entry;
  } catch { return null; }
}

function setCache(query: string, results: SearchResult[], fetchedContent: string) {
  try {
    localStorage.setItem(`milo_search_${hashStr(query)}`, JSON.stringify({ results, fetchedContent, timestamp: Date.now() }));
  } catch {}
}

function hashStr(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) { h = ((h << 5) - h + s.charCodeAt(i)) | 0; }
  return h.toString(36);
}

// ─── Query Filter Parsing ─────────────────────────────────────────────
interface ParsedQuery {
  coreQuery: string;
  siteFilter: string;
  dateFilter?: { after?: string; before?: string };
}

function parseQuery(raw: string): ParsedQuery {
  let core = raw;
  let site = '';
  let after: string | undefined;
  let before: string | undefined;

  const siteMatch = core.match(/site:(\S+)/i);
  if (siteMatch) {
    site = siteMatch[1];
    core = core.replace(siteMatch[0], '').trim();
  }
  const afterMatch = core.match(/after:(\d{4}-?\d{0,2}-?\d{0,2})/i);
  if (afterMatch) {
    after = afterMatch[1].replace(/-/g, '');
    core = core.replace(afterMatch[0], '').trim();
  }
  const beforeMatch = core.match(/before:(\d{4}-?\d{0,2}-?\d{0,2})/i);
  if (beforeMatch) {
    before = beforeMatch[1].replace(/-/g, '');
    core = core.replace(beforeMatch[0], '').trim();
  }
  return { coreQuery: core || raw, siteFilter: site, dateFilter: after || before ? { after, before } : undefined };
}

function buildEngineQuery(parsed: ParsedQuery, backend: string): string {
  let q = parsed.coreQuery;
  if (parsed.siteFilter && backend !== 'unsearch') q = `site:${parsed.siteFilter} ${q}`;
  return q;
}

// ─── BM25 Re-ranking ──────────────────────────────────────────────────
function bm25Rank(query: string, results: SearchResult[]): SearchResult[] {
  const terms = query.toLowerCase().split(/\s+/).filter(t => t.length > 2);
  if (terms.length === 0) return results;
  const k1 = 1.2, b = 0.75;
  const avgLen = results.reduce((s, r) => s + (r.title + ' ' + r.snippet).length, 0) / (results.length || 1);
  const scored = results.map(r => {
    const text = (r.title + ' ' + r.snippet).toLowerCase();
    const len = text.length;
    let score = 0;
    for (const term of terms) {
      const freq = (text.match(new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
      const idf = Math.log((results.length + 1) / Math.max(1, results.filter(rr => (rr.title + ' ' + rr.snippet).toLowerCase().includes(term)).length) + 0.5) + 0.5;
      score += idf * (freq * (k1 + 1)) / (freq + k1 * (1 - b + b * (len / avgLen)));
    }
    return { ...r, _bm25: score };
  });
  scored.sort((a, b) => (b as any)._bm25 - (a as any)._bm25);
  return scored.map(({ _bm25, ...r }) => r);
}

// ─── Follow-up Query Generation ───────────────────────────────────────
function generateFollowUpQueries(originalQuery: string, existingResults: SearchResult[], round: number): string {
  // Extract key terms from existing results to find gaps
  const allText = existingResults.map(r => r.title + ' ' + r.snippet).join(' ').toLowerCase();
  const coreTerms = originalQuery.toLowerCase().split(/\s+/).filter(t => t.length > 3);
  
  // Identify angles already covered
  const coveredAngles = {
    comparison: /vs|versus|compare|comparison|difference|better/i.test(allText),
    pros: /pros|advantages|benefits|strengths/i.test(allText),
    cons: /cons|disadvantages|drawbacks|limitations|issues/i.test(allText),
    tutorial: /how to|guide|tutorial|steps|setup|install/i.test(allText),
    pricing: /price|cost|free|pricing|plan|subscription/i.test(allText),
    alternatives: /alternative|similar|competitor|vs |replace/i.test(allText),
    latest: /2025|2026|latest|recent|new|update/i.test(allText),
    technical: /api|sdk|integration|code|implement|develop/i.test(allText),
  };

  const topic = coreTerms.slice(0, 3).join(' ');
  if (!topic) return originalQuery;

  // Generate a follow-up targeting uncovered angles
  if (round === 2) {
    if (!coveredAngles.comparison && !coveredAngles.alternatives) return `${topic} vs alternatives comparison`;
    if (!coveredAngles.pros && !coveredAngles.cons) return `${topic} pros cons disadvantages`;
    if (!coveredAngles.latest) return `${topic} latest updates 2025 2026`;
    if (!coveredAngles.technical) return `${topic} technical implementation guide`;
    return `${topic} in-depth analysis review`;
  }

  // Round 3: deepest angle
  if (!coveredAngles.pricing) return `${topic} pricing cost options`;
  if (!coveredAngles.tutorial) return `how to use ${topic} step by step`;
  if (!coveredAngles.technical) return `${topic} architecture how it works`;
  return `${topic} expert opinion insights`;
}

// ─── Model Router ────────────────────────────────────────────────────
interface RouteDecision {
  needsSearch: boolean;
  needsRAG: boolean;
  needsCodeExec: boolean;
  answerDirectly: boolean;
}

const ROUTER_PROMPT = `You are a query router. Classify the user's message into the required tools. Respond with ONLY a JSON object: {"search": true/false, "rag": true/false, "code": true/false}

Rules:
- "search": true only if the question requires CURRENT, REAL-TIME, or highly specific factual data not commonly known.
- "rag": true only if the user references uploaded documents, files, or context that requires document retrieval.
- "code": true only if the user asks for executable code, debugging, or code explanation.
- If none apply, all false = answer directly from knowledge.

Examples:
"hello" → {"search":false,"rag":false,"code":false}
"what's the weather today?" → {"search":true,"rag":false,"code":false}
"explain the uploaded PDF" → {"search":false,"rag":true,"code":false}
"write a python function to sort a list" → {"search":false,"rag":false,"code":true}
"latest news about AI regulation 2025" → {"search":true,"rag":false,"code":false}`;

async function routeQuery(
  query: string,
  config: LLMConfig
): Promise<RouteDecision> {
  try {
    const { provider, geminiKey, openaiKey, customBaseUrl, customApiKey } = config;
    let decision: RouteDecision | null = null;

    if (provider === 'gemini' && geminiKey) {
      const client = new GoogleGenAI({ apiKey: geminiKey });
      const result = await client.models.generateContent({
        model: 'gemini-2.0-flash-lite',
        contents: `${ROUTER_PROMPT}\n\nQuery: "${query}"`,
        config: { temperature: 0, maxOutputTokens: 50 },
      });
      const text = (result as any).text || '';
      const jsonMatch = text.match(/\{[^}]+\}/);
      if (jsonMatch) {
        decision = JSON.parse(jsonMatch[0]);
      }
    } else if ((provider === 'openai' || provider === 'custom') && (openaiKey || customApiKey)) {
      const apiKey = provider === 'custom' ? customApiKey! : openaiKey!;
      const baseURL = provider === 'custom' ? customBaseUrl : undefined;
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
        model: provider === 'custom' ? (config.customModelName || 'gpt-4o-mini') : 'gpt-4o-mini',
        messages: [{ role: 'user', content: `${ROUTER_PROMPT}\n\nQuery: "${query}"` }],
        temperature: 0,
        max_tokens: 50,
      });
      const text = res.choices[0]?.message?.content || '';
      const jsonMatch = text.match(/\{[^}]+\}/);
      if (jsonMatch) {
        decision = JSON.parse(jsonMatch[0]);
      }
    } else if (provider === 'anthropic' && config.anthropicKey) {
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
        max_tokens: 50,
        messages: [{ role: 'user', content: `${ROUTER_PROMPT}\n\nQuery: "${query}"` }],
      });
      const text = (res.content as any[]).find((b: any) => b.type === 'text')?.text || '';
      const jsonMatch = text.match(/\{[^}]+\}/);
      if (jsonMatch) {
        decision = JSON.parse(jsonMatch[0]);
      }
    }

    if (decision) {
      return {
        needsSearch: !!decision.needsSearch,
        needsRAG: !!decision.needsRAG,
        needsCodeExec: !!decision.needsCodeExec,
        answerDirectly: !decision.needsSearch && !decision.needsRAG && !decision.needsCodeExec,
      };
    }
  } catch (e) {
    console.warn('Router failed, falling back to full processing:', e);
  }

  return { needsSearch: true, needsRAG: true, needsCodeExec: true, answerDirectly: false };
}

// ─── Multi-turn Agent Search Loop ─────────────────────────────────────
export async function* performDeepSearch(
  query: string,
  backend: 'duckduckgo' | 'searxng' | 'unsearch',
  searxngUrl?: string,
  signal?: AbortSignal
): AsyncGenerator<{ type: 'status' | 'search' | 'followup' | 'done'; message: string; results?: SearchResult[]; fetchedContent?: string }, void, unknown> {
  const parsed = parseQuery(query);
  const maxRounds = 3;
  const allResults: SearchResult[] = [];
  const seenUrls = new Set<string>();
  let finalContent = '';

  for (let round = 1; round <= maxRounds; round++) {
    if (signal?.aborted) return;

    // Use original query for round 1, intelligent follow-ups for rounds 2-3
    const roundQuery = round === 1
      ? buildEngineQuery(parsed, backend)
      : generateFollowUpQueries(parsed.coreQuery, allResults, round);

    const cacheKey = `${roundQuery}|round${round}`;
    const cached = getCached(cacheKey);

    if (cached) {
      yield { type: 'followup', message: `♻️ Cache hit — loaded ${cached.results.length} results for "${roundQuery}"` };
      for (const r of cached.results) {
        if (!seenUrls.has(r.url)) { seenUrls.add(r.url); allResults.push(r); }
      }
      finalContent += cached.fetchedContent;
    } else {
      const roundLabel = round === 1 ? '🔍' : round === 2 ? '🔄' : '🔎';
      const statusType = round === 1 ? 'search' : 'followup';
      yield { type: statusType, message: `${roundLabel} Round ${round}: "${roundQuery}"` };

      let roundResults: SearchResult[] = [];
      if (backend === 'searxng') {
        const res = await searchSearXNGWithRetry(roundQuery, searxngUrl);
        roundResults = res.results;
        if (roundResults.length === 0) roundResults = await searchDuckDuckGo(roundQuery);
        if (roundResults.length === 0) roundResults = await searchWikipedia(roundQuery);
      } else if (backend === 'duckduckgo') {
        roundResults = await searchDuckDuckGo(roundQuery);
        if (roundResults.length === 0) {
          const res = await searchSearXNGWithRetry(roundQuery);
          roundResults = res.results;
        }
        if (roundResults.length === 0) roundResults = await searchWikipedia(roundQuery);
      } else {
        roundResults = await searchWikipedia(roundQuery);
      }

      // Deduplicate against previous rounds
      const newResults = roundResults.filter(r => !seenUrls.has(r.url));
      if (newResults.length === 0 && round > 1) {
        yield { type: 'status', message: `⏭️ Round ${round}: No new results — stopping early` };
        break;
      }

      for (const r of newResults) { seenUrls.add(r.url); allResults.push(r); }
      const resultMsg = round === 1
        ? `✅ Round ${round}: +${newResults.length} new results (${allResults.length} total)`
        : `✅ Round ${round}: +${newResults.length} from "${roundQuery}" (${allResults.length} total)`;
      yield { type: 'status', message: resultMsg };

      // Fetch content for new round results (up to 3) and extract only relevant snippets
      const topFetch = newResults.slice(0, 3);
      if (topFetch.length > 0 && round < maxRounds) {
        yield { type: 'status', message: `📄 Reading ${topFetch.length} pages...` };
        const contents = await Promise.all(topFetch.map(async r => {
          const content = await fetchUrlContent(r.url);
          return { url: r.url, content };
        }));
        for (const c of contents) {
          if (c.content) {
            const snippet = extractRelevantSnippets(c.content, roundQuery, 2000);
            finalContent += `\n--- Content (${c.url}) ---\n${snippet}\n`;
          }
        }
      }

      setCache(cacheKey, newResults, finalContent);
    }

    // Check if we have enough results
    if (allResults.length >= 12 && round < maxRounds) break;
  }

  if (signal?.aborted) return;

  // BM25 re-rank all results
  const ranked = bm25Rank(parsed.coreQuery, allResults);
  const topRanked = ranked.slice(0, 10);

  yield { type: 'done', message: `📊 Re-ranked ${allResults.length} results, using top ${topRanked.length}`, results: topRanked, fetchedContent: finalContent };
}

export async function performSearch(query: string, backend: 'duckduckgo' | 'searxng' | 'unsearch' = 'searxng', searxngUrl?: string): Promise<{ results: SearchResult[]; fetchedContent: string }> {
  let results: SearchResult[] = [];

  // Fallback chain: SearXNG (primary) → DuckDuckGo → Wikipedia
  if (backend === 'searxng') {
    const { results: searxResults } = await searchSearXNGWithRetry(query, searxngUrl);
    results = searxResults;
    if (results.length === 0) {
      results = await searchDuckDuckGo(query);
    }
    if (results.length === 0) {
      results = await searchWikipedia(query);
    }
  } else if (backend === 'duckduckgo') {
    results = await searchDuckDuckGo(query);
    if (results.length === 0) {
      const { results: searxResults } = await searchSearXNGWithRetry(query);
      results = searxResults;
    }
    if (results.length === 0) {
      results = await searchWikipedia(query);
    }
  } else {
    results = await searchWikipedia(query);
  }

  // Fetch top 3 URLs for deeper content (snippet-extracted)
  const topUrls = results.slice(0, 3);
  const fetchPromises = topUrls.map(async (r) => {
    const content = await fetchUrlContent(r.url);
    return { idx: results.indexOf(r), content };
  });
  const fetchedContents = await Promise.all(fetchPromises);
  
  let fetchedContent = '';
  for (const fc of fetchedContents) {
    if (fc.content) {
      const snippet = extractRelevantSnippets(fc.content, query, 2000);
      fetchedContent += `\n--- Content from [${fc.idx + 1}] (${results[fc.idx].url}) ---\n${snippet}\n`;
    }
  }

  return { results, fetchedContent };
}

let lastSearchResults: SearchResult[] = [];
export function getLastSearchResults(): SearchResult[] { return [...lastSearchResults]; }

export async function* streamChat(
  messages: { role: 'user' | 'assistant' | 'model', content: string; imageUrl?: string }[],
  config: LLMConfig,
  activeFeature: FeatureId | null,
  signal?: AbortSignal,
  responseMode: ResponseMode = 'normal'
): AsyncGenerator<string, void, unknown> {
  let systemPrompt = "You are MILO, an advanced AI assistant tailored for productivity and deep work.";
  if (activeFeature && FEATURE_PROMPTS[activeFeature]) {
    systemPrompt = FEATURE_PROMPTS[activeFeature];
  } else {
    systemPrompt += TOOL_GATE_PROMPT;
  }

  const MODE_PROMPTS: Record<Exclude<ResponseMode, 'normal'>, string> = {
    'fast': 'You are in Fast Mode. Be extremely concise. Answer in 1-3 sentences max. No greetings, no filler, no disclaimers. Just the answer.',
    'deep-reasoning': 'Think step-by-step. First, analyze the problem carefully. Second, list possible approaches. Third, evaluate tradeoffs and edge cases. Finally, provide your conclusion. Show your full reasoning process.',
    'deep-thinking': 'Provide a comprehensive, multi-perspective analysis. Consider: historical context, alternative viewpoints, long-term implications, edge cases, and counterarguments. Structure your response with clear headings and nuanced reasoning. Do not oversimplify.',
  };

  const modelName = config.provider === 'gemini'
    ? (config.geminiModel || 'gemini-2.5-flash')
    : config.provider === 'openai'
    ? (config.openaiModel || 'gpt-4o')
    : config.provider === 'anthropic'
    ? (config.anthropicModel || 'claude-3-5-sonnet-latest')
    : (config.customModelName || 'gpt-3.5-turbo');

  const isCapableModel = /gemini.*2\.5|claude.*3\.5.*sonnet|claude.*opus/i.test(modelName);

  if (responseMode !== 'normal' && MODE_PROMPTS[responseMode]) {
    if (responseMode === 'deep-reasoning' && isCapableModel) {
      // Skip CoT for capable models that reason internally
      systemPrompt += '\n\nProvide a thorough, well-structured analysis.';
    } else {
      systemPrompt += '\n\n' + MODE_PROMPTS[responseMode];
    }
  }

  const facts = getFactsPrompt();
  if (facts) systemPrompt += facts;

  // Pre-process Deep Search for non-Gemini models
  let processedMessages = [...messages];
  let searchResults: SearchResult[] = [];
  const searchStatusUpdates: string[] = [];
  if (activeFeature === 'deep-search' && config.provider !== 'gemini') {
    if (messages.length === 0) throw new Error("No message history to search for.");
    const latestQuery = messages[messages.length - 1].content;

    // Route query — skip search if answer can be direct
    const route = await routeQuery(latestQuery, config);
    if (!route.needsSearch && !route.needsRAG) {
      yield "<!--SEARCH_STATUS:💡 Direct answer mode — no external search needed-->";
      searchResults = [];
      lastSearchResults = searchResults;
    } else {
      const backend = config.searchBackend || 'searxng';
      
      const deepSearch = performDeepSearch(latestQuery, backend, config.searxngUrl, signal);
      for await (const event of deepSearch) {
        searchStatusUpdates.push(event.message);
        if (event.type === 'search' || event.type === 'status' || event.type === 'followup') {
          yield `<!--SEARCH_STATUS:${event.message}-->`;
        } else if (event.type === 'done') {
          searchResults = event.results || [];
          lastSearchResults = searchResults;
          const enrichedPrompt = event.fetchedContent
            ? `Here is relevant web information with full page content:\n\n${formatResults(searchResults)}\n\n${event.fetchedContent}\n\nUser Query: ${latestQuery}`
            : `Here are the web search results:\n\n${formatResults(searchResults)}\n\nUser Query: ${latestQuery}`;
          processedMessages[processedMessages.length - 1] = { ...processedMessages[processedMessages.length - 1], content: enrichedPrompt };
        }
      }
    }

    if (searchResults.length === 0) {
      yield "<!--SEARCH_STATUS:⚠️ No results found, answering from knowledge base...-->";
    }
  }

  try {
    if (config.provider === 'gemini') {
      let gkey = config.geminiKey;
      if (!gkey) {
        gkey = (import.meta as any).env?.VITE_GEMINI_API_KEY;
      }
      if (!gkey) throw new Error("Gemini API key is missing. Please add it in settings or provide VITE_GEMINI_API_KEY.");
      
      const client = new GoogleGenAI({ apiKey: gkey });
      const isDeepSearch = activeFeature === 'deep-search';
      
      // Convert history
      const historyItems = messages.slice(0, -1).map(m => {
        const parts: any[] = [{ text: m.content }];
        if ((m as any).imageUrl) {
          const base64 = (m as any).imageUrl.replace(/^data:image\/\w+;base64,/, '');
          const mimeType = (m as any).imageUrl.match(/data:(image\/\w+);/)?.[1] || 'image/jpeg';
          parts.push({ inlineData: { mimeType, data: base64 } });
        }
        return {
          role: m.role === 'assistant' ? 'model' : m.role,
          parts
        };
      });
      const latestMsg = messages[messages.length - 1].content;
      const latestParts: any[] = [{ text: latestMsg }];
      const latestImg = (messages[messages.length - 1] as any).imageUrl;
      if (latestImg) {
        const base64 = latestImg.replace(/^data:image\/\w+;base64,/, '');
        const mimeType = latestImg.match(/data:(image\/\w+);/)?.[1] || 'image/jpeg';
        latestParts.push({ inlineData: { mimeType, data: base64 } });
      }

      const chat = client.chats.create({
          model: isDeepSearch ? "gemini-2.5-pro" : (config.geminiModel || "gemini-2.5-flash"),
          config: {
            systemInstruction: systemPrompt,
            tools: isDeepSearch ? [{ googleSearch: {} }] : undefined,
            temperature: responseMode === 'fast' ? 0.1 : responseMode === 'deep-thinking' ? 0.8 : responseMode === 'deep-reasoning' ? 0.7 : undefined,
            maxOutputTokens: responseMode === 'fast' ? 500 : undefined,
          },
          history: historyItems as any
      });

      const responseStream = await chat.sendMessageStream({ message: latestParts });
      for await (const chunk of responseStream) {
        if (signal?.aborted) throw new Error("Aborted");
        yield (chunk as any).text || '';
      }
    } else if (config.provider === 'openai' || config.provider === 'custom') {
      const isCustom = config.provider === 'custom';
      const apiKey = isCustom ? config.customApiKey || 'dummy-key' : config.openaiKey;
      const baseURL = isCustom ? config.customBaseUrl || undefined : undefined;
      const modelName = isCustom ? config.customModelName || 'gpt-3.5-turbo' : (config.openaiModel || 'gpt-4o');

      if (!isCustom && !config.openaiKey) throw new Error("OpenAI API key is required. Please add it in Settings.");
      if (isCustom && !config.customBaseUrl) throw new Error("Custom Base URL is required. Please add it in Settings.");

      const client = new OpenAI({ 
        apiKey, 
        baseURL, 
        dangerouslyAllowBrowser: true,
        fetch: async (url, init) => {
          const finalHeaders: Record<string, string> = {};
          
          if (init?.headers) {
            if (init.headers instanceof Headers) {
              init.headers.forEach((value, key) => {
                finalHeaders[key] = value;
              });
            } else if (Array.isArray(init.headers)) {
              init.headers.forEach(([key, value]) => {
                finalHeaders[key] = value;
              });
            } else {
              Object.assign(finalHeaders, init.headers);
            }
          }

          if (apiKey) {
            finalHeaders['Authorization'] = `Bearer ${apiKey}`;
            // Remove lowercase version if it exists to avoid duplicates
            delete finalHeaders['authorization'];
          }

          return fetch('/api/proxy', {
            method: init?.method || 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              targetUrl: url.toString(),
              method: init?.method,
              headers: finalHeaders,
              body: typeof init?.body === 'string' ? JSON.parse(init.body) : init?.body
            })
          });
        }
      });
      
      const apiMessages = [
        { role: 'system', content: systemPrompt },
        ...processedMessages.map(m => {
          const msg: any = { role: m.role === 'model' ? 'assistant' : m.role };
          const isTextOnly = modelName.toLowerCase().includes('llama-3.1') || modelName.toLowerCase().includes('llama-3.3') || modelName.toLowerCase().includes('deepseek-chat') || modelName.toLowerCase().includes('o1-preview') || modelName.toLowerCase().includes('o1-mini');
          if ((m as any).imageUrl && !isTextOnly) {
            msg.content = [
              { type: 'text', text: m.content },
              { type: 'image_url', image_url: { url: (m as any).imageUrl } }
            ];
          } else {
            msg.content = m.content;
          }
          return msg;
        })
      ];

      const stream = await client.chat.completions.create({
        model: modelName,
        messages: apiMessages as any,
        stream: true,
        temperature: responseMode === 'fast' ? 0.1 : responseMode === 'deep-thinking' ? 0.8 : responseMode === 'deep-reasoning' ? 0.7 : undefined,
        max_tokens: responseMode === 'fast' ? 500 : undefined,
      }, { signal });

      for await (const chunk of stream) {
        if (signal?.aborted) throw new Error("Aborted");
        const text = chunk.choices[0]?.delta?.content || '';
        if (text) yield text;
      }
    } else if (config.provider === 'anthropic') {
      if (!config.anthropicKey) throw new Error("Anthropic API key is required. Please add it in Settings.");
      const client = new Anthropic({ 
        apiKey: config.anthropicKey, 
        dangerouslyAllowBrowser: true,
        fetch: async (url, init) => {
          return fetch('/api/proxy', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              targetUrl: url.toString(),
              method: init?.method,
              headers: init?.headers,
              body: typeof init?.body === 'string' ? JSON.parse(init.body) : init?.body
            })
          });
        }
      });
      
      const stream = await client.messages.create({
        model: config.anthropicModel || 'claude-3-5-sonnet-latest',
        system: systemPrompt,
        messages: processedMessages.map(m => {
          const msg: any = { role: m.role === 'model' ? 'assistant' : m.role };
          if ((m as any).imageUrl) {
            const base64 = (m as any).imageUrl.replace(/^data:image\/\w+;base64,/, '');
            const mimeType = (m as any).imageUrl.match(/data:(image\/[\w]+);/)?.[1] || 'image/jpeg';
            msg.content = [
              { type: 'text', text: m.content },
              { type: 'image', source: { type: 'base64', media_type: mimeType, data: base64 } }
            ];
          } else {
            msg.content = m.content;
          }
          return msg;
        }),
        max_tokens: responseMode === 'fast' ? 500 : 4096,
        temperature: responseMode === 'fast' ? 0.1 : responseMode === 'deep-thinking' ? 0.8 : responseMode === 'deep-reasoning' ? 0.7 : undefined,
        stream: true,
      }, { signal });

      for await (const event of stream) {
        if (signal?.aborted) throw new Error("Aborted");
        if (event.type === 'content_block_delta' && 'text' in event.delta) {
          yield event.delta.text || '';
        }
      }
    }
  } catch (err: any) {
    console.error("LLM Engine Error:", err);
    if (err.message === 'Failed to fetch' || err instanceof TypeError) {
      throw new Error("Network/CORS error. Check your internet connection or try a different provider. If using a corporate network, try OpenAI/Anthropic instead.");
    }
    throw err;
  }
}
