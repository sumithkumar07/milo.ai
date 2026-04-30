import React, { useRef, useEffect, useState } from 'react';
import { useAppContext } from '../core/store';
import { Sparkles, CheckCircle2, Loader2, Circle, Download, RefreshCw, Copy, Check, Play, Pencil, X, Save, GitBranch, ChevronDown, ChevronRight, Square, Clock, RotateCcw, Terminal } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import ChatInput from '../components/chat/ChatInput';
import { FeatureId, Message } from '../core/types';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { createHighlighter } from 'shiki';
import { runPython, onPyodideStateChange, getPyodideState, ensurePyodideLoaded, interruptExecution, isExecutionRunning } from '../services/execution/pyodideExecutor';
import { runJavaScript } from '../services/execution/jsExecutor';

const commonLangs = ['javascript', 'typescript', 'python', 'jsx', 'tsx', 'html', 'css', 'json', 'bash', 'markdown', 'rust', 'java', 'c', 'cpp', 'go', 'ruby', 'php', 'swift', 'kotlin', 'r', 'sql', 'yaml', 'toml', 'xml', 'dockerfile', 'diff', 'shell'];

let highlighterInstance: Awaited<ReturnType<typeof createHighlighter>> | null = null;

async function getHighlighter() {
  if (!highlighterInstance) {
    highlighterInstance = await createHighlighter({ themes: ['github-dark'], langs: commonLangs });
  }
  return highlighterInstance;
}

interface ActiveChatViewProps {
  activeFeature: FeatureId | null;
  setActiveFeature: (feature: FeatureId | null) => void;
  messages: Message[];
  isLoading: boolean;
  onSendMessage: (msg: string, overrideFeature?: FeatureId, imageUrl?: string) => void;
  onStop?: () => void;
  onRegenerate?: (messageIndex: number) => void;
  onBranchEdit?: (messageIndex: number, newContent: string) => void;
}

