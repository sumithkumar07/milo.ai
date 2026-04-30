/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import Layout from '../components/layout/Layout';
import HomeView from '../views/HomeView';
import ActiveChatView from '../views/ActiveChatView';
import LibraryView from '../views/LibraryView';
import SettingsView from '../views/SettingsView';
import ProfileView from '../views/ProfileView';
import SubscriptionView from '../views/SubscriptionView';
import HelpView from '../views/HelpView';
import { ViewType, FeatureId, Message } from './types';
import { AnimatePresence, motion } from 'motion/react';
import { streamChat } from '../services/llmEngine';
import { useAppContext } from './store';
import { retrieveRelevantChunks, hasStoredDocuments, initRAG } from '../services/rag/ragEngine';

export default function App() {
  const { messages, addMessage, updateMessage, truncateAfter, currentSessionId, preferences } = useAppContext();
  const messagesRef = useRef(messages);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    initRAG();
  }, []);

  const [view, setView] = useState<ViewType>('home');
  const [pinnedFeatures, setPinnedFeatures] = useState<FeatureId[]>(() => {
    try {
      const saved = localStorage.getItem('milo_pinned_features');
      return saved ? JSON.parse(saved) : ['deep-search'];
    } catch {
      return ['deep-search'];
    }
  });

  useEffect(() => {
    localStorage.setItem('milo_pinned_features', JSON.stringify(pinnedFeatures));
  }, [pinnedFeatures]);

  const [activeFeature, setActiveFeature] = useState<FeatureId | null>(null);
  const activeFeatureRef = useRef(activeFeature);

  useEffect(() => {
    activeFeatureRef.current = activeFeature;
  }, [activeFeature]);

  const [isLoading, setIsLoading] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (preferences.theme === 'light') {
      document.documentElement.classList.remove('dark');
      document.documentElement.classList.add('light');
    } else {
      document.documentElement.classList.add('dark');
      document.documentElement.classList.remove('light');
    }
  }, [preferences.theme]);

  const stopGeneration = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  };

  const regenerateMessage = async (messageIndex: number) => {
    const targetMessage = messagesRef.current[messageIndex];
    if (!targetMessage || targetMessage.role !== 'model') return;

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    setIsLoading(true);

    const messagesUpToUser = messagesRef.current.slice(0, messageIndex);
    const modelMessageId = targetMessage.id;
    updateMessage(modelMessageId, '', true);

    let finalMessages = messagesUpToUser.map(m => ({
      role: m.role as 'user' | 'model',
      content: m.content,
      imageUrl: m.imageUrl
    }));

    const lastUserMsg = messagesUpToUser.filter(m => m.role === 'user').pop();
    if (lastUserMsg && hasStoredDocuments()) {
      try {
        const retrieved = await retrieveRelevantChunks(lastUserMsg.content, 5, {
          provider: preferences.activeProvider,
          geminiKey: preferences.geminiKey,
          openaiKey: preferences.openaiKey,
          customBaseUrl: preferences.customBaseUrl,
          customApiKey: preferences.customApiKey,
        });
        if (retrieved.chunks.length > 0) {
          const context = retrieved.chunks.map((c, i) => `[Chunk ${i + 1}]\n${c.text}`).join('\n\n---\n\n');
          const enrichedContent = `You have access to the following document excerpts. Use them to answer the user's question.\n\n${context}\n\n---\n\nUser Question: ${lastUserMsg.content}`;
          finalMessages = finalMessages.map(m =>
            m.role === 'user' && m.content === lastUserMsg.content
              ? { ...m, content: enrichedContent }
              : m
          );
        }
      } catch (err) {
        console.error('RAG retrieval failed:', err);
      }
    }

    try {
      const engineStream = streamChat(
        finalMessages,
        {
          provider: preferences.activeProvider,
          geminiKey: preferences.geminiKey,
          openaiKey: preferences.openaiKey,
          anthropicKey: preferences.anthropicKey,
          customBaseUrl: preferences.customBaseUrl,
          customApiKey: preferences.customApiKey,
          customModelName: preferences.customModelName,
          geminiModel: preferences.geminiModel,
          openaiModel: preferences.openaiModel,
          anthropicModel: preferences.anthropicModel,
          searchBackend: preferences.searchBackend,
          searxngUrl: preferences.searxngUrl
        },
        activeFeatureRef.current,
        abortControllerRef.current.signal
      );

      let fullText = '';
      for await (const chunk of await engineStream) {
        if (chunk) {
          fullText += chunk;
          updateMessage(modelMessageId, fullText, true);
        }
      }
      updateMessage(modelMessageId, fullText, false);
    } catch (error: any) {
      if (error.message !== "Aborted") {
        console.error("Regenerate error:", error);
        updateMessage(modelMessageId, error.message || 'MILO encountered an error. Please try again.', false);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const sendMessage = async (text: string, overrideFeature?: FeatureId, imageUrl?: string) => {
    if (!text.trim() && !imageUrl) return;

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    let finalText = text;
    let ragContext = '';
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
          ragContext = retrieved.chunks.map((c, i) => `[Chunk ${i + 1}]\n${c.text}`).join('\n\n---\n\n');
          finalText = `You have access to the following document excerpts. Use them to answer the user's question.\n\n${ragContext}\n\n---\n\nUser Question: ${text}`;
        }
      } catch (err) {
        console.error('RAG retrieval failed:', err);
      }
    }

    const newMessage: Message = { id: Date.now().toString(), role: 'user', content: text, imageUrl };
    addMessage(newMessage);
    setView('active-chat');
    setIsLoading(true);

    const modelMessageId = (Date.now() + 1).toString();
    addMessage({ id: modelMessageId, role: 'model', content: '', isStreaming: true });

    try {
      const messagesForEngine = messagesRef.current.map(m => ({
        role: m.role as 'user' | 'model',
        content: m.content,
        imageUrl: m.imageUrl
      }));
      const lastUserIdx = messagesForEngine.length - 1;
      if (ragContext) {
        messagesForEngine[lastUserIdx] = { role: 'user' as const, content: finalText, imageUrl };
      }
      const engineStream = streamChat(
        messagesForEngine,
        {
          provider: preferences.activeProvider,
          geminiKey: preferences.geminiKey,
          openaiKey: preferences.openaiKey,
          anthropicKey: preferences.anthropicKey,
          customBaseUrl: preferences.customBaseUrl,
          customApiKey: preferences.customApiKey,
          customModelName: preferences.customModelName,
          geminiModel: preferences.geminiModel,
          openaiModel: preferences.openaiModel,
          anthropicModel: preferences.anthropicModel,
          searchBackend: preferences.searchBackend,
          searxngUrl: preferences.searxngUrl
        },
        overrideFeature || activeFeatureRef.current,
        abortControllerRef.current.signal
      );

      let fullText = '';
      for await (const chunk of await engineStream) {
        if (chunk) {
          fullText += chunk;
          updateMessage(modelMessageId, fullText, true);
        }
      }
      updateMessage(modelMessageId, fullText, false);
    } catch (error: any) {
      if (error.message !== "Aborted") {
        console.error("Chat error:", error);
        updateMessage(modelMessageId, error.message || 'MILO encountered an error. Please try again.', false);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const branchFromEdit = async (messageIndex: number, newContent: string) => {
    const targetMessage = messagesRef.current[messageIndex];
    if (!targetMessage || targetMessage.role !== 'user') return;
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    truncateAfter(targetMessage.id);
    updateMessage(targetMessage.id, newContent, false);

    let finalText = newContent;
    if (hasStoredDocuments()) {
      try {
        const retrieved = await retrieveRelevantChunks(newContent, 5, {
          provider: preferences.activeProvider,
          geminiKey: preferences.geminiKey,
          openaiKey: preferences.openaiKey,
          customBaseUrl: preferences.customBaseUrl,
          customApiKey: preferences.customApiKey,
        });
        if (retrieved.chunks.length > 0) {
          const context = retrieved.chunks.map((c, i) => `[Chunk ${i + 1}]\n${c.text}`).join('\n\n---\n\n');
          finalText = `You have access to the following document excerpts. Use them to answer the user's question.\n\n${context}\n\n---\n\nUser Question: ${newContent}`;
        }
      } catch (err) {
        console.error('RAG retrieval failed:', err);
      }
    }

    setIsLoading(true);

    const modelMessageId = (Date.now() + 1).toString();
    addMessage({ id: modelMessageId, role: 'model', content: '', isStreaming: true });

    try {
      const messagesForEngine = messages.slice(0, messageIndex + 1).map((m, idx) => {
        if (idx === messageIndex) {
          return {
            role: m.role as 'user' | 'model',
            content: finalText,
            imageUrl: m.imageUrl || targetMessage.imageUrl
          };
        }
        return {
          role: m.role as 'user' | 'model',
          content: m.content,
          imageUrl: m.imageUrl
        };
      });

      const engineStream = streamChat(
        messagesForEngine,
        {
          provider: preferences.activeProvider,
          geminiKey: preferences.geminiKey,
          openaiKey: preferences.openaiKey,
          anthropicKey: preferences.anthropicKey,
          customBaseUrl: preferences.customBaseUrl,
          customApiKey: preferences.customApiKey,
          customModelName: preferences.customModelName,
          geminiModel: preferences.geminiModel,
          openaiModel: preferences.openaiModel,
          anthropicModel: preferences.anthropicModel,
          searchBackend: preferences.searchBackend,
          searxngUrl: preferences.searxngUrl
        },
        activeFeatureRef.current,
        abortControllerRef.current.signal
      );

      let fullText = '';
      for await (const chunk of await engineStream) {
        if (chunk) {
          fullText += chunk;
          updateMessage(modelMessageId, fullText, true);
        }
      }
      updateMessage(modelMessageId, fullText, false);
    } catch (error: any) {
      if (error.message !== "Aborted") {
        console.error("Branch edit error:", error);
        updateMessage(modelMessageId, error.message || 'MILO encountered an error. Please try again.', false);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const renderView = () => {
    switch (view) {
      case 'home':
        return <HomeView activeFeature={activeFeature} setActiveFeature={setActiveFeature} setView={setView} onSendMessage={sendMessage} />;
      case 'active-chat':
        return <ActiveChatView activeFeature={activeFeature} setActiveFeature={setActiveFeature} messages={messages} isLoading={isLoading} onSendMessage={sendMessage} onStop={stopGeneration} onRegenerate={regenerateMessage} onBranchEdit={branchFromEdit} />;
      case 'library':
        return <LibraryView
          pinnedFeatures={pinnedFeatures}
          setPinnedFeatures={setPinnedFeatures}
          setActiveFeature={setActiveFeature}
          setView={setView}
        />;
      case 'settings':
        return <SettingsView />;
      case 'subscription':
        return <SubscriptionView />;
      case 'help':
        return <HelpView />;
      case 'profile':
        return <ProfileView />;
      default:
        return <HomeView activeFeature={activeFeature} setActiveFeature={setActiveFeature} setView={setView} onSendMessage={sendMessage} />;
    }
  };

  return (
    <Layout
      currentView={view}
      setView={setView}
      pinnedFeatures={pinnedFeatures}
      activeFeature={activeFeature}
      setActiveFeature={setActiveFeature}
    >
      <AnimatePresence mode="wait">
        <motion.div
          key={view}
          initial={{ opacity: 0, x: 10 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -10 }}
          transition={{ duration: 0.3, ease: 'easeInOut' }}
          className="h-full w-full"
        >
          {renderView()}
        </motion.div>
      </AnimatePresence>
    </Layout>
  );
}
