import { apiRequest } from '@/lib/queryClient';

export interface OpenRouterModel {
  id: string;
  name: string;
  description?: string;
  pricing?: {
    prompt: string;
    completion: string;
  };
  context_length?: number;
  architecture?: {
    modality?: string;
    tokenizer?: string;
    instruct_type?: string;
  };
  top_provider?: {
    max_completion_tokens?: number;
    is_moderated?: boolean;
  };
  per_request_limits?: {
    prompt_tokens?: string;
    completion_tokens?: string;
  };
}

export interface OpenRouterModelsResponse {
  data: OpenRouterModel[];
}

export interface ProcessedModel {
  id: string;
  name: string;
  description?: string;
  contextLength?: number;
  pricing?: {
    input: number;
    output: number;
  };
  supportsTools?: boolean;
}



/** OpenRouter model IDs that support tool/function calling (openrouter.ai/models?supported_parameters=tools) */
const FUNCTION_CALLING_SUPPORTED_MODELS = new Set([
  'openai/gpt-5.2',
  'openai/gpt-5-mini',
  'openai/gpt-5-nano',
  'openai/gpt-5.2-pro',
  'openai/gpt-5',
  'openai/gpt-4o',
  'openai/gpt-4o-mini',
  'openai/gpt-4o-2024-11-20',
  'openai/gpt-4o-2024-08-06',
  'openai/gpt-4o-2024-05-13',
  'openai/gpt-4',
  'openai/gpt-4-turbo',
  'openai/gpt-4-turbo-preview',
  'openai/gpt-4-turbo-2024-04-09',
  'openai/gpt-4-1106-preview',
  'openai/gpt-4-vision-preview',
  'openai/gpt-3.5-turbo',
  'openai/gpt-3.5-turbo-0125',
  'openai/gpt-3.5-turbo-1106',
  'openai/gpt-oss-120b',
  'openai/gpt-oss-20b',
  'anthropic/claude-sonnet-4.5',
  'anthropic/claude-3-5-sonnet',
  'anthropic/claude-3-opus',
  'anthropic/claude-3-sonnet',
  'anthropic/claude-3-haiku',
  'anthropic/claude-3-5-sonnet-20241022',
  'anthropic/claude-3-5-haiku',
  'anthropic/claude-3-5-sonnet-20240620',
  'google/gemini-3-flash-preview',
  'google/gemini-2.5-pro',
  'google/gemini-2.5-flash',
  'google/gemini-2.5-flash-lite',
  'google/gemini-2.0-flash',
  'google/gemini-2.0-flash-lite',
  'google/gemini-2.0-flash-exp',
  'google/gemini-2.0-flash-thinking-exp',
  'google/gemini-pro',
  'google/gemini-1.5-pro',
  'google/gemini-1.5-flash',
  'google/gemini-1.5-pro-latest',
  'google/gemini-1.5-flash-latest',
  'thudm/glm-4-32b',
  'thudm/glm-z1-32b',
  'thudm/glm-z1-rumination-32b',
  '01-ai/yi-large-fc',
  'mistralai/mistral-large',
  'mistralai/mistral-medium',
  'mistralai/mistral-small',
  'mistralai/mixtral-8x7b-instruct',
  'mistralai/mistral-7b-instruct',
  'mistralai/pixtral-12b',
  'mistralai/mistral-nemo',
  'cohere/command-r-plus',
  'cohere/command-r',
  'cognitivecomputations/dolphin-llama-3-70b',
  'cognitivecomputations/dolphin3.0-mistral-24b',
  'xai/grok-4',
  'xai/grok-4-0709',
  'xai/grok-3',
  'xai/grok-3-latest',
  'xai/grok-2',
  'xai/grok-2-latest',
  'xai/grok-2-1212',
  'xai/grok-beta',
  'qwen/qwen-2.5-72b-instruct',
  'qwen/qwen-2.5-coder-32b-instruct',
  'qwen/qwq-32b-preview',
  'deepseek/deepseek-chat',
  'deepseek/deepseek-coder',
  'meta-llama/llama-3.1-405b-instruct',
  'meta-llama/llama-3.1-70b-instruct',
  'perplexity/llama-3.1-sonar-large-128k-online',
  'perplexity/llama-3.1-sonar-small-128k-online'
]);

