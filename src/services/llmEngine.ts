import { GoogleGenAI } from '@google/genai';
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { FeatureId } from '../core/types';

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

const FEATURE_PROMPTS: Record<FeatureId, string> = {
  'deep-search': `You are MILO Deep Search Engine. Explore the topic exhaustively. Break down complex subjects into structured, detailed analysis. Provide pros/cons, historical context, and future outlooks. You have been provided with live web search results below — use them to ground your response. Cite sources using [1], [2], [3] markers inline when referencing specific facts from the search data.`,
  'code-gen': `You are MILO Code Engine. Provide expert-level, production-ready code. When the user asks for Python code that can be executed, always provide it in a \`\`\`python code block. Include all necessary imports. Use print() for output instead of returning values. For data visualization, use matplotlib and call plt.show() to display plots. Keep code self-contained and runnable. Include brief explanations before code blocks.`,
  'doc-analysis': `You are MILO Document Analyzer. Extract key insights, summarize core arguments, and highlight important metrics or quotes from the user's input. Structure your response with headings, bullet points, and an executive summary.`
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

async function searchSearXNG(query: string, baseUrl: string): Promise<SearchResult[]> {
  const res = await fetch(`${baseUrl}/search?q=${encodeURIComponent(query)}&format=json&categories=general`);
  if (!res.ok) return [];
  const data = await res.json();
  return (data.results || []).slice(0, 8).map((r: any) => ({
    title: r.title || '',
    url: r.url || '',
    snippet: r.content || '',
    source: r.engine || 'SearXNG'
  }));
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

export async function performSearch(query: string, backend: 'duckduckgo' | 'searxng' | 'unsearch' = 'duckduckgo', searxngUrl?: string): Promise<{ results: SearchResult[]; fetchedContent: string }> {
  let results: SearchResult[] = [];

  if (backend === 'searxng' && searxngUrl) {
    results = await searchSearXNG(query, searxngUrl);
    if (results.length === 0) {
      results = await searchDuckDuckGo(query);
    }
  } else {
    results = await searchDuckDuckGo(query);
    if (results.length === 0) {
      results = await searchWikipedia(query);
    }
  }

  // Fetch top 3 URLs for deeper content
  const topUrls = results.slice(0, 3);
  const fetchPromises = topUrls.map(async (r) => {
    const content = await fetchUrlContent(r.url);
    return { idx: results.indexOf(r), content };
  });
  const fetchedContents = await Promise.all(fetchPromises);
  
  let fetchedContent = '';
  for (const fc of fetchedContents) {
    if (fc.content) {
      fetchedContent += `\n--- Content from [${fc.idx + 1}] (${results[fc.idx].url}) ---\n${fc.content.slice(0, 4000)}\n`;
    }
  }

  return { results, fetchedContent };
}

export async function* streamChat(
  messages: { role: 'user' | 'assistant' | 'model', content: string; imageUrl?: string }[],
  config: LLMConfig,
  activeFeature: FeatureId | null,
  signal?: AbortSignal
): AsyncGenerator<string, void, unknown> {
  let systemPrompt = "You are MILO, an advanced AI assistant tailored for productivity and deep work.";
  if (activeFeature && FEATURE_PROMPTS[activeFeature]) {
    systemPrompt = FEATURE_PROMPTS[activeFeature];
  }

  // Pre-process Deep Search for non-Gemini models
  let processedMessages = [...messages];
  if (activeFeature === 'deep-search' && config.provider !== 'gemini') {
    const latestQuery = messages[messages.length - 1].content;
    const backend = config.searchBackend || 'duckduckgo';
    
    yield "🔍 Searching the web...\n\n";
    const { results, fetchedContent } = await performSearch(latestQuery, backend, config.searxngUrl);
    
    let statusMsg = '';
    if (results.length > 0) {
      statusMsg = `Found ${results.length} results`;
      if (fetchedContent) {
        statusMsg += `. Reading top pages...\n\n`;
        yield `📄 ${statusMsg}`;
      } else {
        statusMsg += `\n\n`;
        yield `✅ ${statusMsg}`;
      }
    } else {
      yield "⚠️ No results found, answering from knowledge base...\n\n";
    }

    const searchSection = fetchedContent
      ? `Here is relevant web information with full page content:\n\n${formatResults(results)}\n\n${fetchedContent}`
      : `Here are the web search results:\n\n${formatResults(results)}`;
    
    const enrichedPrompt = `${searchSection}\n\nUser Query: ${latestQuery}`;
    processedMessages[processedMessages.length - 1] = { ...processedMessages[processedMessages.length - 1], content: enrichedPrompt };
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
          if ((m as any).imageUrl) {
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
        max_tokens: 4096,
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
