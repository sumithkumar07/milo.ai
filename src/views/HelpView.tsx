import React, { useState } from 'react';
import { HelpCircle, MessageCircle, FileText, Settings, ChevronRight, Mail, ExternalLink } from 'lucide-react';
import { motion } from 'motion/react';

export default function HelpView() {
  const [searchQuery, setSearchQuery] = useState('');

  const helpTopics = [
    { title: 'Getting Started', desc: 'Learn the basics of MILO and write your first prompt.', icon: FileText },
    { title: 'Connecting APIs', desc: 'How to bring your own key (Gemini, OpenAI, Anthropic).', icon: Settings },
    { title: 'Deep Search', desc: 'Using Wikipedia & CrossRef to gather information.', icon: HelpCircle },
    { title: 'Privacy & Data', desc: 'How your keys and data remain secure.', icon: Shield }
  ];

  const faqs = [
    { q: 'Where are my API keys stored?', a: 'Your API keys are stored securely in your browser\'s local storage. They are never sent to our servers except to proxy requests to the provider.' },
    { q: 'How do I cancel my subscription?', a: 'You can manage your billing settings via the Stripe customer portal linked in the Subscription tab.' },
    { q: 'Why is the Custom Provider not working?', a: 'Please ensure your Custom Base URL starts with https:// and your API key is correct. The backend proxy handles CORS automatically.' }
  ];

  return (
    <div className="max-w-4xl mx-auto py-12 px-6">
      <div className="text-center mb-16">
        <h1 className="text-4xl font-bold tracking-tight mb-4 text-on-background">How can we help?</h1>
        <div className="max-w-xl mx-auto relative">
          <input 
            type="text" 
            placeholder="Search for articles or questions..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-surface border border-outline rounded-2xl px-6 py-4 pl-12 text-on-surface focus:outline-none focus:border-primary transition-colors"
          />
          <HelpCircle className="w-5 h-5 text-on-surface-variant absolute left-4 top-1/2 -translate-y-1/2" />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-16">
        {helpTopics.map((topic, i) => (
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            key={i} 
            className="p-6 border border-outline rounded-2xl bg-surface/30 hover:bg-surface cursor-pointer group transition-colors"
          >
            <topic.icon className="w-6 h-6 text-primary mb-4" />
            <h3 className="font-bold text-on-background mb-2">{topic.title}</h3>
            <p className="text-sm text-on-surface-variant line-clamp-2">{topic.desc}</p>
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
        <div className="lg:col-span-2 space-y-6">
          <h2 className="text-2xl font-bold text-on-background mb-6">Frequently Asked Questions</h2>
          <div className="space-y-4">
            {faqs.filter(f => f.q.toLowerCase().includes(searchQuery.toLowerCase()) || f.a.toLowerCase().includes(searchQuery.toLowerCase())).map((faq, i) => (
              <div key={i} className="p-6 border border-outline rounded-2xl bg-surface/30">
                <h4 className="font-bold text-on-background mb-2 text-lg">{faq.q}</h4>
                <p className="text-on-surface-variant leading-relaxed">{faq.a}</p>
              </div>
            ))}
            {faqs.filter(f => f.q.toLowerCase().includes(searchQuery.toLowerCase()) || f.a.toLowerCase().includes(searchQuery.toLowerCase())).length === 0 && (
              <div className="text-on-surface-variant">No FAQs matching your search.</div>
            )}
          </div>
        </div>

        <div className="space-y-6">
          <div className="p-6 border border-outline rounded-2xl bg-primary/5 border-primary/20">
            <h3 className="font-bold text-on-background mb-2 flex items-center gap-2">
              <MessageCircle className="w-5 h-5 text-primary" />
              Contact Support
            </h3>
            <p className="text-sm text-on-surface-variant mb-6">
              Our support team is available 24/7 via email.
            </p>
            <a href="mailto:support@example.com" className="w-full py-3 bg-surface border border-outline text-on-surface rounded-xl flex items-center justify-center gap-2 text-sm font-bold hover:bg-surface-hover transition-colors">
              <Mail className="w-4 h-4" /> Email Us
            </a>
          </div>

          <div className="p-6 border border-outline rounded-2xl bg-surface/30">
            <h3 className="font-bold text-on-background mb-2">Community</h3>
            <p className="text-sm text-on-surface-variant mb-6">
              Join our Discord server to request features and connect.
            </p>
            <button className="w-full py-3 bg-surface border border-outline text-on-surface rounded-xl flex items-center justify-center gap-2 text-sm font-bold hover:bg-surface-hover transition-colors">
              <ExternalLink className="w-4 h-4" /> Join Discord
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
import { Shield } from 'lucide-react';
