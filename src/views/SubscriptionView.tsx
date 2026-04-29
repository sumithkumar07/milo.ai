import React, { useState } from 'react';
import { CheckCircle2, Zap, ArrowRight, Shield } from 'lucide-react';
import { motion } from 'motion/react';

export default function SubscriptionView() {
  const [isProcessing, setIsProcessing] = useState(false);

  const handleSubscribe = () => {
    setIsProcessing(true);
    // In a fully real app, this would redirect to a Stripe Checkout Session
    setTimeout(() => {
      window.open('https://buy.stripe.com/test_dummy_link', '_blank');
      setIsProcessing(false);
    }, 1000);
  };

  return (
    <div className="max-w-4xl mx-auto py-12 px-6">
      <div className="text-center mb-16">
        <h1 className="text-4xl font-bold tracking-tight mb-4 text-on-background">Upgrade to MILO Pro</h1>
        <p className="text-lg text-on-surface-variant max-w-2xl mx-auto">
          Pay once, own forever. MILO is a Bring-Your-Own-Key (BYOK) platform, meaning you use your own API keys while we provide the blazing-fast UI and advanced workflow engine.
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-8 max-w-3xl mx-auto">
        {/* Basic Tier */}
        <div className="p-8 border border-outline rounded-3xl bg-surface/30 flex flex-col">
          <div className="mb-8">
            <h2 className="text-xl font-bold mb-2 text-on-background">Community</h2>
            <div className="flex items-baseline gap-1 mb-4">
              <span className="text-4xl font-bold text-on-background">$0</span>
              <span className="text-on-surface-variant">/ forever</span>
            </div>
            <p className="text-sm text-on-surface-variant">
              Essential tools for everyday productivity.
            </p>
          </div>
          
          <ul className="space-y-4 mb-8 flex-1">
            {['Chat with Gemini, OpenAI, Claude', 'Deep Search (WiKi/CrossRef)', 'Basic Document Analysis', 'Local Storage History'].map((feature, i) => (
              <li key={i} className="flex items-start gap-3 text-sm text-on-surface">
                <CheckCircle2 className="w-5 h-5 text-on-surface-variant shrink-0" />
                {feature}
              </li>
            ))}
          </ul>

          <button className="w-full py-4 rounded-xl bg-surface border border-outline text-on-surface font-bold opacity-50 cursor-not-allowed">
            Current Plan
          </button>
        </div>

        {/* Pro Tier */}
        <div className="relative p-8 border-2 border-primary rounded-3xl bg-surface flex flex-col overflow-hidden">
          <div className="absolute top-0 right-0 bg-primary text-background text-[10px] font-bold px-4 py-1.5 rounded-bl-xl tracking-widest uppercase">
            Recommended
          </div>
          <div className="mb-8">
            <h2 className="text-2xl font-bold mb-2 flex items-center gap-2 text-primary">MILO Pro</h2>
            <div className="flex items-baseline gap-1 mb-4">
              <span className="text-4xl font-bold text-on-background">$39</span>
              <span className="text-on-surface-variant">one-time</span>
            </div>
            <p className="text-sm text-on-surface-variant">
              The ultimate power-user toolkit.
            </p>
          </div>
          
          <ul className="space-y-4 mb-8 flex-1">
            {[
              'Custom OpenAI-Compatible Providers',
              'Advanced PDF/Document Parsing',
              'Unlimited saved workflows & custom prompts',
              'Code preview artifact rendering',
              'Priority 24/7 Email Support'
            ].map((feature, i) => (
              <li key={i} className="flex items-start gap-3 text-sm text-on-surface">
                <CheckCircle2 className="w-5 h-5 text-primary shrink-0" />
                {feature}
              </li>
            ))}
          </ul>

          <button 
            onClick={handleSubscribe}
            disabled={isProcessing}
            className="w-full py-4 rounded-xl relative overflow-hidden group bg-primary text-background font-bold flex flex-col items-center justify-center transition-all hover:opacity-90 disabled:opacity-75"
          >
            <div className="flex items-center gap-2 z-10 transition-transform group-hover:-translate-y-[2px]">
              {isProcessing ? 'Redirecting...' : 'Upgrade to Pro'} <Zap className="w-4 h-4 group-hover:scale-110 transition-transform" />
            </div>
          </button>
        </div>
      </div>
      
      <div className="mt-12 text-center text-sm text-on-surface-variant flex items-center justify-center gap-2">
        <Shield className="w-4 h-4" /> Secure payments handled by Stripe.
      </div>
    </div>
  );
}
