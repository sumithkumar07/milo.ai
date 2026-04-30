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
}


export interface ChatSession {
  id: string;
  title: string;
  timestamp: number;
  messages: Message[];
  tags: string[];
}
