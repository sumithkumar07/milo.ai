import { GoogleGenAI } from '@google/genai';
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { FeatureId } from '../types';

export type ModelProvider = 'gemini' | 'openai' | 'anthropic' | 'custom';

export interface LLMConfig {
  provider: ModelProvider;
  geminiKey?: string;
  openaiKey?: string;
  anthropicKey?: string;
  customBaseUrl?: string;
  customApiKey?: string;
  customModelName?: string;
}

const FEATURE_PROMPTS: Record<FeatureId, string> = {
  'deep-search': `You are MILO Deep Search Engine. Explore the topic exhaustively. Break down complex subjects into structured, detailed analysis. Provide pros/cons, historical context, and future outlooks. If you have access to search tools, use them to find live data. Otherwise, simulate a deep dive from your extensive knowledge base.`,
  'code-gen': `You are MILO Code Engine. Provide expert-level, production-ready code. Focus on modularity, security, and performance. Include brief explanations before code blocks, and always use markdown code formatting with language tags.`,
  'doc-analysis': `You are MILO Document Analyzer. Extract key insights, summarize core arguments, and highlight important metrics or quotes from the user's input. Structure your response with headings, bullet points, and an executive summary.`
};

export async function performSearch(query: string): Promise<string> {
  const results: string[] = [];

  // 1. Wikipedia (General Knowledge & Current Events)
  try {
    const wikiRes = await fetch(`https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&utf8=&format=json&origin=*`);
    if (wikiRes.ok) {
      const data = await wikiRes.json();
      if (data.query?.search && data.query.search.length > 0) {
        results.push("### Encyclopedia Data\n" + data.query.search.slice(0, 3).map((r: any) => `- **${r.title}**: ${r.snippet.replace(/<\/?[^>]+(>|$)/g, "")}`).join('\n'));
      }
    }
  } catch (e) {
    console.error('Wiki search failed:', e);
  }

  // 2. CrossRef (Academic, Research & Scientific Papers)
  try {
    const crRes = await fetch(`https://api.crossref.org/works?query=${encodeURIComponent(query)}&select=title,abstract,author&rows=3`);
    if (crRes.ok) {
      const data = await crRes.json();
      if (data.message?.items && data.message.items.length > 0) {
        results.push("### Academic & Scientific Journals\n" + data.message.items.map((r: any) => {
           const authorStr = r.author ? r.author.map((a: any) => a.family).join(', ') : 'Unknown Authors';
           const abstractStr = r.abstract ? r.abstract.replace(/<\/?[^>]+(>|$)/g, "").replace(/\n/g, ' ') : "No abstract available";
           return `- **${r.title?.[0]}** by ${authorStr}\n  Abstract: ${abstractStr}`;
        }).join('\n'));
      }
    }
  } catch (e) {
    console.error('Crossref search failed:', e);
  }

  if (results.length === 0) return 'No web results found. The topic might be too narrow or the open APIs are temporarily unreachable.';
  
  return results.join('\n\n');
}

export async function* streamChat(
  messages: { role: 'user' | 'assistant' | 'model', content: string }[],
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
    yield "🔍 Searching the web...\n\n";
    const searchData = await performSearch(latestQuery);
    const enrichedPrompt = `Here is recent web information that may be relevant to the user's query:\n\n${searchData}\n\nUser Query: ${latestQuery}`;
    processedMessages[processedMessages.length - 1] = { ...processedMessages[processedMessages.length - 1], content: enrichedPrompt };
  }

  try {
    if (config.provider === 'gemini') {
      let gkey = config.geminiKey;
      if (!gkey) {
        gkey = (import.meta as any).env?.VITE_GEMINI_API_KEY || (process as any).env?.GEMINI_API_KEY;
      }
      if (!gkey) throw new Error("Gemini API key is missing. Please add it in settings or provide VITE_GEMINI_API_KEY.");
      
      const client = new GoogleGenAI({ apiKey: gkey });
      const isDeepSearch = activeFeature === 'deep-search';
      
      // Convert history
      const historyItems = messages.slice(0, -1).map(m => ({
        role: m.role === 'assistant' ? 'model' : m.role,
        parts: [{ text: m.content }]
      }));
      const latestMsg = messages[messages.length - 1].content;

      const chat = client.chats.create({
          model: isDeepSearch ? "gemini-2.5-pro" : "gemini-2.5-flash",
          config: {
            systemInstruction: systemPrompt,
            tools: isDeepSearch ? [{ googleSearch: {} }] : undefined,
          },
          history: historyItems as any
      });

      const responseStream = await chat.sendMessageStream({ message: latestMsg });
      for await (const chunk of responseStream) {
        if (signal?.aborted) throw new Error("Aborted");
        yield (chunk as any).text || '';
      }
    } else if (config.provider === 'openai' || config.provider === 'custom') {
      const isCustom = config.provider === 'custom';
      const apiKey = isCustom ? config.customApiKey || 'dummy-key' : config.openaiKey;
      const baseURL = isCustom ? config.customBaseUrl || undefined : undefined;
      const modelName = isCustom ? config.customModelName || 'gpt-3.5-turbo' : 'gpt-4o';

      if (!isCustom && !config.openaiKey) throw new Error("OpenAI API key is required. Please add it in Settings.");
      if (isCustom && !config.customBaseUrl) throw new Error("Custom Base URL is required. Please add it in Settings.");

      const client = new OpenAI({ 
        apiKey, 
        baseURL, 
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
      
      const apiMessages = [
        { role: 'system', content: systemPrompt },
        ...processedMessages.map(m => ({ role: m.role === 'model' ? 'assistant' : m.role, content: m.content }))
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
        model: 'claude-3-5-sonnet-latest',
        system: systemPrompt,
        messages: processedMessages.map(m => ({ role: m.role === 'model' ? 'assistant' : m.role as any, content: m.content })),
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
    throw err;
  }
}