/** Used when OpenRouter /api/openrouter/models fails; tool-capable models */
const FALLBACK_MODELS: ProcessedModel[] = [
  { id: 'openai/gpt-5.2', name: 'GPT-5.2 (via OpenRouter)', supportsTools: true },
  { id: 'openai/gpt-5-mini', name: 'GPT-5 Mini (via OpenRouter)', supportsTools: true },
  { id: 'openai/gpt-4o-mini', name: 'GPT-4o Mini (via OpenRouter)', supportsTools: true },
  { id: 'openai/gpt-4o', name: 'GPT-4o (via OpenRouter)', supportsTools: true },
  { id: 'openai/gpt-3.5-turbo', name: 'GPT-3.5 Turbo (via OpenRouter)', supportsTools: true },
  { id: 'openai/gpt-oss-20b', name: 'GPT OSS 20B (OpenAI)', supportsTools: true },
  { id: 'anthropic/claude-sonnet-4.5', name: 'Claude Sonnet 4.5', supportsTools: true },
  { id: 'anthropic/claude-3-5-sonnet', name: 'Claude 3.5 Sonnet', supportsTools: true },
  { id: 'anthropic/claude-3-haiku', name: 'Claude 3 Haiku', supportsTools: true },
  { id: 'google/gemini-3-flash-preview', name: 'Gemini 3 Flash Preview', supportsTools: true },
  { id: 'google/gemini-2.5-flash', name: 'Gemini 2.5 Flash', supportsTools: true },
  { id: 'google/gemini-2.5-pro', name: 'Gemini 2.5 Pro', supportsTools: true },
  { id: 'google/gemini-2.0-flash', name: 'Gemini 2.0 Flash', supportsTools: true },
  { id: 'thudm/glm-4-32b', name: 'GLM-4 32B', supportsTools: true },
  { id: '01-ai/yi-large-fc', name: 'Yi Large FC', supportsTools: true },
  { id: 'mistralai/mistral-nemo', name: 'Mistral Nemo 12B', supportsTools: true },
  { id: 'cognitivecomputations/dolphin-llama-3-70b', name: 'Dolphin Llama 3 70B', supportsTools: true },
  { id: 'cohere/command-r-plus', name: 'Command R+', supportsTools: true },
  { id: 'xai/grok-4', name: 'Grok 4 (xAI)', supportsTools: true },
  { id: 'xai/grok-3', name: 'Grok 3 (xAI)', supportsTools: true },
  { id: 'xai/grok-2', name: 'Grok 2 (xAI)', supportsTools: true },
  { id: 'meta-llama/llama-3.1-70b-instruct', name: 'Llama 3.1 70B', supportsTools: true },
  { id: 'meta-llama/llama-3.1-8b-instruct', name: 'Llama 3.1 8B', supportsTools: false },
  { id: 'qwen/qwen-2.5-72b-instruct', name: 'Qwen 2.5 72B', supportsTools: true }
];


const NON_TEXT_KEYWORDS = [
  'image', 'vision', 'img', 'picture', 'photo', 'visual',
  'audio', 'speech', 'voice', 'sound', 'whisper', 'tts',
  'video', 'clip', 'movie', 'film',
  'embedding', 'embed', 'vector',
  'moderation', 'moderate', 'safety',
  'code-only', 'coding-only'
];


const TEXT_KEYWORDS = [
  'chat', 'instruct', 'text', 'language', 'conversation',
  'assistant', 'gpt', 'claude', 'llama', 'mistral', 'gemini'
];

/**
 * Check if a model is primarily for text processing
 */
