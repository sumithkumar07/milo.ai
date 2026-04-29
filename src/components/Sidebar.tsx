import React from 'react';
import { 
  PlusCircle, 
  Library, 
  Settings, 
  HelpCircle, 
  Bolt,
  MessageSquare,
  CircleDashed,
  Trash
} from 'lucide-react';
import { ViewType, FeatureId } from '../types';
import { FEATURES } from '../features';
import { useAppContext } from '../store';

interface SidebarProps {
  currentView: ViewType;
  setView: (view: ViewType) => void;
  pinnedFeatures?: FeatureId[];
  activeFeature?: FeatureId | null;
  setActiveFeature?: (feature: FeatureId | null) => void;
}

export default function Sidebar({ 
  currentView, 
  setView, 
  pinnedFeatures = [], 
  activeFeature = null, 
  setActiveFeature 
}: SidebarProps) {
  const { sessions, currentSessionId, loadSession, createSession, deleteSession } = useAppContext();
  const navItems = [
    { id: 'home', label: 'New Chat', icon: PlusCircle },
    { id: 'library', label: 'Feature Library', icon: Library },
  ] as const;

  return (
    <nav className="hidden md:flex fixed left-0 top-16 bottom-0 w-72 bg-surface border-r border-outline flex-col p-4 gap-2 z-30 transition-all duration-300">

      <div className="flex-1 flex flex-col gap-1 overflow-y-auto mt-4 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
        {navItems.map((item) => {
          const isActive = currentView === item.id;
          return (
            <button
              key={item.id}
              onClick={() => {
                if (item.id === 'home') {
                  createSession();
                }
                setView(item.id);
                if (item.id === 'home' && setActiveFeature) {
                  setActiveFeature(null);
                }
              }}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all text-sm font-medium ${
                isActive 
                  ? 'bg-secondary text-primary' 
                  : 'text-on-surface-variant hover:text-primary hover:bg-surface-hover'
              }`}
            >
              <item.icon className="w-4 h-4" />
              {item.label}
            </button>
          );
        })}

        {pinnedFeatures.length > 0 && (
          <>
            <div className="mt-8 mb-2 px-3">
              <span className="text-xs font-semibold text-tertiary uppercase tracking-wider">Pinned Features</span>
            </div>
            {pinnedFeatures.map(featId => {
              const feat = FEATURES[featId];
              if (!feat) return null;
              const isActiveFeature = activeFeature === featId && currentView === 'home';
              return (
                <button 
                  key={featId}
                  onClick={() => {
                    if (setActiveFeature) setActiveFeature(featId);
                    setView('home');
                  }}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all text-sm font-medium ${
                    isActiveFeature
                      ? 'bg-secondary text-primary'
                      : 'text-on-surface-variant hover:text-primary hover:bg-surface-hover'
                  }`}
                >
                  <feat.icon className={`w-4 h-4 ${isActiveFeature ? 'text-primary' : 'text-on-surface-variant'}`} />
                  <span className="truncate">{feat.name}</span>
                </button>
              );
            })}
          </>
        )}

        {sessions.length > 0 && (
          <>
            <div className="mt-8 mb-2 px-3">
              <span className="text-xs font-semibold text-tertiary uppercase tracking-wider">Recent Sessions</span>
            </div>
            
            {sessions.map(session => (
              <div key={session.id} className="group relative flex items-center">
                <button 
                  onClick={() => {
                    loadSession(session.id);
                    setView('active-chat');
                  }}
                  className={`flex-1 flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all text-sm font-medium truncate ${
                    currentSessionId === session.id 
                      ? 'bg-surface-hover text-primary' 
                      : 'text-on-surface-variant hover:text-primary hover:bg-surface-hover'
                  }`}
                >
                  <MessageSquare className="w-4 h-4 shrink-0" />
                  <span className="truncate">{session.title}</span>
                </button>
                <button 
                  onClick={() => deleteSession(session.id)}
                  className="absolute right-2 p-1.5 opacity-0 group-hover:opacity-100 text-on-surface-variant hover:text-red-500 hover:bg-surface rounded-md transition-all"
                >
                  <Trash className="w-3 h-3" />
                </button>
              </div>
            ))}
          </>
        )}
      </div>

      <div className="mt-auto flex flex-col gap-1 pt-4 border-t border-outline">
        <button 
          onClick={() => setView('subscription')}
          className="w-full py-2.5 px-3 rounded-lg bg-surface-hover hover:bg-secondary transition-all text-primary text-xs font-semibold flex items-center justify-between mb-2 group"
        >
          <div className="flex items-center gap-2">
            <Bolt className="w-4 h-4" />
            Upgrade to Pro
          </div>
          <span className="px-2 py-0.5 bg-primary/10 text-primary rounded-full text-[10px] uppercase tracking-wider flex items-center group-hover:bg-primary group-hover:text-background transition-colors">
            Try
          </span>
        </button>
        
        <button 
          onClick={() => setView('settings')}
          className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all text-sm font-medium ${
            currentView === 'settings' 
              ? 'bg-secondary text-primary' 
              : 'text-on-surface-variant hover:text-primary hover:bg-surface-hover'
          }`}
        >
          <Settings className="w-4 h-4" />
          Settings
        </button>
        
        <button 
          onClick={() => setView('help')}
          className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all text-sm font-medium ${
            currentView === 'help' 
              ? 'bg-secondary text-primary' 
              : 'text-on-surface-variant hover:text-primary hover:bg-surface-hover'
          }`}
        >
          <HelpCircle className="w-4 h-4" />
          Help
        </button>
      </div>
    </nav>
  );
}
