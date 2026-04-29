import React, { useRef, useEffect, useState } from 'react';
import { Sparkles, CheckCircle2, Loader2, Circle, Download } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import ChatInput from '../components/ChatInput';
import { FeatureId, Message } from '../types';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface ActiveChatViewProps {
  activeFeature: FeatureId | null;
  setActiveFeature: (feature: FeatureId | null) => void;
  messages: Message[];
  isLoading: boolean;
  onSendMessage: (msg: string) => void;
}

function CodeBlock({ node, inline, className, children, ...props }: any) {
  const match = /language-(\w+)/.exec(className || '');
  const language = match ? match[1] : '';
  const code = String(children).replace(/\n$/, '');
  const [showPreview, setShowPreview] = useState(false);

  if (!inline && language === 'html') {
    return (
      <div className="my-4 border border-outline rounded-xl overflow-hidden bg-surface">
        <div className="flex border-b border-outline">
          <button 
            onClick={() => setShowPreview(false)}
            className={`px-4 py-2 text-xs font-bold ${!showPreview ? 'bg-surface-hover text-on-surface' : 'text-on-surface-variant'}`}
          >
            Code
          </button>
          <button 
            onClick={() => setShowPreview(true)}
            className={`px-4 py-2 text-xs font-bold ${showPreview ? 'bg-surface-hover text-on-surface' : 'text-on-surface-variant'}`}
          >
            Preview
          </button>
        </div>
        <div className="p-0">
          {showPreview ? (
            <div className="bg-white p-2 min-h-[400px]">
               <iframe srcDoc={code} className="w-full min-h-[400px] border-none" sandbox="allow-scripts allow-modals" />
            </div>
          ) : (
            <pre className={`p-4 ${className}`} {...props}>
              <code>{children}</code>
            </pre>
          )}
        </div>
      </div>
    );
  }

  return (
    <pre className={className} {...props}>
      <code>{children}</code>
    </pre>
  );
}

export default function ActiveChatView({ activeFeature, setActiveFeature, messages, isLoading, onSendMessage }: ActiveChatViewProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const { preferences } = useAppContext();

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const exportChat = () => {
    const text = messages.map(m => `**${m.role === 'user' ? 'You' : 'MILO'}**: ${m.content}`).join('\n\n---\n\n');
    const blob = new Blob([text], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `chat-export-${Date.now()}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col h-full max-w-[800px] mx-auto pt-4 pb-32">
      <div className="flex justify-end mb-6">
        <button 
          onClick={exportChat}
          className="flex items-center gap-2 px-4 py-2 bg-surface hover:bg-surface-hover border border-outline rounded-lg text-xs font-bold text-on-surface-variant hover:text-on-surface transition-colors"
        >
          <Download className="w-4 h-4" /> Export Chat
        </button>
      </div>
      <div className={`flex flex-col ${preferences.compactMode ? 'gap-3' : 'gap-8'}`}>
      <AnimatePresence initial={false}>
        {messages.map((message) => (
          message.role === 'user' ? (
            <div key={message.id} className="flex justify-end w-full">
              <motion.div 
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                className={`max-w-[85%] bg-surface/80 backdrop-blur-md border border-white/5 shadow-sm
                  ${preferences.compactMode ? 'rounded-xl px-4 py-2 text-sm' : 'rounded-2xl rounded-tr-sm px-5 py-4'}
                `}
              >
                <div className="text-on-background whitespace-pre-wrap">{message.content}</div>
              </motion.div>
            </div>
          ) : (
            <div key={message.id} className="flex w-full gap-4 items-start">
              <div className={`flex-shrink-0 flex items-center justify-center bg-surface border border-outline mt-1
                ${preferences.compactMode ? 'w-6 h-6 rounded-md' : 'w-8 h-8 rounded-full'}
              `}>
                <Sparkles className={`text-primary ${preferences.compactMode ? 'w-3.5 h-3.5' : 'w-5 h-5'}`} />
              </div>
              
              <div className="flex-1 flex flex-col gap-6">
                {message.isStreaming && message.content === '' && (
                  <div className={`max-w-2xl opacity-30 ${preferences.compactMode ? 'space-y-2 mt-1' : 'space-y-3 mt-2'}`}>
                    <div className="h-3.5 bg-outline rounded-full w-full animate-pulse" />
                    <div className="h-3.5 bg-outline rounded-full w-[94%] animate-pulse" />
                    <div className="h-3.5 bg-outline rounded-full w-[80%] animate-pulse" />
                  </div>
                )}
                {message.content && (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`prose prose-invert prose-p:leading-relaxed prose-pre:bg-surface prose-pre:border-outline max-w-none text-on-background w-full overflow-hidden
                      ${preferences.compactMode ? 'prose-sm' : ''}
                    `}
                  >
                    <Markdown 
                      remarkPlugins={[remarkGfm]}
                      components={{ code: CodeBlock as any }}
                    >
                      {message.content}
                    </Markdown>
                  </motion.div>
                )}
              </div>
            </div>
          )
        ))}
      </AnimatePresence>
      </div>
      <div ref={bottomRef} />

      {/* Persistent Input at bottom */}
      <div className="fixed bottom-0 left-0 md:left-72 right-0 p-4 md:p-8 flex justify-center pointer-events-none z-50">
        <div className="w-full max-w-[800px] pointer-events-auto">
          <ChatInput 
            activeFeature={activeFeature} 
            onRemoveFeature={() => setActiveFeature(null)} 
            onSend={onSendMessage}
          />
        </div>
      </div>
    </div>
  );
}
