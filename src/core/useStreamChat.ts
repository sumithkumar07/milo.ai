import { useRef, useCallback } from 'react';
import { streamChat, getLastSearchResults } from '../services/llmEngine';
import { retrieveRelevantChunks, hasStoredDocuments } from '../services/rag/ragEngine';
import { FeatureId, Message } from './types';
import { LLMConfig } from '../services/llmEngine';

interface StreamChatOptions {
  activeFeature: FeatureId | null;
  preferences: {
    activeProvider: string;
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
  };
  getMessages: () => Message[];
  addMessage: (message: Message) => void;
  updateMessage: (id: string, content: string, isStreaming: boolean, extras?: Partial<Omit<Message, 'id' | 'role' | 'content' | 'isStreaming'>>) => void;
  setIsLoading: (loading: boolean) => void;
}

function prefsToConfig(prefs: StreamChatOptions['preferences']): LLMConfig {
  return {
    provider: prefs.activeProvider as LLMConfig['provider'],
    geminiKey: prefs.geminiKey,
    openaiKey: prefs.openaiKey,
    anthropicKey: prefs.anthropicKey,
    customBaseUrl: prefs.customBaseUrl,
    customApiKey: prefs.customApiKey,
    customModelName: prefs.customModelName,
    geminiModel: prefs.geminiModel,
    openaiModel: prefs.openaiModel,
    anthropicModel: prefs.anthropicModel,
    searchBackend: prefs.searchBackend,
    searxngUrl: prefs.searxngUrl,
  };
}

interface ChatMessageInput {
  role: 'user' | 'model';
  content: string;
  imageUrl?: string;
}

async function enrichWithRAG(
  text: string,
  preferences: StreamChatOptions['preferences']
): Promise<{ finalText: string; ragContext: string; ragSources: { name: string; chunkIndex: number; score?: number }[] }> {
  let finalText = text;
  let ragContext = '';
  const ragSources: { name: string; chunkIndex: number; score?: number }[] = [];
  if (hasStoredDocuments()) {
    try {
      const retrieved = await retrieveRelevantChunks(text, 5, {
        provider: preferences.activeProvider,
        geminiKey: preferences.geminiKey,
        openaiKey: preferences.openaiKey,
        customBaseUrl: preferences.customBaseUrl,
        customApiKey: preferences.customApiKey,
      });
      if (retrieved.chunks.length > 0) {
        ragContext = retrieved.chunks.map((c, i) => `[Chunk ${i + 1}] (${retrieved.sources[i] || 'document'})\n${c.text}`).join('\n\n---\n\n');
        ragSources.push(...retrieved.chunks.map((c, i) => ({ name: retrieved.sources[i] || 'unknown', chunkIndex: c.index, score: retrieved.scores[i] })));
        finalText = `You have access to the following document excerpts. Use them to answer the user's question.\n\n${ragContext}\n\n---\n\nUser Question: ${text}`;
      }
    } catch (err) {
      console.error('RAG retrieval failed:', err);
    }
  }
  return { finalText, ragContext, ragSources };
}

function buildEngineMessages(
  history: Message[],
  lastUserContent: string,
  lastUserImage: string | undefined,
  ragContext: string
): ChatMessageInput[] {
  const mapped = history.map(m => ({
    role: m.role as 'user' | 'model',
    content: m.content,
    imageUrl: m.imageUrl
  }));
  if (ragContext) {
    mapped[mapped.length - 1] = { role: 'user' as const, content: lastUserContent, imageUrl: lastUserImage };
  }
  return mapped;
}

async function consumeStream(
  messages: ChatMessageInput[],
  config: LLMConfig,
  feature: FeatureId | null,
  signal: AbortSignal,
  onUpdate: (id: string, text: string, streaming: boolean, extras?: Partial<Message>) => void
): Promise<{ fullText: string; searchStatus: string[] }> {
  const engineStream = streamChat(messages, config, feature, signal);
  let fullText = '';
  const searchStatus: string[] = [];
  const statusPattern = /<!--SEARCH_STATUS:(.*?)-->/g;

  for await (const chunk of engineStream) {
    if (chunk) {
      let processed = chunk;
      let match;
      while ((match = statusPattern.exec(chunk)) !== null) {
        searchStatus.push(match[1]);
        processed = processed.replace(match[0], '');
      }
      statusPattern.lastIndex = 0;
      fullText += processed;
      onUpdate('', fullText, true, searchStatus.length > 0 ? { searchStatus: [...searchStatus] } : undefined);
    }
  }
  return { fullText, searchStatus };
}

