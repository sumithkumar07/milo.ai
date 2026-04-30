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
import { ViewType, FeatureId } from './types';
import { AnimatePresence, motion } from 'motion/react';
import { useAppContext } from './store';
import { useStreamChat } from './useStreamChat';
import { initRAG } from '../services/rag/ragEngine';

export default function App() {
  const { messages, addMessage, updateMessage, truncateAfter, currentSessionId, preferences, getSessionId } = useAppContext();
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

  useEffect(() => {
    if (preferences.theme === 'light') {
      document.documentElement.classList.remove('dark');
      document.documentElement.classList.add('light');
    } else {
      document.documentElement.classList.add('dark');
      document.documentElement.classList.remove('light');
    }
  }, [preferences.theme]);

  const { cancel, sendMessage, regenerateMessage, branchFromEdit } = useStreamChat({
    activeFeature,
    preferences,
    getMessages: () => messagesRef.current,
    addMessage: (msg) => {
      addMessage(msg);
      if (msg.role === 'user') setView('active-chat');
    },
    updateMessage: (id, content, isStreaming, extras) => updateMessage(id, content, isStreaming, extras),
    setIsLoading,
    getSessionId,
  });

  const stopGeneration = () => { cancel(); setIsLoading(false); };

  const handleSendMessage = async (text: string, overrideFeature?: FeatureId, imageUrl?: string) => {
    if (!text.trim() && !imageUrl) return;
    // We need to add the message first so the hook's internal sendMessage can access it
    // But the hook handles message creation internally
    // Let's use the hook's sendMessage directly
    await sendMessage(text, imageUrl, overrideFeature);
  };

  const handleRegenerate = async (messageIndex: number) => {
    await regenerateMessage(messagesRef.current, messageIndex);
  };

  const handleBranchEdit = async (messageIndex: number, newContent: string) => {
    truncateAfter(messagesRef.current[messageIndex]?.id);
    await branchFromEdit(messagesRef.current, messageIndex, newContent);
  };

  const renderView = () => {
    switch (view) {
      case 'home':
        return <HomeView activeFeature={activeFeature} setActiveFeature={setActiveFeature} setView={setView} onSendMessage={handleSendMessage} />;
      case 'active-chat':
        return <ActiveChatView activeFeature={activeFeature} setActiveFeature={setActiveFeature} messages={messages} isLoading={isLoading} onSendMessage={handleSendMessage} onStop={stopGeneration} onRegenerate={handleRegenerate} onBranchEdit={handleBranchEdit} />;
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
        return <HomeView activeFeature={activeFeature} setActiveFeature={setActiveFeature} setView={setView} onSendMessage={handleSendMessage} />;
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
