import React, { useState, useRef } from 'react';
import { 
  Paperclip, 
  Mic, 
  ArrowUp,
  X
} from 'lucide-react';
import { FeatureId } from '../types';
import { FEATURES } from '../features';

interface ChatInputProps {
  placeholder?: string;
  onSend?: (text: string) => void;
  activeFeature?: FeatureId | null;
  onRemoveFeature?: () => void;
}

import * as pdfjsLib from 'pdfjs-dist';
pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

export default function ChatInput({ 
  placeholder = "Message MILO...", 
  onSend,
  activeFeature = null,
  onRemoveFeature
}: ChatInputProps) {
  const feat = activeFeature ? FEATURES[activeFeature] : null;
  const [message, setMessage] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSend = () => {
    if (message.trim() && onSend) {
      onSend(message);
      setMessage('');
    }
  };

  const handleAttachment = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      
      // Handle Text Files
      if (file.type.startsWith('text/') || file.name.endsWith('.md') || file.name.endsWith('.js') || file.name.endsWith('.ts')) {
        try {
          const text = await file.text();
          const fileContext = `\n\n--- Start of ${file.name} ---\n${text.slice(0, 50000)}\n--- End of ${file.name} ---\n\n`;
          setMessage((prev) => prev ? `${prev}${fileContext}` : fileContext);
        } catch (err) {
          setMessage((prev) => prev ? `${prev} [Attached file: ${file.name}]` : `[Attached file: ${file.name}]`);
        }
      } 
      // Handle PDF
      else if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
        try {
          const arrayBuffer = await file.arrayBuffer();
          const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
          let text = '';
          for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const content = await page.getTextContent();
            const pageText = content.items.map((item: any) => item.str).join(' ');
            text += pageText + '\n';
          }
          const fileContext = `\n\n--- Start of ${file.name} (PDF parsing) ---\n${text.slice(0, 50000)}\n--- End of ${file.name} ---\n\n`;
          setMessage((prev) => prev ? `${prev}${fileContext}` : fileContext);
        } catch (err) {
          console.error("PDF Parsing error:", err);
          setMessage((prev) => prev ? `${prev} [Attached PDF: ${file.name} (Failed to parse)]` : `[Attached PDF: ${file.name} (Failed to parse)]`);
        }
      } 
      else {
        setMessage((prev) => prev ? `${prev} [Attached file: ${file.name} (Unsupported format)]` : `[Attached file: ${file.name} (Unsupported format)]`);
      }
    }
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
    <div className="w-full max-w-[800px] mx-auto px-4">
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
          className="p-3 text-white/40 hover:text-white transition-colors rounded-full hover:bg-white/5 shrink-0"
        >
          <Paperclip className="w-5 h-5" />
        </button>
        <input 
          type="file" 
          ref={fileInputRef} 
          className="hidden" 
          onChange={handleFileChange}
        />
        
        <button 
          onClick={handleMic}
          className={`p-3 transition-colors rounded-full shrink-0 ${isRecording ? 'text-red-500 bg-red-500/10' : 'text-white/40 hover:text-white hover:bg-white/5'}`}
        >
          <Mic className="w-5 h-5" />
        </button>

        <textarea 
          rows={1}
          className="flex-1 bg-transparent border-none text-white text-base focus:ring-0 placeholder:text-white/30 px-2 py-3 max-h-[200px] resize-none outline-none overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]" 
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
          <button 
            onClick={handleSend}
            disabled={!message.trim()}
            className={`w-10 h-10 rounded-full flex items-center justify-center transition-all shrink-0 shadow-lg ${
              message.trim() 
                ? 'bg-primary text-background hover:opacity-90' 
                : 'bg-white/10 text-white/30 cursor-not-allowed'
            }`}
          >
            <ArrowUp className="w-5 h-5 font-bold" />
          </button>
        </div>
      </div>
      <p className="text-center mt-3 text-[10px] text-tertiary font-medium tracking-wide">
        MILO can make mistakes. Consider verifying important information.
      </p>
    </div>
  );
}