export function useStreamChat(options: StreamChatOptions) {
  const abortControllerRef = useRef<AbortController | null>(null);

  const cancel = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  }, []);

  const startStream = useCallback(
    async (
      messages: ChatMessageInput[],
      modelMessageId: string,
      featureOverride?: FeatureId,
      ragSources?: { name: string; chunkIndex: number; score?: number }[]
    ) => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      abortControllerRef.current = new AbortController();
      options.setIsLoading(true);

      try {
        const { fullText, searchStatus } = await consumeStream(
          messages,
          prefsToConfig(options.preferences),
          featureOverride ?? options.activeFeature,
          abortControllerRef.current.signal,
          (_id, text, streaming, extras) => options.updateMessage(modelMessageId, text, streaming, extras)
        );
        const feature = featureOverride ?? options.activeFeature;
        const searchResults = feature === 'deep-search' ? getLastSearchResults() : [];
        const extras: Partial<Message> = {};
        if (searchResults.length > 0) extras.searchResults = searchResults;
        if (searchStatus.length > 0) extras.searchStatus = searchStatus;
        if (ragSources && ragSources.length > 0) extras.ragSources = ragSources;
        options.updateMessage(modelMessageId, fullText, false, Object.keys(extras).length > 0 ? extras : undefined);
      } catch (error: any) {
        if (error.message !== 'Aborted') {
          console.error('Chat error:', error);
          options.updateMessage(modelMessageId, error.message || 'MILO encountered an error. Please try again.', false);
        }
      } finally {
        options.setIsLoading(false);
      }
    },
    [options]
  );

  const sendMessage = useCallback(
    async (text: string, imageUrl?: string, overrideFeature?: FeatureId) => {
      if (!text.trim() && !imageUrl) return;
      cancel();

      const { finalText, ragSources } = await enrichWithRAG(text, options.preferences);
      const newMessage: Message = { id: Date.now().toString(), role: 'user', content: text, imageUrl };
      options.addMessage(newMessage);

      const modelMessageId = (Date.now() + 1).toString();
      options.addMessage({ id: modelMessageId, role: 'model', content: '', isStreaming: true });

      const currentMessages = options.getMessages();
      const engineMessages: ChatMessageInput[] = [
        ...currentMessages.map(m => ({
          role: m.role as 'user' | 'model',
          content: m.content,
          imageUrl: m.imageUrl
        })),
        { role: 'user' as const, content: finalText, imageUrl }
      ];

      startStream(engineMessages, modelMessageId, overrideFeature, ragSources);
    },
    [cancel, options, startStream]
  );

  const regenerateMessage = useCallback(
    async (history: Message[], messageIndex: number) => {
      const targetMessage = history[messageIndex];
      if (!targetMessage || targetMessage.role !== 'model') return;
      cancel();

      const messagesUpToUser = history.slice(0, messageIndex);
      const lastUserMsg = messagesUpToUser.filter(m => m.role === 'user').pop();
      const { finalText, ragSources } = lastUserMsg ? await enrichWithRAG(lastUserMsg.content, options.preferences) : { finalText: '', ragSources: [] };

      options.updateMessage(targetMessage.id, '', true);

      const engineMessages = messagesUpToUser.map(m => {
        const mapped: ChatMessageInput = { role: m.role as 'user' | 'model', content: m.content, imageUrl: m.imageUrl };
        if (finalText && m === lastUserMsg) mapped.content = finalText;
        return mapped;
      });

      startStream(engineMessages, targetMessage.id, undefined, ragSources);
    },
    [cancel, options, startStream]
  );

  const branchFromEdit = useCallback(
    async (history: Message[], messageIndex: number, newContent: string) => {
      const targetMessage = history[messageIndex];
      if (!targetMessage || targetMessage.role !== 'user') return;
      cancel();

      const { finalText, ragSources } = await enrichWithRAG(newContent, options.preferences);
      options.updateMessage(targetMessage.id, newContent, false);

      const modelMessageId = (Date.now() + 1).toString();
      options.addMessage({ id: modelMessageId, role: 'model', content: '', isStreaming: true });

      const engineMessages = history.slice(0, messageIndex + 1).map((m, idx) => {
        if (idx === messageIndex) {
          return { role: m.role as 'user' | 'model', content: finalText, imageUrl: targetMessage.imageUrl } as ChatMessageInput;
        }
        return { role: m.role as 'user' | 'model', content: m.content, imageUrl: m.imageUrl } as ChatMessageInput;
      });

      startStream(engineMessages, modelMessageId, undefined, ragSources);
    },
    [cancel, options, startStream]
  );

  return { cancel, sendMessage, regenerateMessage, branchFromEdit };
}
