/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import Layout from './components/Layout';
import HomeView from './views/HomeView';
import ActiveChatView from './views/ActiveChatView';
import LibraryView from './views/LibraryView';
import SettingsView from './views/SettingsView';
import ProfileView from './views/ProfileView';
import SubscriptionView from './views/SubscriptionView';
import HelpView from './views/HelpView';
import { ViewType, FeatureId, Message } from './types';
import { AnimatePresence, motion } from 'motion/react';
import { streamChat } from './services/llmEngine';
import { useAppContext } from './store';

export default function App() {
  const { messages, addMessage, updateMessage, currentSessionId, preferences } = useAppContext();
  const [view, setView] = useState<ViewType>('home');
  const [pinnedFeatures, setPinnedFeatures] = useState<FeatureId[]>(['deep-search']);
  const [activeFeature, setActiveFeature] = useState<FeatureId | null>(null);
  
  const [isLoading, setIsLoading] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Sync theme to document element
  useEffect(() => {
    if (preferences.theme === 'light') {
      document.documentElement.classList.remove('dark');
      document.documentElement.classList.add('light');
    } else {
      document.documentElement.classList.add('dark');
      document.documentElement.classList.remove('light');
    }
  }, [preferences.theme]);

  const sendMessage = async (text: string) => {
    if (!text.trim()) return;

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    const newMessage: Message = { id: Date.now().toString(), role: 'user', content: text };
    addMessage(newMessage);
    setView('active-chat');
    setIsLoading(true);

    const modelMessageId = (Date.now() + 1).toString();
    addMessage({ id: modelMessageId, role: 'model', content: '', isStreaming: true });

    try {
      const messagesForEngine = [...messages, newMessage];
      const engineStream = streamChat(
        messagesForEngine, 
        {
          provider: preferences.activeProvider,
          geminiKey: preferences.geminiKey,
          openaiKey: preferences.openaiKey,
          anthropicKey: preferences.anthropicKey,
          customBaseUrl: preferences.customBaseUrl,
          customApiKey: preferences.customApiKey,
          customModelName: preferences.customModelName
        },
        activeFeature,
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

  const renderView = () => {
    switch (view) {
      case 'home':
        return <HomeView activeFeature={activeFeature} setActiveFeature={setActiveFeature} setView={setView} onSendMessage={sendMessage} />;
      case 'active-chat':
        return <ActiveChatView activeFeature={activeFeature} setActiveFeature={setActiveFeature} messages={messages} isLoading={isLoading} onSendMessage={sendMessage} />;

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
        >
          {renderView()}
        </motion.div>
      </AnimatePresence>
    </Layout>
  );
}
