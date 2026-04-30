import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Paperclip,
  Mic,
  ArrowUp,
  Square,
  X,
  FileText,
  Loader2,
  Upload
} from 'lucide-react';
import { FeatureId } from '../../core/types';
import { FEATURES } from '../../features/features';
import { getModelCaps } from '../../core/modelCaps';
import { ingestDocument, onRAGStateChange, getRAGState, clearRAG, getIndexedDocumentsInfo, isKeywordFallbackActive, deleteDocument } from '../../services/rag/ragEngine';

interface ChatInputProps {
  placeholder?: string;
  onSend?: (text: string, imageUrl?: string) => void;
  activeFeature?: FeatureId | null;
  onRemoveFeature?: () => void;
  isLoading?: boolean;
  onStop?: () => void;
  preferences?: {
    activeProvider: string;
    geminiKey?: string;
    openaiKey?: string;
    customBaseUrl?: string;
    customApiKey?: string;
    geminiModel?: string;
    openaiModel?: string;
    customModelName?: string;
  };
}

import * as pdfjsLib from 'pdfjs-dist';
import mammoth from 'mammoth';
pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

export default function ChatInput({
  placeholder = "Message MILO...",
  onSend,
  activeFeature = null,
  onRemoveFeature,
  isLoading,
  onStop,
  preferences
}: ChatInputProps) {
  const feat = activeFeature ? FEATURES[activeFeature] : null;
  const modelName = preferences?.activeProvider === 'gemini'
    ? preferences.geminiModel
    : preferences?.activeProvider === 'openai'
      ? preferences.openaiModel
      : preferences?.customModelName || '';
  const { vision: supportsVision } = getModelCaps(preferences?.activeProvider || 'gemini', modelName);
  const [message, setMessage] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [truncationWarning, setTruncationWarning] = useState<string | null>(null);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [selectedImageName, setSelectedImageName] = useState<string | null>(null);
  const [ragStatus, setRagStatus] = useState<'idle' | 'processing' | 'ready' | 'error'>('idle');
  const [ragProgress, setRagProgress] = useState('');
  const [indexedDocs, setIndexedDocs] = useState<{ name: string; chunks: number }[]>([]);
  const [keywordFallback, setKeywordFallback] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const unsub = onRAGStateChange((s) => {
      setRagStatus(s.status);
      setRagProgress(s.progress);
      setIndexedDocs(getIndexedDocumentsInfo());
      setKeywordFallback(s.keywordFallbackActive);
    });
    return unsub;
  }, []);

  const processFile = async (file: File) => {
    const extractText = async (): Promise<string | null> => {
      try {
        if (file.type.startsWith('text/') || file.name.endsWith('.md') || file.name.endsWith('.js') || file.name.endsWith('.ts')) {
          return await file.text();
        }
        if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
          const arrayBuffer = await file.arrayBuffer();
          const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
          let text = '';
          for (let i = 1; i <= pdf.numPages; i++) {
            setRagProgress(`Extracting page ${i}/${pdf.numPages} from ${file.name}...`);
            const page = await pdf.getPage(i);
            const content = await page.getTextContent();
            text += content.items.map((item: any) => item.str).join(' ') + '\n';
          }
          return text;
        }
        if (file.name.endsWith('.docx')) {
          const arrayBuffer = await file.arrayBuffer();
          const result = await mammoth.extractRawText({ arrayBuffer });
          return result.value;
        }
        if (file.name.endsWith('.csv') || file.type === 'text/csv') {
          return await file.text();
        }
        return null;
      } catch (err) {
        console.error('Failed to extract text from file:', err);
        return null;
      }
    };

    if (file.type.startsWith('image/')) {
      if (!supportsVision) {
        setMessage((prev) => prev
          ? `${prev} [Image "${file.name}" skipped: current model does not support vision]`
          : `[Image "${file.name}" skipped: current model does not support vision. Switch to a vision-capable model (Gemini, GPT-4o, Claude 3) to use image attachments.]`);
        return;
      }
      const reader = new FileReader();
      reader.onload = (e) => {
        const base64 = e.target?.result as string;
        setSelectedImage(base64);
        setSelectedImageName(file.name);
      };
      reader.onerror = () => {
        setMessage((prev) => prev ? `${prev} [Failed to load image: ${file.name}]` : `[Failed to load image: ${file.name}]`);
      };
      reader.readAsDataURL(file);
      return;
    }

    const text = await extractText();
    if (!text) {
      setMessage((prev) => prev ? `${prev} [Attached file: ${file.name}]` : `[Attached file: ${file.name}]`);
      return;
    }

    if (text.length > 5000) {
      setRagStatus('processing');
      setRagProgress(`Processing ${file.name} (${(text.length / 1000).toFixed(1)}K chars)...`);
      try {
        await ingestDocument(text, file.name, {
          provider: preferences?.activeProvider || 'gemini',
          geminiKey: preferences?.geminiKey,
          openaiKey: preferences?.openaiKey,
          customBaseUrl: preferences?.customBaseUrl,
          customApiKey: preferences?.customApiKey,
        });
        setMessage((prev) => prev + (prev ? '\n' : '') + `[📚 ${file.name} indexed for RAG — ask questions about its content]`);
      } catch (err: any) {
        setRagStatus('error');
        setRagProgress(`Failed: ${err.message}`);
        setMessage((prev) => prev ? `${prev} [Failed to index ${file.name}]` : `[Failed to index ${file.name}]`);
      }
    } else {
      const fileContext = `\n\n--- Start of ${file.name} ---\n${text.slice(0, 50000)}\n--- End of ${file.name} ---\n`;
      setMessage((prev) => prev ? `${prev}${fileContext}` : fileContext);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      e.target.value = '';
      await processFile(file);
    }
  };

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDragIn = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      setDragActive(true);
    }
  }, []);

  const handleDragOut = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      for (const file of Array.from(e.dataTransfer.files)) {
        await processFile(file);
      }
    }
  }, [preferences, supportsVision]);

  const handleSend = () => {
    if ((message.trim() || selectedImage) && onSend) {
      onSend(message, selectedImage || undefined);
      setMessage('');
      setSelectedImage(null);
      setSelectedImageName(null);
    }
  };

  const handleAttachment = () => {
    fileInputRef.current?.click();
  };

  const handleMic = () => {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      alert('Speech recognition is not supported in this browser.');
      return;
    }

    const SpeechRecognition = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
    const recognition = new SpeechRecognition();

    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.onstart = () => setIsRecording(true);

    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setMessage((prev) => prev ? `${prev} ${transcript}` : transcript);
      setIsRecording(false);
    };

    recognition.onerror = () => setIsRecording(false);
    recognition.onend = () => setIsRecording(false);

    recognition.start();
  };

  return (
    <div
      className="w-full max-w-[800px] mx-auto px-4"
      onDragEnter={handleDragIn}
      onDragLeave={handleDragOut}
      onDragOver={handleDrag}
      onDrop={handleDrop}
    >
      {dragActive && (
        <div className="fixed inset-0 z-[100] bg-primary/10 backdrop-blur-sm flex items-center justify-center border-4 border-dashed border-primary m-4 rounded-3xl">
          <div className="flex flex-col items-center gap-3 text-primary">
            <Upload className="w-12 h-12" />
            <span className="text-lg font-bold">Drop files to index</span>
            <span className="text-xs text-primary/70">PDF, DOCX, TXT, MD, CSV, Images</span>
          </div>
        </div>
      )}
      {ragStatus === 'processing' && (
        <div className="mb-2 mx-4 p-2 bg-primary/10 border border-primary/30 rounded-lg flex items-center gap-2 text-[11px] text-primary">
          <Loader2 className="w-3 h-3 animate-spin" />
          <span>{ragProgress}</span>
        </div>
      )}
      {ragStatus === 'ready' && indexedDocs.length > 0 && (
        <div className="mb-2 mx-4 p-2 bg-green-500/10 border border-green-500/30 rounded-lg text-[11px] text-green-400">
          <div className="flex items-center gap-2 mb-1">
            <FileText className="w-3 h-3" />
            <span>Indexed documents:</span>
          </div>
          <div className="flex flex-wrap gap-1">
            {indexedDocs.map((doc, i) => (
              <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-500/20 rounded-full text-[10px]">
                {doc.name} ({doc.chunks} chunks)
                <button
                  onClick={() => deleteDocument(doc.name)}
                  className="ml-0.5 text-green-400/60 hover:text-red-400 transition-colors"
                  title={`Remove ${doc.name}`}
                >
                  <X className="w-2.5 h-2.5" />
                </button>
              </span>
            ))}
            <button onClick={clearRAG} className="px-2 py-0.5 hover:bg-red-500/20 hover:text-red-400 rounded-full text-[10px] transition-colors">
              Clear all
            </button>
          </div>
        </div>
      )}
      {ragStatus === 'error' && (
        <div className="mb-2 mx-4 p-2 bg-red-500/10 border border-red-500/30 rounded-lg text-[11px] text-red-400 flex items-center justify-between gap-2">
          <span>{ragProgress}</span>
          <button onClick={clearRAG} className="text-red-400/60 hover:text-red-400 shrink-0">
            <X className="w-3 h-3" />
          </button>
        </div>
      )}
      {keywordFallback && ragStatus === 'ready' && (
        <div className="mb-2 mx-4 p-2 bg-amber-500/10 border border-amber-500/30 rounded-lg text-[11px] text-amber-400 flex items-center gap-2">
          <FileText className="w-3 h-3 shrink-0" />
          <span>Embedding API unavailable — using keyword search. Results may be less precise.</span>
          <button onClick={() => setKeywordFallback(false)} className="text-amber-400/60 hover:text-amber-400 shrink-0 ml-auto">
            <X className="w-3 h-3" />
          </button>
        </div>
      )}
      {truncationWarning && (
        <div className="mb-2 mx-4 p-2 bg-amber-500/10 border border-amber-500/30 rounded-lg text-[11px] text-amber-400 flex items-start justify-between gap-2">
          <span>{truncationWarning}</span>
          <button onClick={() => setTruncationWarning(null)} className="text-amber-400/60 hover:text-amber-400 shrink-0">
            <X className="w-3 h-3" />
          </button>
        </div>
      )}
      {selectedImage && (
        <div className="mb-2 mx-4 relative inline-block">
          <img src={selectedImage} alt={selectedImageName || ''} className="max-h-32 rounded-xl border border-outline" />
          <button
            onClick={() => { setSelectedImage(null); setSelectedImageName(null); }}
            className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-surface border border-outline flex items-center justify-center text-on-surface-variant hover:text-on-background hover:bg-surface-hover transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
      {feat && (
        <div className="mb-2 ml-4 flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-primary bg-primary/10 border border-primary/20 backdrop-blur-md px-3 py-1.5 rounded-full w-max">
          <feat.icon className="w-3.5 h-3.5" />
          {feat.name}
          <button
            onClick={onRemoveFeature}
            className="ml-1 text-primary/60 hover:text-primary hover:bg-primary/20 rounded-full p-0.5 transition-colors"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      )}
      <div className="relative flex items-end bg-surface/50 backdrop-blur-xl rounded-3xl border border-outline p-2 focus-within:border-on-surface-variant transition-all">
        <button
          onClick={handleAttachment}
          className="p-3 text-on-surface-variant hover:text-on-background transition-colors rounded-full hover:bg-surface-hover shrink-0"
        >
          <Paperclip className="w-5 h-5" />
        </button>
        <input
          type="file"
          ref={fileInputRef}
          className="hidden"
          onChange={handleFileChange}
          accept=".txt,.md,.js,.ts,.pdf,.docx,.csv,image/*"
        />

        <button
          onClick={handleMic}
          className={`p-3 transition-colors rounded-full shrink-0 ${isRecording ? 'text-red-500 bg-red-500/10' : 'text-on-surface-variant hover:text-on-background hover:bg-surface-hover'}`}
        >
          <Mic className="w-5 h-5" />
        </button>

        <textarea
          rows={1}
          className="flex-1 bg-transparent border-none text-on-background text-base focus:ring-0 placeholder:text-on-surface-variant px-2 py-3 max-h-[200px] resize-none outline-none overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
          placeholder={placeholder}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
        />

        <div className="flex items-center gap-2 pr-1 pb-1">
          {isLoading ? (
            <button
              onClick={onStop}
              className="w-10 h-10 rounded-full flex items-center justify-center transition-all shrink-0 shadow-lg bg-surface-hover text-on-background hover:bg-surface-hover/80"
            >
              <Square className="w-4 h-4 fill-current" />
            </button>
          ) : (
            <button
              onClick={handleSend}
              disabled={!message.trim() && !selectedImage}
              className={`w-10 h-10 rounded-full flex items-center justify-center transition-all shrink-0 shadow-lg ${message.trim() || selectedImage
                ? 'bg-primary text-background hover:opacity-90'
                : 'bg-surface-hover text-on-surface-variant cursor-not-allowed'
                }`}
            >
              <ArrowUp className="w-5 h-5 font-bold" />
            </button>
          )}
        </div>
      </div>
      <p className="text-center mt-3 text-[10px] text-tertiary font-medium tracking-wide">
        MILO can make mistakes. Consider verifying important information.
      </p>
    </div>
  );
}
