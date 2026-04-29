import React from 'react';
import { 
  Image as ImageIcon,
  Mic,
  Database,
  Blocks,
  Pin,
  PinOff
} from 'lucide-react';
import { motion } from 'motion/react';
import { ViewType, FeatureId } from '../types';
import { FEATURES } from '../features';

interface LibraryViewProps {
  setView: (view: ViewType) => void;
  pinnedFeatures: FeatureId[];
  setPinnedFeatures: React.Dispatch<React.SetStateAction<FeatureId[]>>;
  setActiveFeature: (feature: FeatureId | null) => void;
}

export default function LibraryView({ 
  setView, 
  pinnedFeatures, 
  setPinnedFeatures,
  setActiveFeature 
}: LibraryViewProps) {
  const futureFeatures = [
    { name: 'Visual Synthesis', desc: 'Generate high-fidelity images from natural language descriptions.', icon: ImageIcon },
    { name: 'Voice Interaction', desc: 'Real-time conversational voice mode with emotional intelligence.', icon: Mic },
    { name: 'Advanced Data Mode', desc: 'Directly analyze CSVs, create charts, and discover data trends.', icon: Database },
  ];

  const handleTogglePin = (e: React.MouseEvent, id: FeatureId) => {
    e.stopPropagation();
    if (pinnedFeatures.includes(id)) {
      setPinnedFeatures(prev => prev.filter(f => f !== id));
    } else {
      if (pinnedFeatures.length < 5) {
        setPinnedFeatures(prev => [...prev, id]);
      } else {
        alert("You can only pin up to 5 features at a time.");
      }
    }
  };

  const handleLaunch = (id: FeatureId) => {
    setActiveFeature(id);
    setView('home');
  };

  const activeFeaturesList = Object.values(FEATURES);

  return (
    <div className="flex flex-col gap-10 pt-8 max-w-[1000px] mx-auto">
      <div className="space-y-4 text-center md:text-left">
        <h1 className="text-4xl font-bold tracking-tight">Feature Library</h1>
        <p className="text-on-surface-variant text-lg leading-relaxed max-w-2xl">
          Explore the current capabilities and upcoming specialized modes built into MILO. Pin up to 5 features to your sidebar for quick access.
        </p>
      </div>

      <div className="space-y-6">
        <div className="flex items-center justify-between border-b border-outline pb-2">
          <div className="flex items-center gap-2">
            <Blocks className="w-5 h-5 text-primary" />
            <h2 className="text-2xl font-bold">Active Capabilities</h2>
          </div>
          <span className="text-[10px] font-bold text-tertiary uppercase tracking-widest">{pinnedFeatures.length}/5 Pinned</span>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {activeFeaturesList.map((feat, i) => {
            const isPinned = pinnedFeatures.includes(feat.id);
            return (
              <motion.div 
                key={feat.id}
                onClick={() => handleLaunch(feat.id)}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.1 }}
                className={`cursor-pointer rounded-3xl p-8 border hover:scale-[1.02] transition-all relative overflow-hidden group flex flex-col h-full ${
                  isPinned 
                    ? 'bg-surface border-primary/30 shadow-[0_0_30px_rgba(255,255,255,0.05)]' 
                    : 'bg-surface/30 border-outline hover:border-on-surface-variant'
                }`}
              >
                {isPinned && (
                  <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent pointer-events-none" />
                )}
                
                <div className="flex justify-between items-start mb-6 relative z-10">
                  <feat.icon className={`w-8 h-8 ${isPinned ? 'text-primary' : 'text-on-surface-variant group-hover:text-primary'} transition-colors`} />
                  <button 
                    onClick={(e) => handleTogglePin(e, feat.id)}
                    className={`p-2 rounded-full transition-colors ${
                      isPinned 
                        ? 'bg-primary/20 text-primary hover:bg-primary/30' 
                        : 'bg-surface-hover text-on-surface-variant hover:text-primary hover:bg-secondary'
                    }`}
                    title={isPinned ? "Unpin feature" : "Pin feature"}
                  >
                    {isPinned ? <PinOff className="w-4 h-4" /> : <Pin className="w-4 h-4" />}
                  </button>
                </div>

                <h3 className={`text-xl font-bold mb-2 ${isPinned ? 'text-primary' : 'text-on-background transition-colors group-hover:text-primary'} relative z-10`}>
                  {feat.name}
                </h3>
                <p className="text-sm text-on-surface-variant leading-relaxed mb-6 flex-1 relative z-10">
                  {feat.desc}
                </p>
                <div className={`flex items-center gap-2 text-xs font-bold uppercase tracking-widest mt-auto relative z-10 ${isPinned ? 'text-primary' : 'text-tertiary group-hover:text-primary'} transition-colors`}>
                  Launch Feature
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>

      <div className="space-y-6 mt-4">
        <div className="flex items-center gap-2 border-b border-outline pb-2">
          <Database className="w-5 h-5 text-on-surface-variant" />
          <h2 className="text-2xl font-bold text-on-surface-variant">Coming Soon</h2>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {futureFeatures.map((feat, i) => (
            <motion.div 
              key={feat.name}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.3 + i * 0.1 }}
              className="rounded-3xl p-6 border border-dashed border-outline bg-surface/50 hover:bg-surface transition-all opacity-70 hover:opacity-100 flex flex-col h-full"
            >
              <feat.icon className="w-6 h-6 mb-4 text-on-surface-variant" />
              <h3 className="text-lg font-bold mb-2">{feat.name}</h3>
              <p className="text-[13px] text-on-surface-variant leading-relaxed">{feat.desc}</p>
              <div className="mt-auto pt-6 text-[10px] font-bold uppercase tracking-widest text-tertiary">
                In Development
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}
