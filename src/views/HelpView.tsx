import React from 'react';
import { motion } from 'motion/react';
import { HelpCircle, Book, MessageSquare, ExternalLink, Keyboard, Sparkles } from 'lucide-react';

export default function HelpView() {
  const categories = [
    { title: 'Getting Started', desc: 'Learn the basics of MILO and write your first prompt.', icon: Book },
    { title: 'Feature Guides', desc: 'Deep dive into Code Generation, Search, and Analysis.', icon: Sparkles },
    { title: 'Keyboard Shortcuts', desc: 'Navigate MILO faster without your mouse.', icon: Keyboard },
    { title: 'Community Feedback', desc: 'Share your thoughts and shape the future of MILO.', icon: MessageSquare },
  ];
  
  const faqs = [
    { q: 'How do I cancel my subscription?', a: 'You can cancel anytime in the billing settings under your profile.' },
    { q: 'What is the limit for Code Generation?', a: 'Pro users have unlimited code generation. Basic users are limited to 30 complex snippets per day.' },
    { q: 'Can I delete my chat history?', a: 'Yes, navigate to Settings > Privacy to manage or clear all local history.' },
  ];

  return (
    <div className="flex flex-col gap-10 pt-8 pb-32 max-w-[800px] mx-auto w-full">
      <div className="space-y-4">
        <h1 className="text-4xl font-bold tracking-tight">Help Center</h1>
        <p className="text-on-surface-variant text-lg">
          Find answers, explore guides, or reach out to our team.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {categories.map((cat, i) => (
          <motion.div 
            key={i} 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            className="p-6 border border-outline rounded-3xl bg-surface/30 hover:bg-surface transition-colors cursor-pointer group"
          >
            <cat.icon className="w-6 h-6 text-on-surface-variant mb-4 group-hover:text-primary transition-colors" />
            <h3 className="text-lg font-semibold mb-2">{cat.title}</h3>
            <p className="text-sm text-on-surface-variant">{cat.desc}</p>
          </motion.div>
        ))}
      </div>

      <div className="mt-8 space-y-6">
        <h2 className="text-2xl font-bold tracking-tight">Frequently Asked Questions</h2>
        <div className="space-y-4">
          {faqs.map((faq, i) => (
            <div key={i} className="p-6 border border-outline rounded-2xl bg-surface/20">
              <h4 className="text-base font-semibold mb-2">{faq.q}</h4>
              <p className="text-sm text-on-surface-variant leading-relaxed">{faq.a}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-8 p-8 border border-outline rounded-3xl bg-surface/50 text-center space-y-4 flex flex-col items-center">
        <HelpCircle className="w-8 h-8 text-on-surface-variant" />
        <h3 className="text-xl font-semibold">Still need help?</h3>
        <p className="text-on-surface-variant text-sm max-w-md">
          Our support team is available 24/7. Pro users receive priority response within 1 hour.
        </p>
        <button className="mt-4 px-6 py-3 bg-primary text-background rounded-xl font-bold text-sm tracking-wide hover:opacity-90 flex items-center gap-2">
          Contact Support <ExternalLink className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