function isTextModel(model: OpenRouterModel): boolean {
  const modelName = model.name.toLowerCase();
  const modelId = model.id.toLowerCase();
  const description = (model.description || '').toLowerCase();
  const combined = `${modelName} ${modelId} ${description}`;


  const hasNonTextKeywords = NON_TEXT_KEYWORDS.some(keyword => 
    combined.includes(keyword)
  );

  if (hasNonTextKeywords) {
    return false;
  }


  const modality = model.architecture?.modality?.toLowerCase();
  if (modality && !modality.includes('text') && !modality.includes('language')) {
    return false;
  }


  const hasTextKeywords = TEXT_KEYWORDS.some(keyword => 
    combined.includes(keyword)
  );


  return hasTextKeywords || !hasNonTextKeywords;
}

/**
 * Process and format model name for display
 */
function formatModelName(model: OpenRouterModel): string {
  let name = model.name;
  

  if (name === model.id || name.length < 10) {
    const parts = model.id.split('/');
    if (parts.length === 2) {
      const [provider, modelName] = parts;
      name = `${modelName.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase())} (${provider})`;
    }
  }
  
  return name;
}

/**
 * Convert pricing strings to numbers (handles formats like "0.000001" or "$0.000001")
 */
function parsePricing(priceStr: string): number {
  if (!priceStr) return 0;
  const cleaned = priceStr.replace(/[$,]/g, '');
  return parseFloat(cleaned) || 0;
}

/**
 * Fetch available models from OpenRouter API
 */
export async function fetchOpenRouterModels(): Promise<ProcessedModel[]> {
  try {

    const response = await apiRequest('GET', '/api/openrouter/models');
    const data = await response.json() as OpenRouterModelsResponse;

    if (!data.data || !Array.isArray(data.data)) {
      console.warn('Invalid OpenRouter models response, using fallback');
      return FALLBACK_MODELS;
    }


    const textModels = data.data
      .filter((model: OpenRouterModel) => isTextModel(model))
      .map((model: OpenRouterModel): ProcessedModel => ({
        id: model.id,
        name: formatModelName(model),
        description: model.description,
        contextLength: model.context_length,
        pricing: model.pricing ? {
          input: parsePricing(model.pricing.prompt),
          output: parsePricing(model.pricing.completion)
        } : undefined,
        supportsTools: FUNCTION_CALLING_SUPPORTED_MODELS.has(model.id)
      }))
      .sort((a: ProcessedModel, b: ProcessedModel) => {

        const aProvider = a.id.split('/')[0];
        const bProvider = b.id.split('/')[0];

        if (aProvider !== bProvider) {
          return aProvider.localeCompare(bProvider);
        }

        return a.name.localeCompare(b.name);
      });


    if (textModels.length === 0) {
      console.warn('No text models found in OpenRouter response, using fallback');
      return FALLBACK_MODELS;
    }

    const idsFromApi = new Set(textModels.map(m => m.id));
    const merged = [...textModels];
    for (const fallback of FALLBACK_MODELS) {
      if (!idsFromApi.has(fallback.id)) {
        merged.push(fallback);
        idsFromApi.add(fallback.id);
      }
    }
    merged.sort((a, b) => {
      const aProvider = a.id.split('/')[0];
      const bProvider = b.id.split('/')[0];
      if (aProvider !== bProvider) return aProvider.localeCompare(bProvider);
      return a.name.localeCompare(b.name);
    });

    return merged;
  } catch (error) {
    console.error('Failed to fetch OpenRouter models:', error);
    return FALLBACK_MODELS;
  }
}

/**
 * Get cached models or fetch fresh ones
 */
export function useOpenRouterModels() {
  const CACHE_KEY = 'openrouter-models';
  const CACHE_DURATION = 60 * 60 * 1000; // 1 hour in milliseconds

  return {
    queryKey: [CACHE_KEY],
    queryFn: fetchOpenRouterModels,
    staleTime: CACHE_DURATION,
    cacheTime: CACHE_DURATION * 2, // Keep in cache for 2 hours
    retry: 2,
    retryDelay: (attemptIndex: number) => Math.min(1000 * 2 ** attemptIndex, 30000),
  };
}
