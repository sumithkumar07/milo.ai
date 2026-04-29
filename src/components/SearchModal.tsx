import React, { useEffect, useRef, useState } from 'react';
import { Search, X, MessageSquare } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useAppContext } from '../store';

interface SearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectSession?: (id: string) => void;
}

export default function SearchModal({ isOpen, onClose, onSelectSession }: SearchModalProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const { sessions } = useAppContext();

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
      setQuery('');
    }
  }, [isOpen]);

  const results = sessions.filter(s => s.title.toLowerCase().includes(query.toLowerCase()) || s.messages.some(m => m.content.toLowerCase().includes(query.toLowerCase()))).slice(0, 5);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -20 }}
            className="fixed top-24 left-1/2 -translate-x-1/2 w-full max-w-2xl bg-surface border border-outline rounded-2xl shadow-2xl z-50 overflow-hidden"
          >
            <div className="flex items-center gap-3 p-4 border-b border-outline">
              <Search className="w-5 h-5 text-on-surface-variant" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Search MILO..."
                className="flex-1 bg-transparent border-none text-on-background focus:outline-none placeholder:text-on-surface-variant"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === 'Escape') onClose();
                }}
              />
              <button 
                onClick={onClose}
                className="p-1 text-on-surface-variant hover:text-primary transition-colors rounded-lg bg-surface-hover"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 bg-surface/50 max-h-64 overflow-y-auto">
              {query.length > 0 ? (
                <p className="text-xs text-on-surface-variant uppercase tracking-wider font-semibold mb-3">Search Results</p>
              ) : (
                <p className="text-xs text-on-surface-variant uppercase tracking-wider font-semibold mb-3">Recent Searches</p>
              )}
              <div className="space-y-1">
                {results.map(session => (
                  <button key={session.id} onClick={() => {
                    if (onSelectSession) onSelectSession(session.id);
                    onClose();
                  }} className="w-full text-left px-3 py-2 text-sm text-on-background hover:bg-surface-hover rounded-lg transition-colors flex items-center gap-3">
                    <MessageSquare className="w-3.5 h-3.5 text-on-surface-variant" />
                    {session.title}
                  </button>
                ))}
                {results.length === 0 && (
                  <div className="text-sm text-on-surface-variant py-4 px-3">No results found for "{query}"</div>
                )}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
