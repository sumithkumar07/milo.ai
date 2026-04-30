import React from 'react';
import { Sparkles, FileText, Code, Search, Key, Settings } from 'lucide-react';
import ChatInput from '../components/chat/ChatInput';
import { motion } from 'motion/react';
import { FeatureId, ViewType } from '../core/types';
import { FEATURES } from '../features/features';
import { useAppContext } from '../core/store';

interface HomeViewProps {
  activeFeature: FeatureId | null;
  setActiveFeature: (feature: FeatureId | null) => void;
  setView: (view: ViewType) => void;
  onSendMessage: (msg: string, overrideFeature?: FeatureId, imageUrl?: string) => void;
}

export default function HomeView({ activeFeature, setActiveFeature, setView, onSendMessage }: HomeViewProps) {
  const { preferences } = useAppContext();

  const suggestions = [
    {
      title: "Help me with a document",
      desc: "Upload a document, PDF, or paste text to get a concise breakdown.",
      icon: FileText,
      color: "text-blue-400",
      prompt: "I need help analyzing a document. I will attach it next.",
      feature: 'doc-analysis' as FeatureId
    },
    {
      title: "Write a code snippet",
      desc: "Describe what you need and I'll generate production-ready code.",
      icon: Code,
      color: "text-secondary",
      prompt: "I need help writing code. What would you like me to build or fix?",
      feature: 'code-gen' as FeatureId
    },
    {
      title: "Deep Search 'Latest AI trends'",
      desc: "Analyze real-time data across the web.",
      icon: Search,
      color: "text-secondary",
      prompt: "What topic would you like me to research deeply?",
      feature: 'deep-search' as FeatureId
    },
  ];

  const hasApiKey = preferences.geminiKey || preferences.openaiKey || preferences.anthropicKey || preferences.customApiKey;
  return (
    <div className="flex flex-col items-center justify-start min-h-[calc(100vh-100px)] text-center pt-12 pb-48">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="w-full max-w-[800px] flex flex-col items-center gap-8 md:gap-12"
      >
        <div className="space-y-6">
          <div className="relative inline-block">
            <div className="w-16 h-16 rounded-full bg-surface border border-outline mx-auto shadow-2xl relative overflow-hidden group flex justify-center items-center">
              <Sparkles className="w-8 h-8 text-primary relative z-10" />
            </div>
          </div>

          <div className="space-y-4">
            <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-on-background">
              How can I help you today?
            </h1>
            <p className="text-lg text-on-surface-variant max-w-lg mx-auto leading-relaxed">
              {activeFeature
                ? `Ready for ${FEATURES[activeFeature].name}. Start typing below.`
                : "MILO is ready to assist. Start typing or choose a quick action below."}
            </p>
          </div>

          {!hasApiKey && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="mx-auto max-w-sm mt-4 p-3 bg-primary/10 border border-primary/20 rounded-xl flex items-center justify-between text-left"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                  <Key className="w-4 h-4 text-primary" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-primary">Bring Your Own Key (BYOK)</h4>
                  <p className="text-[10px] text-on-surface-variant font-medium">Add your own API keys for unrestricted access.</p>
                </div>
              </div>
              <button
                onClick={() => setView('settings')}
                className="p-2 hover:bg-primary/20 rounded-lg transition-colors text-primary"
                aria-label="Open settings"
              >
                <Settings className="w-4 h-4" />
              </button>            </motion.div>
          )}
        </div>

        {!activeFeature && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 w-full">
            {suggestions.map((item, i) => (
              <motion.button
                key={i}
                onClick={() => {
                  setActiveFeature(item.feature);
                  onSendMessage(item.prompt, item.feature);
                }}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.2 + i * 0.1, duration: 0.4 }}
                className="text-left p-5 rounded-2xl bg-surface/50 border border-outline hover:border-on-surface-variant hover:bg-surface transition-all group flex flex-col h-full overflow-hidden relative"
              >
                <item.icon className="w-6 h-6 text-on-surface-variant mb-3 group-hover:text-primary transition-colors" />
                <h3 className="text-sm font-semibold text-on-background mb-1">{item.title}</h3>
                <p className="text-xs text-on-surface-variant leading-relaxed line-clamp-2">{item.desc}</p>

                {i === 2 && (
                  <div className="absolute top-0 right-0 p-2 opacity-10 transform scale-150 rotate-12 group-hover:scale-110 transition-transform duration-700 pointer-events-none">
                    <Search className="w-16 h-16 text-secondary" />
                  </div>
                )}
              </motion.button>
            ))}
          </div>
        )}

        <div className="fixed bottom-0 left-0 md:left-72 right-0 p-4 md:p-8 flex justify-center pointer-events-none z-50">
          <div className="w-full max-w-[800px] pointer-events-auto">
            <ChatInput
              activeFeature={activeFeature}
              onRemoveFeature={() => setActiveFeature(null)}
              onSend={(msg, img) => onSendMessage(msg, activeFeature || undefined, img)}
              preferences={{
                activeProvider: preferences.activeProvider,
                geminiKey: preferences.geminiKey,
                openaiKey: preferences.openaiKey,
                customBaseUrl: preferences.customBaseUrl,
                customApiKey: preferences.customApiKey,
              }} />
          </div>
        </div>
      </motion.div>
    </div>

  );
}
