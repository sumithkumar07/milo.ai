import React from 'react';
import Sidebar from './Sidebar';
import Header from './Header';
import { ViewType, FeatureId } from '../types';

interface LayoutProps {
  children: React.ReactNode;
  currentView: ViewType;
  setView: (view: ViewType) => void;
  pinnedFeatures: FeatureId[];
  activeFeature: FeatureId | null;
  setActiveFeature: (feature: FeatureId | null) => void;
}

export default function Layout({ 
  children, 
  currentView, 
  setView, 
  pinnedFeatures, 
  activeFeature, 
  setActiveFeature 
}: LayoutProps) {
  return (
    <div className="min-h-screen flex text-white overflow-hidden bg-background">
      <Header setView={setView} />
      <Sidebar 
        currentView={currentView} 
        setView={setView} 
        pinnedFeatures={pinnedFeatures}
        activeFeature={activeFeature}
        setActiveFeature={setActiveFeature}
      />
      
      <main className="flex-1 md:ml-72 pt-24 min-h-screen overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
        <div className="max-w-[1400px] mx-auto px-4 md:px-8 pb-32">
          {children}
        </div>
      </main>
    </div>
  );
}
