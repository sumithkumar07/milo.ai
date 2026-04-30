import React, { useState, useEffect } from 'react';
import { 
  Palette, 
  Layers, 
  ShieldCheck, 
  Search, 
  Trash2, 
  ChevronDown,
  Smartphone,
  Eye,
  Key,
  Database,
  FileText,
  X,
  Zap
} from 'lucide-react';
import { motion } from 'motion/react';
import { useAppContext } from '../core/store';
import { getIndexedDocumentsInfo, deleteDocument, clearRAG, onRAGStateChange, getRAGState } from '../services/rag/ragEngine';

export default function SettingsView() {
  const { sessions, clearHistory, preferences, updatePreferences } = useAppContext();
  const [searchTerm, setSearchTerm] = useState('');
  const [indexedDocs, setIndexedDocs] = useState<{ name: string; chunks: number }[]>([]);
  const [ragStatus, setRagStatus] = useState<'idle' | 'processing' | 'ready' | 'error'>('idle');
  const [ragProgress, setRagProgress] = useState('');

  useEffect(() => {
    setIndexedDocs(getIndexedDocumentsInfo());
    const state = getRAGState();
    setRagStatus(state.status);
    setRagProgress(state.progress);
    const unsub = onRAGStateChange((s) => {
      setIndexedDocs(getIndexedDocumentsInfo());
      setRagStatus(s.status);
      setRagProgress(s.progress);
    });
    return unsub;
  }, []);

  const recentHistory = sessions.filter(s => s.title.toLowerCase().includes(searchTerm.toLowerCase()));

  return (
    <div className="pt-8 max-w-[1200px] mx-auto">
      <h1 className="text-4xl font-bold mb-10 tracking-tight">
        History & Settings
      </h1>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
        {/* Chat History Section */}
        <section className="lg:col-span-7 space-y-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-bold">Chat History</h2>
            <div className="relative group">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant group-focus-within:text-primary transition-colors" />
              <input 
                type="text" 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 pr-4 py-2 bg-surface border border-outline rounded-full text-sm focus:outline-none focus:border-on-surface-variant w-64 transition-all placeholder:text-on-surface-variant shadow-inner"
                placeholder="Search past conversations..."
              />
            </div>
          </div>

          <div className="space-y-4">
            {recentHistory.slice(0, 10).map((item, i) => (
              <motion.div 
                key={item.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.1 }}
                className="p-6 rounded-2xl bg-surface/50 border border-outline hover:border-on-surface-variant transition-all cursor-pointer group"
              >
                <div className="flex justify-between items-start mb-2 gap-4">
                  <h3 className="font-bold group-hover:text-primary transition-colors line-clamp-1">{item.title}</h3>
                  <span className="text-[10px] font-bold text-tertiary uppercase tracking-widest whitespace-nowrap">{new Date(item.timestamp).toLocaleDateString()}</span>
                </div>
                <p className="text-sm text-on-surface-variant line-clamp-2 mb-4 leading-relaxed">{item.messages.length > 0 ? item.messages[item.messages.length - 1].content.slice(0, 100) + '...' : ''}</p>
                <div className="flex gap-2">
                  {item.tags?.map(tag => (
                    <span key={tag} className="px-2.5 py-1 rounded-md bg-secondary/5 border border-secondary/20 text-secondary text-[10px] font-bold tracking-wider uppercase">
                      {tag}
                    </span>
                  ))}
                </div>
              </motion.div>
            ))}
            {recentHistory.length === 0 && (
              <div className="text-center p-8 text-on-surface-variant">No chat history found.</div>
            )}
          </div>
        </section>

        {/* Preferences Section */}
        <section className="lg:col-span-5 space-y-8">
          <div>
            <h2 className="text-2xl font-bold mb-6">Preferences</h2>
            
            <div className="space-y-4">
              {/* Appearance */}
              <div className="p-6 rounded-3xl bg-surface/50 backdrop-blur-xl border border-outline space-y-6">
                <div className="flex items-center gap-3">
                  <Palette className="w-5 h-5 text-primary" />
                  <h3 className="font-bold">Appearance</h3>
                </div>
                
                <div className="space-y-5">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-on-surface-variant">Theme</span>
                    <button className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-surface border border-outline text-xs font-semibold"
                            onClick={() => updatePreferences({ theme: preferences.theme === 'dark' ? 'light' : 'dark' })}>
                      {preferences.theme === 'dark' ? 'Dark Mode' : 'Light Mode'} <ChevronDown className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="flex justify-between items-center border-t border-outline pt-5">
                    <span className="text-sm text-on-surface-variant">Compact Mode</span>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input 
                        type="checkbox" 
                        className="sr-only peer" 
                        checked={preferences.compactMode}
                        onChange={(e) => updatePreferences({ compactMode: e.target.checked })}
                      />
                      <div className="w-9 h-5 bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary"></div>
                    </label>
                  </div>
                </div>
              </div>

              {/* API Integrations */}
              <div className="p-6 rounded-3xl bg-surface/50 backdrop-blur-xl border border-outline space-y-4">
                <div className="flex items-center gap-3">
                  <Key className="w-5 h-5 text-secondary" />
                  <h3 className="font-bold">API Integrations</h3>
                </div>
                <p className="text-xs text-on-surface-variant leading-relaxed">Manage your external service keys for enhanced model capabilities.</p>
                
                <div className="space-y-4 mt-2 border-b border-outline pb-4">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-on-surface-variant font-medium">Active Model Provider</span>
                    <select
                      value={preferences.activeProvider}
                      onChange={(e) => updatePreferences({ activeProvider: e.target.value as any })}
                      className="bg-surface border border-outline rounded-lg text-xs font-semibold px-3 py-1.5 focus:outline-none focus:border-on-surface-variant cursor-pointer text-on-surface"
                    >
                      <option value="gemini">Google Gemini</option>
                      <option value="openai">OpenAI</option>
                      <option value="anthropic">Anthropic</option>
                      <option value="custom">Custom (OpenAI Compatible)</option>
                    </select>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-on-surface-variant font-medium">Model</span>
                    {preferences.activeProvider === 'gemini' && (
                      <input
                        type="text"
                        value={preferences.geminiModel}
                        onChange={(e) => updatePreferences({ geminiModel: e.target.value })}
                        className="bg-surface border border-outline rounded-lg text-xs font-semibold px-3 py-1.5 focus:outline-none focus:border-on-surface-variant text-on-surface w-48"
                        placeholder="e.g., gemini-2.5-flash"
                      />
                    )}
                    {preferences.activeProvider === 'openai' && (
                      <input
                        type="text"
                        value={preferences.openaiModel}
                        onChange={(e) => updatePreferences({ openaiModel: e.target.value })}
                        className="bg-surface border border-outline rounded-lg text-xs font-semibold px-3 py-1.5 focus:outline-none focus:border-on-surface-variant text-on-surface w-48"
                        placeholder="e.g., gpt-4o"
                      />
                    )}
                    {preferences.activeProvider === 'anthropic' && (
                      <input
                        type="text"
                        value={preferences.anthropicModel}
                        onChange={(e) => updatePreferences({ anthropicModel: e.target.value })}
                        className="bg-surface border border-outline rounded-lg text-xs font-semibold px-3 py-1.5 focus:outline-none focus:border-on-surface-variant text-on-surface w-48"
                        placeholder="e.g., claude-3-5-sonnet-latest"
                      />
                    )}
                  </div>
                </div>

                <div className="space-y-4 mt-2">
                  {preferences.activeProvider === 'custom' && (
                    <div className="space-y-4 mb-4 p-4 rounded-xl border border-primary/20 bg-primary/5">
                      <div className="space-y-2">
                        <label className="text-[10px] font-bold text-tertiary uppercase tracking-widest">Custom Base URL</label>
                        <input 
                          type="text" 
                          value={preferences.customBaseUrl}
                          onChange={(e) => updatePreferences({ customBaseUrl: e.target.value })}
                          placeholder="e.g., https://api.groq.com/openai/v1"
                          className="w-full bg-surface-hover border border-outline rounded-xl px-4 py-2.5 text-xs focus:outline-none focus:border-on-surface-variant" 
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-bold text-tertiary uppercase tracking-widest">Custom Model Name</label>
                        <input 
                          type="text" 
                          value={preferences.customModelName}
                          onChange={(e) => updatePreferences({ customModelName: e.target.value })}
                          placeholder="e.g., llama3-8b-8192"
                          className="w-full bg-surface-hover border border-outline rounded-xl px-4 py-2.5 text-xs focus:outline-none focus:border-on-surface-variant" 
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-bold text-tertiary uppercase tracking-widest">Custom API Key</label>
                        <input 
                          type="password" 
                          value={preferences.customApiKey}
                          onChange={(e) => updatePreferences({ customApiKey: e.target.value })}
                          placeholder="API Key (if required)"
                          className="w-full bg-surface-hover border border-outline rounded-xl px-4 py-2.5 text-xs focus:outline-none focus:border-on-surface-variant" 
                        />
                      </div>
                    </div>
                  )}

                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-tertiary uppercase tracking-widest">Gemini API Key</label>
                    <div className="flex gap-2">
                      <input 
                        type="password" 
                        value={preferences.geminiKey}
                        onChange={(e) => updatePreferences({ geminiKey: e.target.value })}
                        placeholder="Enter API Key (Optional, uses default if empty)"
                        className="flex-1 bg-surface-hover border border-outline rounded-xl px-4 py-2.5 text-xs focus:outline-none focus:border-on-surface-variant" 
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-tertiary uppercase tracking-widest">OpenAI API Key</label>
                    <div className="flex gap-2">
                      <input 
                        type="password" 
                        value={preferences.openaiKey}
                        onChange={(e) => updatePreferences({ openaiKey: e.target.value })}
                        placeholder="Enter API Key"
                        className="flex-1 bg-surface-hover border border-outline rounded-xl px-4 py-2.5 text-xs focus:outline-none focus:border-on-surface-variant" 
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-tertiary uppercase tracking-widest">Anthropic Key</label>
                    <div className="flex gap-2">
                      <input 
                        type="password" 
                        value={preferences.anthropicKey}
                        onChange={(e) => updatePreferences({ anthropicKey: e.target.value })}
                        placeholder="Enter API Key"
                        className="flex-1 bg-surface-hover border border-outline rounded-xl px-4 py-2.5 text-xs focus:outline-none focus:border-on-surface-variant" 
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Cost Optimization */}
              <div className="p-6 rounded-3xl bg-surface/50 backdrop-blur-xl border border-outline space-y-4">
                <div className="flex items-center gap-3">
                  <Zap className="w-5 h-5 text-yellow-400" />
                  <h3 className="font-bold">Cost Optimization</h3>
                </div>
                <p className="text-xs text-on-surface-variant leading-relaxed">Smart routing uses lightweight models for tool decisions and skips unnecessary searches. Reduces API costs 40-60%.</p>
                
                <div className="space-y-4 mt-2">
                  <div className="flex justify-between items-center border-t border-outline pt-4">
                    <div className="space-y-1">
                      <div className="text-sm font-medium">Smart Query Routing</div>
                      <div className="text-[10px] text-on-surface-variant leading-tight">Auto-detect if search/RAG/code is needed before calling expensive models.</div>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer mt-1">
                      <input 
                        type="checkbox" 
                        className="sr-only peer" 
                        checked={preferences.costOptimized}
                        onChange={(e) => updatePreferences({ costOptimized: e.target.checked })}
                      />
                      <div className="w-9 h-5 bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-green-400"></div>
                    </label>
                  </div>
                </div>
              </div>

              {/* Deep Search */}
              <div className="p-6 rounded-3xl bg-surface/50 backdrop-blur-xl border border-outline space-y-4">
                <div className="flex items-center gap-3">
                  <Search className="w-5 h-5 text-primary" />
                  <h3 className="font-bold">Deep Search</h3>
                </div>
                <p className="text-xs text-on-surface-variant leading-relaxed">MILO searches the web via SearXNG (uses public instances by default). Add your own SearXNG URL for faster, more reliable results. DuckDuckGo is available as a fallback.</p>
                
                <div className="space-y-4 mt-2">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-on-surface-variant font-medium">Search Backend</span>
                    <select
                      value={preferences.searchBackend}
                      onChange={(e) => updatePreferences({ searchBackend: e.target.value as any })}
                      className="bg-surface border border-outline rounded-lg text-xs font-semibold px-3 py-1.5 focus:outline-none focus:border-on-surface-variant cursor-pointer text-on-surface"
                    >
                      <option value="searxng">SearXNG (Default — public instances)</option>
                      <option value="duckduckgo">DuckDuckGo (Fallback)</option>
                    </select>
                  </div>
                  {preferences.searchBackend === 'searxng' && (
                    <div className="p-4 rounded-xl border border-primary/20 bg-primary/5 space-y-2">
                      <label className="text-[10px] font-bold text-tertiary uppercase tracking-widest">SearXNG Instance URL (Optional)</label>
                      <input 
                        type="text" 
                        value={preferences.searxngUrl}
                        onChange={(e) => updatePreferences({ searxngUrl: e.target.value })}
                        placeholder="e.g., http://localhost:8080 (uses public instances if empty)"
                        className="w-full bg-surface-hover border border-outline rounded-xl px-4 py-2.5 text-xs focus:outline-none focus:border-on-surface-variant" 
                      />
                      <p className="text-[10px] text-on-surface-variant">Leave empty to use public instances. Self-host: <code className="px-1 py-0.5 bg-surface rounded">docker run -d -p 8080:8080 searxng/searxng</code></p>
                    </div>
                  )}
                </div>
              </div>

              {/* Document Management */}
              <div className="p-6 rounded-3xl bg-surface/50 backdrop-blur-xl border border-outline space-y-4">
                <div className="flex items-center gap-3">
                  <Database className="w-5 h-5 text-tertiary" />
                  <h3 className="font-bold">Indexed Documents</h3>
                </div>
                <p className="text-xs text-on-surface-variant leading-relaxed">Documents uploaded via chat are indexed for semantic search. Manage or remove them below.</p>
                
                {indexedDocs.length === 0 ? (
                  <div className="text-center py-6 text-xs text-on-surface-variant/60">
                    <FileText className="w-6 h-6 mx-auto mb-2 opacity-40" />
                    No documents indexed. Attach files in chat to get started.
                  </div>
                ) : (
                  <div className="space-y-2 mt-2">
                    {indexedDocs.map((doc, i) => (
                      <div key={i} className="flex items-center justify-between p-3 bg-surface rounded-xl border border-outline/50 group">
                        <div className="flex items-center gap-3 min-w-0">
                          <FileText className="w-4 h-4 text-tertiary shrink-0" />
                          <div className="min-w-0">
                            <div className="text-xs font-medium truncate">{doc.name}</div>
                            <div className="text-[10px] text-on-surface-variant/60">{doc.chunks} chunks indexed</div>
                          </div>
                        </div>
                        <button
                          onClick={() => deleteDocument(doc.name)}
                          className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg hover:bg-red-500/10 text-on-surface-variant hover:text-red-400 transition-all"
                          title={`Remove ${doc.name}`}
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                    <button
                      onClick={clearRAG}
                      className="w-full mt-2 py-2.5 flex items-center justify-center gap-2 border border-red-500/20 text-red-500/60 hover:bg-red-500/10 hover:text-red-500 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Clear All Documents
                    </button>
                  </div>
                )}
              </div>

              {/* Privacy & Data */}
              <div className="p-6 rounded-3xl bg-surface/50 backdrop-blur-xl border border-outline space-y-6">
                <div className="flex items-center gap-3">
                  <ShieldCheck className="w-5 h-5 text-on-surface-variant" />
                  <h3 className="font-bold">Privacy & Data</h3>
                </div>
                
                <div className="space-y-5">
                  <div className="flex justify-between items-start">
                    <div className="space-y-1">
                      <div className="text-sm">Model Training</div>
                      <div className="text-[10px] text-on-surface-variant leading-tight pr-4">Allow conversations to be used to improve MILO models.</div>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer mt-1">
                      <input 
                        type="checkbox" 
                        className="sr-only peer" 
                        checked={preferences.modelTraining}
                        onChange={(e) => updatePreferences({ modelTraining: e.target.checked })}
                      />
                      <div className="w-9 h-5 bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary"></div>
                    </label>
                  </div>
                  
                  <button onClick={clearHistory} className="w-full py-3 flex items-center justify-center gap-2 border border-red-500/20 text-red-500/60 hover:bg-red-500/10 hover:text-red-500 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all">
                    <Trash2 className="w-3.5 h-3.5" />
                    Clear All History
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
