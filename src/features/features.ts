import { Search, Code, FileText, LucideIcon } from 'lucide-react';
import { FeatureId } from '../core/types';

export interface FeatureDef {
  id: FeatureId;
  name: string;
  desc: string;
  icon: LucideIcon;
}

export const FEATURES: Record<FeatureId, FeatureDef> = {
  'deep-search': {
    id: 'deep-search',
    name: 'Deep Search',
    desc: 'Real-time web search, synthesis, and deep topic exploration.',
    icon: Search,
  },
  'code-gen': {
    id: 'code-gen',
    name: 'Code Execution',
    desc: 'Write, run, and debug Python code directly in your browser.',
    icon: Code,
  },
  'doc-analysis': {
    id: 'doc-analysis',
    name: 'Document Analysis',
    desc: 'Summarize and extract key insights from long technical articles.',
    icon: FileText,
  }
};
