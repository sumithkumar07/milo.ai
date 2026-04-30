export interface ModelCaps {
  vision: boolean;
  maxOutput: number;
}

const KNOWN_MODELS: Record<string, ModelCaps> = {
  'gemini-2.5-flash': { vision: true, maxOutput: 8192 },
  'gemini-2.5-pro': { vision: true, maxOutput: 8192 },
  'gpt-4o': { vision: true, maxOutput: 16384 },
  'gpt-4o-mini': { vision: true, maxOutput: 16384 },
  'gpt-3.5-turbo': { vision: false, maxOutput: 4096 },
  'claude-3-5-sonnet-latest': { vision: true, maxOutput: 8192 },
  'claude-3-5-sonnet-20241022': { vision: true, maxOutput: 8192 },
  'claude-3-haiku-latest': { vision: true, maxOutput: 4096 },
};

const VISION_PATTERNS = [
  /vision/i, /4o/i, /claude-3/i, /gemini/i, /llama.*90b/i, /llama.*11b.*vision/i
];

const TEXT_ONLY_PATTERNS = [
  /^meta\/llama-3\.\d-\d+b(?!.*vision)/i,
  /^gpt-3\./i,
  /^gpt-4(?!o)/i,
  /^nvidia\/(?!.*llama.*90b)/i,
];

export function getModelCaps(provider: string, modelName: string): ModelCaps {
  if (modelName && KNOWN_MODELS[modelName]) return KNOWN_MODELS[modelName];

  const name = modelName || getDefaultModel(provider);
  if (KNOWN_MODELS[name]) return KNOWN_MODELS[name];

  for (const p of VISION_PATTERNS) {
    if (p.test(name)) return { vision: true, maxOutput: 8192 };
  }
  for (const p of TEXT_ONLY_PATTERNS) {
    if (p.test(name)) return { vision: false, maxOutput: 4096 };
  }

  return { vision: false, maxOutput: 4096 };
}

function getDefaultModel(provider: string): string {
  switch (provider) {
    case 'gemini': return 'gemini-2.5-flash';
    case 'openai': return 'gpt-4o';
    case 'anthropic': return 'claude-3-5-sonnet-latest';
    default: return '';
  }
}
