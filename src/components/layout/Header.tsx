import React, { useState } from 'react';
import { History, Settings, Search, CircleDashed } from 'lucide-react';
import { ViewType } from '../../core/types';
import SearchModal from '../modals/SearchModal';
import { useAppContext } from '../../core/store';

interface HeaderProps {
  setView: (view: ViewType) => void;
}

export default function Header({ setView }: HeaderProps) {
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const { loadSession, profile } = useAppContext();

  return (
    <>
      <header className="fixed top-0 left-0 right-0 h-16 bg-background/80 backdrop-blur-xl border-b border-outline flex justify-between items-center px-6 z-40 transition-all">
        <button
          className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity bg-transparent border-none"
          onClick={() => setView('home')}
          aria-label="Go to home"
        >
          <div className="w-8 h-8 flex items-center justify-center bg-primary text-background rounded-full">
            <CircleDashed className="w-5 h-5" />
          </div>
          <span className="text-lg font-bold tracking-tight text-on-background">MILO AI</span>
        </button>
        <div className="hidden md:flex flex-1" />

        <div className="flex items-center gap-2 md:gap-4 font-sans">
          <button
            onClick={() => setView('subscription')}
            className="hidden md:flex text-xs font-bold uppercase tracking-wider text-background bg-primary px-3 py-1.5 rounded-full hover:opacity-90 transition-opacity"
          >
            Upgrade
          </button>
          <button
            onClick={() => setIsSearchOpen(true)}
            className="text-on-surface-variant hover:text-on-background transition-all duration-300 p-2 rounded-full hidden md:block"
          >
            <Search className="w-4 h-4" />
          </button>
          <button
            onClick={() => setView('library')}
            className="text-on-surface-variant hover:text-on-background transition-all duration-300 p-2 rounded-full"
          >
            <History className="w-4 h-4" />
          </button>
          <button
            onClick={() => setView('help')}
            className="text-on-surface-variant hover:text-on-background transition-all duration-300 p-2 rounded-full hidden sm:block"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-help-circle"><circle cx="12" cy="12" r="10" /><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" /><path d="M12 17h.01" /></svg>
          </button>
          <button
            onClick={() => setView('settings')}
            className="text-on-surface-variant hover:text-on-background transition-all duration-300 p-2 rounded-full hidden md:block"
          >
            <Settings className="w-4 h-4" />
          </button>

          <button
            className="w-7 h-7 rounded-full overflow-hidden ml-2 relative group cursor-pointer border border-outline p-0 bg-transparent"
            onClick={() => setView('profile')}
            aria-label="User profile"
          >
            <img
              alt="User profile"
              className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
              src={profile?.avatarUrl || '/default-avatar.png'}
              onError={(e) => { e.currentTarget.src = '/default-avatar.png'; }}
            />
          </button>        </div>
      </header>
      <SearchModal
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
        onSelectSession={(id) => {
          loadSession(id);
          setView('active-chat');
        }}
      />
    </>
  );
}
