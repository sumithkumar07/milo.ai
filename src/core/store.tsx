import React, { createContext, useContext, useState, useEffect } from 'react';
import { ViewType, FeatureId, Message, ChatSession } from './types';

interface UserProfile {
  name: string;
  email: string;
  avatarUrl: string;
}

interface Preferences {
  theme: 'dark' | 'light';
  compactMode: boolean;
  modelTraining: boolean;
  geminiKey: string;
  openaiKey: string;
  anthropicKey: string;
  customBaseUrl: string;
  customApiKey: string;
  customModelName: string;
  activeProvider: 'gemini' | 'openai' | 'anthropic' | 'custom';
  geminiModel: string;
  openaiModel: string;
  anthropicModel: string;
  searchBackend: 'duckduckgo' | 'searxng' | 'unsearch';
  searxngUrl: string;
  costOptimized: boolean;
}

interface AppContextType {
  sessions: ChatSession[];
  currentSessionId: string | null;
  messages: Message[];
  profile: UserProfile;
  preferences: Preferences;

  createSession: () => void;
  loadSession: (id: string) => void;
  deleteSession: (id: string) => void;
  clearHistory: () => void;
  addMessage: (message: Message) => void;
  updateMessage: (id: string, content: string, isStreaming: boolean, extras?: Partial<Omit<Message, 'id' | 'role' | 'content' | 'isStreaming'>>) => void;
  truncateAfter: (messageId: string) => void;

  updateProfile: (profile: Partial<UserProfile>) => void;
  updatePreferences: (prefs: Partial<Preferences>) => void;
}

const defaultProfile: UserProfile = {
  name: 'Guest User',
  email: 'user@example.com',
  avatarUrl: ''
};

const defaultPreferences: Preferences = {
  theme: 'dark',
  compactMode: false,
  modelTraining: true,
  geminiKey: '',
  openaiKey: '',
  anthropicKey: '',
  customBaseUrl: 'https://api.openai.com/v1',
  customApiKey: '',
  customModelName: 'gpt-3.5-turbo',
  activeProvider: 'gemini',
  geminiModel: 'gemini-2.5-flash',
  openaiModel: 'gpt-4o',
  anthropicModel: 'claude-3-5-sonnet-latest',
  searchBackend: 'searxng',
  searxngUrl: 'http://localhost:8080',
  costOptimized: true,
};

const AppContext = createContext<AppContextType | null>(null);

const safeJsonParse = <T,>(key: string, fallback: T): T => {
  try {
    const saved = localStorage.getItem(key);
    return saved ? JSON.parse(saved) : fallback;
  } catch {
    console.warn(`Failed to parse localStorage key "${key}", using fallback`);
    return fallback;
  }
};

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [sessions, setSessions] = useState<ChatSession[]>(() => {
    return safeJsonParse('milo_sessions', []);
  });

  const [currentSessionId, setCurrentSessionId] = useState<string | null>(() => {
    return localStorage.getItem('milo_current_session_id') || null;
  });

  const [messages, setMessages] = useState<Message[]>(() => {
    return safeJsonParse('milo_current_messages', []);
  });

  const [profile, setProfile] = useState<UserProfile>(() => {
    return safeJsonParse('milo_profile', defaultProfile);
  });

  const [preferences, setPreferences] = useState<Preferences>(() => {
    return safeJsonParse('milo_preferences', defaultPreferences);
  });

  useEffect(() => {
    if (currentSessionId) {
      localStorage.setItem('milo_current_session_id', currentSessionId);
    } else {
      localStorage.removeItem('milo_current_session_id');
    }
  }, [currentSessionId]);

  useEffect(() => {
    if (currentSessionId && messages.length > 0) {
      const isStreaming = messages.some(m => m.isStreaming);
      if (isStreaming) return;

      setSessions(prev => {
        const exists = prev.find(s => s.id === currentSessionId);
        if (!exists) {
          const firstContent = messages[0]?.content || 'New Chat';
          const title = firstContent.length > 40
            ? firstContent.slice(0, 40) + '...'
            : firstContent;
          return [{
            id: currentSessionId,
            title,
            timestamp: Date.now(),
            messages: messages,
            tags: []
          }, ...prev];
        } else {
          return prev.map(session => session.id === currentSessionId ? { ...session, timestamp: Date.now(), messages } : session);
        }
      });
    }
  }, [messages, currentSessionId]);

  const createSession = () => {
    setCurrentSessionId(Date.now().toString());
    setMessages([]);
  };

  const loadSession = (id: string) => {
    const session = sessions.find(s => s.id === id);
    if (session) {
      setCurrentSessionId(id);
      setMessages(session.messages);
    }
  };

  const deleteSession = (id: string) => {
    setSessions(prev => prev.filter(s => s.id !== id));
    if (currentSessionId === id) {
      createSession();
    }
  };

  const clearHistory = () => {
    setSessions([]);
    createSession();
  };

  const addMessage = (message: Message) => {
    if (!currentSessionId) setCurrentSessionId(Date.now().toString());
    setMessages(prev => [...prev, message]);
  };

  const updateMessage = (id: string, content: string, isStreaming: boolean, extras?: Partial<Omit<Message, 'id' | 'role' | 'content' | 'isStreaming'>>) => {
    setMessages(prev => prev.map(m => m.id === id ? { ...m, content, isStreaming, ...extras } : m));
  };

  const truncateAfter = (messageId: string) => {
    setMessages(prev => {
      const idx = prev.findIndex(m => m.id === messageId);
      if (idx === -1) return prev;
      return prev.slice(0, idx + 1);
    });
  };

  const updateProfile = (p: Partial<UserProfile>) => setProfile(prev => ({ ...prev, ...p }));
  const updatePreferences = (p: Partial<Preferences>) => setPreferences(prev => ({ ...prev, ...p }));

  useEffect(() => {
    localStorage.setItem('milo_sessions', JSON.stringify(sessions));
  }, [sessions]);

  useEffect(() => {
    localStorage.setItem('milo_current_messages', JSON.stringify(messages));
  }, [messages]);

  useEffect(() => {
    localStorage.setItem('milo_profile', JSON.stringify(profile));
  }, [profile]);

  useEffect(() => {
    localStorage.setItem('milo_preferences', JSON.stringify(preferences));
  }, [preferences]);

  return (
    <AppContext.Provider value={{
      sessions, currentSessionId, messages, profile, preferences,
      createSession, loadSession, deleteSession, clearHistory, addMessage, updateMessage, truncateAfter,
      updateProfile, updatePreferences
    }}>
      {children}
    </AppContext.Provider>
  );
}

export function useAppContext() {
  const context = useContext(AppContext);
  if (!context) throw new Error("useAppContext must be used within AppProvider");
  return context;
}