function CodeBlock({ node, inline, className, children, ...props }: any) {
  const match = /language-(\w+)/.exec(className || '');
  const language = match ? match[1] : '';
  const code = String(children).replace(/\n$/, '');
  const [showPreview, setShowPreview] = useState(false);
  const [copied, setCopied] = useState(false);
  const [highlightedHtml, setHighlightedHtml] = useState<string | null>(null);
  const [pyResult, setPyResult] = useState<{ stdout: string; stderr: string; plots: string[]; success: boolean; executionTimeMs?: number } | null>(null);
  const [pyRunning, setPyRunning] = useState(false);
  const [pyStatus, setPyStatus] = useState<string>('');
  const [elapsedMs, setElapsedMs] = useState(0);
  const [jsResult, setJsResult] = useState<{ stdout: string; stderr: string; success: boolean; executionTimeMs?: number } | null>(null);
  const [jsRunning, setJsRunning] = useState(false);
  let elapsedTimer: ReturnType<typeof setInterval> | null = null;

  useEffect(() => {
    if (!inline && language) {
      getHighlighter().then(h => {
        const lang = h.getLoadedLanguages().includes(language) ? language : 'plaintext';
        const html = h.codeToHtml(code, { lang, theme: 'github-dark' });
        setHighlightedHtml(html);
      }).catch(() => {
        // Fallback: highlightedHtml stays null, raw code will be displayed
      });
    }
  }, [code, language, inline]);
  const handleCopy = () => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {
      // Optionally show error state
    });
  };
  const handleRunPython = async () => {
    if (pyRunning) return;
    setPyRunning(true);
    setPyStatus('Loading Python runtime...');
    setPyResult(null);
    setElapsedMs(0);

    const timerStart = Date.now();
    elapsedTimer = setInterval(() => setElapsedMs(Date.now() - timerStart), 100);

    try {
      await ensurePyodideLoaded();
      setPyStatus('Executing...');
      const result = await runPython(code);
      setPyResult(result);
      setPyStatus('');
    } catch (err: any) {
      setPyResult({ stdout: '', stderr: err.message || 'Execution failed', plots: [], success: false });
      setPyStatus('');
    } finally {
      if (elapsedTimer) clearInterval(elapsedTimer);
      setPyRunning(false);
    }
  };

  const handleStopPython = () => {
    interruptExecution();
    if (elapsedTimer) clearInterval(elapsedTimer);
    setPyRunning(false);
    setPyStatus('Interrupted');
  };

  const handleRunJS = async () => {
    if (jsRunning) return;
    setJsRunning(true);
    setJsResult(null);
    try {
      const result = await runJavaScript(code);
      setJsResult(result);
    } catch (err: any) {
      setJsResult({ stdout: '', stderr: err.message || 'Execution failed', success: false });
    } finally {
      setJsRunning(false);
    }
  };

  if (inline) {
    return (
      <code className="px-1.5 py-0.5 rounded bg-surface border border-outline text-sm text-on-surface" {...props}>
        {children}
      </code>
    );
  }

  const headerButtons = (
    <div className="flex items-center gap-1 px-2">
      {language && (
        <span className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant px-2">{language}</span>
      )}
      <button
        onClick={handleCopy}
        className="p-1.5 rounded hover:bg-surface-hover text-on-surface-variant hover:text-on-surface transition-colors"
        title="Copy code"
      >
        {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
      </button>
    </div>
  );

  if (language === 'python') {
    return (
      <div className="my-4 border border-outline rounded-xl overflow-hidden bg-surface">
        <div className="flex items-center justify-between border-b border-outline">
          {headerButtons}
          <div className="flex items-center gap-2 mr-2">
            {pyRunning && (
              <span className="text-[10px] text-on-surface-variant font-mono">
                {(elapsedMs / 1000).toFixed(1)}s
              </span>
            )}
            {pyRunning ? (
              <button
                onClick={handleStopPython}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors"
              >
                <Square className="w-3 h-3 fill-current" /> Stop
              </button>
            ) : (
              <button
                onClick={handleRunPython}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-primary text-background hover:opacity-90 transition-colors"
              >
                {pyResult ? <RotateCcw className="w-3 h-3" /> : <Play className="w-3 h-3 fill-current" />}
                {pyResult ? 'Rerun' : 'Run'}
              </button>
            )}
          </div>
        </div>
        {highlightedHtml ? (
          <div className="p-4 overflow-x-auto" dangerouslySetInnerHTML={{ __html: highlightedHtml }} />
        ) : (
          <pre className="p-4 overflow-x-auto"><code>{code}</code></pre>
        )}
        {pyRunning && (
          <div className="border-t border-outline p-3 bg-surface-hover/50">
            <div className="flex items-center gap-2 text-xs text-on-surface-variant">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
              <span>{pyStatus}</span>
            </div>
          </div>
        )}
        {pyResult && !pyRunning && (
          <div className="border-t border-outline">
            {pyResult.plots.length > 0 && (
              <div className="border-b border-outline">
                {pyResult.plots.map((plot, i) => (
                  <div key={i} className="p-4 bg-white">
                    <img src={`data:image/png;base64,${plot}`} alt={`Plot ${i + 1}`} className="max-w-full" />
                  </div>
                ))}
              </div>
            )}
            {(pyResult.stdout || pyResult.stderr) && (
              <div className="p-3">
                <div className="flex items-center gap-2 mb-2">
                  <Terminal className="w-3 h-3 text-on-surface-variant" />
                  <span className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">Output</span>
                  {pyResult.executionTimeMs && (
                    <span className="ml-auto text-[10px] text-on-surface-variant/60 flex items-center gap-1">
                      <Clock className="w-2.5 h-2.5" /> {(pyResult.executionTimeMs / 1000).toFixed(2)}s
                    </span>
                  )}
                  <span className={`text-[10px] font-bold ${pyResult.success ? 'text-green-400' : 'text-red-400'}`}>
                    {pyResult.success ? 'SUCCESS' : 'FAILED'}
                  </span>
                </div>
                {pyResult.stdout && (
                  <pre className="text-green-400 text-xs font-mono whitespace-pre-wrap bg-surface p-2 rounded-lg border border-outline/50 max-h-64 overflow-auto">{pyResult.stdout}</pre>
                )}
                {pyResult.stderr && (
                  <pre className={`text-xs font-mono whitespace-pre-wrap bg-surface p-2 rounded-lg border border-outline/50 mt-2 max-h-64 overflow-auto ${pyResult.success ? 'text-amber-400' : 'text-red-400'}`}>{pyResult.stderr}</pre>
                )}
              </div>
            )}
            {pyResult.success && !pyResult.stdout && !pyResult.stderr && (
              <div className="p-3 flex items-center gap-2 text-xs text-on-surface-variant/60">
                <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />
                Code executed successfully (no output).
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  if (language === 'html') {
    return (
      <div className="my-4 border border-outline rounded-xl overflow-hidden bg-surface">
        <div className="flex border-b border-outline items-center justify-between">
          <div className="flex">
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
          {headerButtons}
        </div>
        <div className="p-0">
          {showPreview ? (
            <div className="bg-white p-2 min-h-[400px]">
              <iframe srcDoc={code} className="w-full min-h-[400px] border-none" sandbox="allow-scripts allow-modals" />
            </div>
          ) : highlightedHtml ? (
            <div className="p-4 overflow-x-auto" dangerouslySetInnerHTML={{ __html: highlightedHtml }} />
          ) : (
            <pre className="p-4 overflow-x-auto"><code>{code}</code></pre>
          )}
        </div>
      </div>
    );
  }

  if (language === 'javascript' || language === 'typescript') {
    return (
      <div className="my-4 border border-outline rounded-xl overflow-hidden bg-surface">
        <div className="flex items-center justify-between border-b border-outline">
          {headerButtons}
          <div className="flex items-center gap-2 mr-2">
            {jsRunning && (
              <span className="text-[10px] text-on-surface-variant font-mono">Running...</span>
            )}
            <button
              onClick={handleRunJS}
              disabled={jsRunning}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-primary text-background hover:opacity-90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {jsRunning ? <Loader2 className="w-3 h-3 animate-spin" /> : jsResult ? <RotateCcw className="w-3 h-3" /> : <Play className="w-3 h-3 fill-current" />}
              {jsRunning ? 'Running...' : jsResult ? 'Rerun' : 'Run'}
            </button>
          </div>
        </div>
        {highlightedHtml ? (
          <div className="p-4 overflow-x-auto" dangerouslySetInnerHTML={{ __html: highlightedHtml }} />
        ) : (
          <pre className="p-4 overflow-x-auto"><code>{code}</code></pre>
        )}
        {jsResult && !jsRunning && (
          <div className="border-t border-outline p-3">
            <div className="flex items-center gap-2 mb-2">
              <Terminal className="w-3 h-3 text-on-surface-variant" />
              <span className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">Console</span>
              {jsResult.executionTimeMs && (
                <span className="ml-auto text-[10px] text-on-surface-variant/60 flex items-center gap-1">
                  <Clock className="w-2.5 h-2.5" /> {(jsResult.executionTimeMs / 1000).toFixed(2)}s
                </span>
              )}
              <span className={`text-[10px] font-bold ${jsResult.success ? 'text-green-400' : 'text-red-400'}`}>
                {jsResult.success ? 'SUCCESS' : 'FAILED'}
              </span>
            </div>
            {jsResult.stdout && (
              <pre className="text-green-400 text-xs font-mono whitespace-pre-wrap bg-surface p-2 rounded-lg border border-outline/50 max-h-64 overflow-auto">{jsResult.stdout}</pre>
            )}
            {jsResult.stderr && (
              <pre className={`text-xs font-mono whitespace-pre-wrap bg-surface p-2 rounded-lg border border-outline/50 mt-2 max-h-64 overflow-auto ${jsResult.success ? 'text-amber-400' : 'text-red-400'}`}>{jsResult.stderr}</pre>
            )}
            {jsResult.success && !jsResult.stdout && !jsResult.stderr && (
              <div className="flex items-center gap-2 text-xs text-on-surface-variant/60">
                <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />
                Code executed successfully (no output).
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="my-4 border border-outline rounded-xl overflow-hidden bg-surface">
      <div className="flex items-center justify-between border-b border-outline">
        {headerButtons}
      </div>
      {highlightedHtml ? (
        <div className="p-4 overflow-x-auto" dangerouslySetInnerHTML={{ __html: highlightedHtml }} />
      ) : (
        <pre className={`p-4 overflow-x-auto ${className}`} {...props}>
          <code>{children}</code>
        </pre>
      )}
    </div>
  );
}

export default function ActiveChatView({ activeFeature, setActiveFeature, messages, isLoading, onSendMessage, onStop, onRegenerate, onBranchEdit }: ActiveChatViewProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const { preferences } = useAppContext();
  const [pyState, setPyState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [pyProgress, setPyProgress] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [branchedAfterIdx, setBranchedAfterIdx] = useState<number | null>(null);
  const [expandedSearchStatus, setExpandedSearchStatus] = useState<Set<string>>(new Set());

  useEffect(() => {
    const unsub = onPyodideStateChange((state, progress) => {
      setPyState(state);
      if (progress) setPyProgress(progress);
    });
    return unsub;
  }, []);

  const toggleSearchStatus = (id: string) => {
    setExpandedSearchStatus(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

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
      {pyState === 'loading' && (
        <div className="mb-4 p-3 bg-primary/10 border border-primary/30 rounded-lg flex items-center gap-3">
          <Loader2 className="w-4 h-4 text-primary animate-spin" />
          <div className="flex-1">
            <div className="text-xs font-medium text-primary">Python Runtime Loading</div>
            <div className="text-[10px] text-primary/70">{pyProgress}</div>
          </div>
        </div>
      )}
      {pyState === 'error' && (
        <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg flex items-center gap-3">
          <Circle className="w-4 h-4 text-red-400" />
          <div className="flex-1">
            <div className="text-xs font-medium text-red-400">Python Runtime Error</div>
            <div className="text-[10px] text-red-400/70">{pyProgress}</div>
          </div>
        </div>
      )}
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
          {messages.map((message, msgIndex) => (
            message.role === 'user' ? (
              <div key={message.id} className="flex justify-end w-full">
                <motion.div
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  className={`max-w-[85%] bg-surface/80 backdrop-blur-md border border-white/5 shadow-sm
                  ${preferences.compactMode ? 'rounded-xl px-4 py-2 text-sm' : 'rounded-2xl rounded-tr-sm px-5 py-4'}
                `}
                >
                  {editingId === message.id ? (
                    <div className="space-y-2">
                      <textarea
                        value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                        className="w-full bg-transparent border border-outline rounded-lg p-2 text-sm text-on-background resize-none outline-none focus:border-primary"
                        rows={3}
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && e.ctrlKey) {
                            setEditingId(null);
                            onBranchEdit?.(msgIndex, editText);
                            setBranchedAfterIdx(msgIndex);
                          }
                          if (e.key === 'Escape') {
                            setEditingId(null);
                          }
                        }}
                      />
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => setEditingId(null)}
                          className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium text-on-surface-variant hover:text-on-background hover:bg-surface-hover transition-colors"
                        >
                          <X className="w-3 h-3" /> Cancel
                        </button>
                        <button
                          onClick={() => {
                            setEditingId(null);
                            onBranchEdit?.(msgIndex, editText);
                            setBranchedAfterIdx(msgIndex);
                          }}
                          disabled={!editText.trim()}
                          className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium text-primary bg-primary/10 hover:bg-primary/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          <Save className="w-3 h-3" /> Save & Branch
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      {message.imageUrl && (
                        <img src={message.imageUrl} alt="Attached" className="max-h-60 rounded-lg mb-2 object-contain" />
                      )}
                      <div className="text-on-background whitespace-pre-wrap">{message.content}</div>
                      {!isLoading && (
                        <div className="flex items-center gap-1 mt-2 opacity-100 transition-opacity">
                          <button
                            onClick={() => { setEditingId(message.id); setEditText(message.content); }}
                            className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium text-on-surface-variant hover:text-primary hover:bg-primary/10 transition-colors"
                          >
                            <Pencil className="w-3 h-3" /> Edit
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </motion.div>
              </div>
            ) : (
              <div key={message.id} className="flex w-full gap-4 items-start">
                <div className={`flex-shrink-0 flex items-center justify-center bg-surface border border-outline mt-1
                ${preferences.compactMode ? 'w-6 h-6 rounded-md' : 'w-8 h-8 rounded-full'}
              `}>
                  <Sparkles className={`text-primary ${preferences.compactMode ? 'w-3.5 h-3.5' : 'w-5 h-5'}`} />
                </div>

                <div className="flex-1 flex flex-col gap-2">
                  {branchedAfterIdx !== null && msgIndex === branchedAfterIdx + 1 && (
                    <div className="flex items-center gap-1.5 text-[10px] text-primary/80 font-medium">
                      <GitBranch className="w-3 h-3" />
                      Branched from edited message
                    </div>
                  )}
                  {message.isStreaming && message.content === '' && (
                    <div className={`max-w-2xl opacity-30 ${preferences.compactMode ? 'space-y-2 mt-1' : 'space-y-3 mt-2'}`}>
                      <div className="h-3.5 bg-outline rounded-full w-full animate-pulse" />
                      <div className="h-3.5 bg-outline rounded-full w-[94%] animate-pulse" />
                      <div className="h-3.5 bg-outline rounded-full w-[80%] animate-pulse" />
                    </div>
                  )}
                  {message.searchStatus && message.searchStatus.length > 0 && (
                    <div className="mb-3 border border-primary/20 rounded-xl overflow-hidden bg-primary/5">
                      <button
                        onClick={() => toggleSearchStatus(message.id)}
                        className="w-full px-3 py-2 flex items-center gap-2 text-[11px] font-semibold text-primary hover:bg-primary/10 transition-colors"
                      >
                        {expandedSearchStatus.has(message.id) ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                        <Loader2 className="w-3 h-3 animate-spin" />
                        Search Progress ({message.searchStatus.length} steps)
                      </button>
                      <AnimatePresence>
                        {expandedSearchStatus.has(message.id) && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="overflow-hidden"
                          >
                            <div className="px-3 pb-2 space-y-1">
                              {message.searchStatus.map((status, i) => (
                                <div key={i} className="flex items-start gap-2 text-[10px] text-on-surface-variant">
                                  <span className="text-primary/60 mt-px">{i === message.searchStatus.length - 1 ? '●' : '○'}</span>
                                  <span className={i === message.searchStatus.length - 1 ? 'text-on-surface' : ''}>{status}</span>
                                </div>
                              ))}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
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
                  {message.searchResults && message.searchResults.length > 0 && (
                    <div className="mt-3 border border-outline/30 rounded-xl overflow-hidden">
                      <div className="px-3 py-2 bg-surface/50 text-[11px] font-semibold text-on-surface-variant border-b border-outline/30 flex items-center gap-1.5">
                        <Sparkles className="w-3 h-3 text-primary" />
                        Sources
                      </div>
                      <div className="divide-y divide-outline/20">
                        {message.searchResults.map((r, i) => (
                          <a
                            key={i}
                            href={r.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex gap-3 p-3 hover:bg-surface-hover/50 transition-colors group"
                          >
                            <span className="flex-shrink-0 w-5 h-5 rounded-full bg-primary/10 text-primary text-[10px] font-bold flex items-center justify-center mt-0.5">
                              {i + 1}
                            </span>
                            <div className="min-w-0 flex-1">
                              <div className="text-[12px] font-medium text-primary group-hover:underline truncate">
                                {r.title}
                              </div>
                              <div className="text-[11px] text-on-surface-variant/70 mt-0.5 line-clamp-2">
                                {r.snippet}
                              </div>
                              <div className="text-[10px] text-tertiary mt-1">{r.source} · {new URL(r.url).hostname}</div>
                            </div>
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                  {!message.isStreaming && onRegenerate && (
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          const idx = messages.findIndex(m => m.id === message.id);
                          if (idx !== -1) onRegenerate(idx);
                        }}
                        disabled={isLoading}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium text-on-surface-variant hover:text-on-background hover:bg-surface border border-outline transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <RefreshCw className="w-3 h-3" /> Regenerate
                      </button>
                    </div>
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
            onSend={(msg, img) => onSendMessage(msg, activeFeature || undefined, img)}
            isLoading={isLoading}
            onStop={onStop}
            preferences={{
              activeProvider: preferences.activeProvider,
              geminiKey: preferences.geminiKey,
              openaiKey: preferences.openaiKey,
              customBaseUrl: preferences.customBaseUrl,
              customApiKey: preferences.customApiKey,
              geminiModel: preferences.geminiModel,
              openaiModel: preferences.openaiModel,
              customModelName: preferences.customModelName,
            }}
          />
        </div>
      </div>
    </div>
  );
}
