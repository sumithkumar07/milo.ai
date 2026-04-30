/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type ViewType = 'home' | 'active-chat' | 'library' | 'settings' | 'subscription' | 'help' | 'profile';

export type FeatureId = 'deep-search' | 'code-gen' | 'doc-analysis';

export interface Message {
  id: string;
  role: 'user' | 'model';
  content: string;
  isStreaming?: boolean;
  imageUrl?: string;
  searchResults?: { title: string; url: string; snippet: string; source: string }[];
  searchStatus?: string[];
  executionResults?: { code: string; language: string; stdout: string; stderr: string; plots: string[]; success: boolean; executionTimeMs?: number }[];
  ragSources?: { name: string; chunkIndex: number; score?: number }[];
}


export interface ChatSession {
  id: string;
  title: string;
  timestamp: number;
  messages: Message[];
  tags: string[];
}
