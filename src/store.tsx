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
  updateMessage: (id: string, content: string, isStreaming: boolean) => void;
  
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
  compactMode: true,
  modelTraining: true,
  geminiKey: '',
  openaiKey: '',
  anthropicKey: '',
  customBaseUrl: 'https://api.openai.com/v1',
  customApiKey: '',
  customModelName: 'gpt-3.5-turbo',
  activeProvider: 'gemini'
};

const AppContext = createContext<AppContextType | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [sessions, setSessions] = useState<ChatSession[]>(() => {
    const saved = localStorage.getItem('milo_sessions');
    return saved ? JSON.parse(saved) : [];
  });
  
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  
  const [messages, setMessages] = useState<Message[]>(() => {
    const saved = localStorage.getItem('milo_current_messages');
    return saved ? JSON.parse(saved) : [];
  });

  const [profile, setProfile] = useState<UserProfile>(() => {
    const saved = localStorage.getItem('milo_profile');
    return saved ? JSON.parse(saved) : defaultProfile;
  });

  const [preferences, setPreferences] = useState<Preferences>(() => {
    const saved = localStorage.getItem('milo_preferences');
    return saved ? JSON.parse(saved) : defaultPreferences;
  });

  // Save to locale storage on change
  useEffect(() => localStorage.setItem('milo_sessions', JSON.stringify(sessions)), [sessions]);
  useEffect(() => localStorage.setItem('milo_current_messages', JSON.stringify(messages)), [messages]);
  useEffect(() => localStorage.setItem('milo_profile', JSON.stringify(profile)), [profile]);
  useEffect(() => localStorage.setItem('milo_preferences', JSON.stringify(preferences)), [preferences]);

  // Sync sessions with messages
  useEffect(() => {
    if (currentSessionId && messages.length > 0) {
      setSessions(prev => {
        let exists = prev.find(s => s.id === currentSessionId);
        if (!exists) {
            // First message title
            const title = messages[0].content.slice(0, 40) + '...';
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

  const updateMessage = (id: string, content: string, isStreaming: boolean) => {
    setMessages(prev => prev.map(m => m.id === id ? { ...m, content, isStreaming } : m));
  };

  const updateProfile = (p: Partial<UserProfile>) => setProfile(prev => ({ ...prev, ...p }));
  const updatePreferences = (p: Partial<Preferences>) => setPreferences(prev => ({ ...prev, ...p }));

  return (
    <AppContext.Provider value={{
      sessions, currentSessionId, messages, profile, preferences,
      createSession, loadSession, deleteSession, clearHistory, addMessage, updateMessage,
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
