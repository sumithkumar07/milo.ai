import React from 'react';
import { motion } from 'motion/react';
import { Check, Zap, Sparkles, Key } from 'lucide-react';

export default function SubscriptionView() {
  return (
    <div className="flex flex-col gap-10 pt-8 pb-32 max-w-[1000px] mx-auto w-full">
      <div className="text-center space-y-4 max-w-2xl mx-auto">
        <h1 className="text-4xl font-bold tracking-tight">Upgrade to MILO Lifetime</h1>
        <p className="text-on-surface-variant text-lg">
          Pay once, own forever. MILO is a Bring-Your-Own-Key (BYOK) platform, meaning you use your own API keys (Gemini, OpenAI, Anthropic) while we provide the blazing-fast UI and advanced workflow engine.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto mt-8">
        {/* Basic Tier */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-3xl p-8 border border-outline bg-surface/30 flex flex-col h-full"
        >
          <div className="mb-6">
            <h2 className="text-2xl font-bold mb-2">Basic</h2>
            <div className="flex items-baseline gap-2">
              <span className="text-4xl font-bold">$19</span>
              <span className="text-on-surface-variant">/lifetime</span>
            </div>
          </div>
          <p className="text-on-surface-variant text-sm mb-8">
            Essential tools for everyday productivity.
          </p>
          <ul className="space-y-4 mb-10 flex-1">
            {[
              'Bring Your Own Key (BYOK) support', 
              'Standard chat and feature workflows',
              'Access to new features (delayed rollout)',
              'Community support', 
              'Basic local history'
            ].map((item, i) => (
              <li key={i} className="flex items-center gap-3 text-sm">
                <Check className="w-5 h-5 text-on-surface-variant shrink-0" />
                <span className="text-on-surface">{item}</span>
              </li>
            ))}
          </ul>
          <button disabled className="w-full py-4 rounded-xl font-semibold bg-surface border border-outline text-on-surface-variant cursor-not-allowed">
            Current Plan
          </button>
        </motion.div>

        {/* Pro Tier */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="rounded-3xl p-8 border hover:border-on-surface transition-colors bg-surface relative flex flex-col h-full"
        >
          <div className="absolute -top-3 right-8 bg-primary text-background text-xs font-bold px-3 py-1 rounded-full uppercase tracking-widest flex items-center gap-1 shadow-lg">
            <Sparkles className="w-3 h-3" />
            Recommended
          </div>
          
          <div className="mb-6">
            <h2 className="text-2xl font-bold mb-2 flex items-center gap-2 text-primary">Pro</h2>
            <div className="flex items-baseline gap-2">
              <span className="text-4xl font-bold">$39</span>
              <span className="text-on-surface-variant">/lifetime</span>
            </div>
          </div>
          <p className="text-on-surface-variant text-sm mb-8">
             Unleash the full potential of MILO Workflows.
          </p>
          <ul className="space-y-4 mb-10 flex-1">
            {[
              'Bring Your Own Key (BYOK) support',
              'Immediate access to new experimental features',
              'Unlimited Deep Search & Data Analysis',
              'Advanced codebase refactoring tools',
              'Priority 24/7 feature support',
              'Unlimited saved workflows & custom prompts'
            ].map((item, i) => (
              <li key={i} className="flex items-start gap-3 text-sm">
                <Check className="w-5 h-5 text-primary shrink-0" />
                <span className="text-on-background mt-0.5">{item}</span>
              </li>
            ))}
          </ul>
          <button className="w-full py-4 rounded-xl font-bold bg-primary text-background hover:opacity-90 transition-opacity flex items-center justify-center gap-2 group">
            Upgrade to Pro <Zap className="w-4 h-4 group-hover:scale-110 transition-transform" />
          </button>
        </motion.div>
      </div>
    </div>
  );
}
