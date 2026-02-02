import express from 'express';
import fetch from 'node-fetch';

const router = express.Router();

/**
 * Proxy endpoint for OpenRouter models API
 * This avoids CORS issues when calling OpenRouter directly from the frontend
 */
router.get('/models', async (req, res) => {
  try {

    const openRouterUrl = 'https://openrouter.ai/api/v1/models';
    

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://powerchat.plus',
      'X-Title': 'PowerChat Plus'
    };


    const openRouterApiKey = process.env.OPENROUTER_API_KEY;
    if (openRouterApiKey) {
      headers['Authorization'] = `Bearer ${openRouterApiKey}`;
    }


    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

    const response = await fetch(openRouterUrl, {
      method: 'GET',
      headers,
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`OpenRouter API responded with status: ${response.status}`);
    }

    const data = await response.json();
    

    res.json(data);
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      console.error('OpenRouter API request timed out');
    } else {
      console.error('Error fetching OpenRouter models:', error);
    }
    


    const fallbackModels = {
      data: [
        { id: 'openai/gpt-5.2', name: 'GPT-5.2', description: 'OpenAI frontier model', pricing: { prompt: '0.0025', completion: '0.01' }, context_length: 128000, architecture: { modality: 'text' } },
        { id: 'openai/gpt-5-mini', name: 'GPT-5 Mini', description: 'Fast GPT-5 for most tasks', pricing: { prompt: '0.00015', completion: '0.0006' }, context_length: 128000, architecture: { modality: 'text' } },
        { id: 'openai/gpt-4o-mini', name: 'GPT-4o Mini', description: 'Fast and efficient model for most tasks', pricing: { prompt: '0.00015', completion: '0.0006' }, context_length: 128000, architecture: { modality: 'text' } },
        { id: 'openai/gpt-4o', name: 'GPT-4o', description: 'OpenAI flexible chat model', pricing: { prompt: '0.0025', completion: '0.01' }, context_length: 128000, architecture: { modality: 'text' } },
        { id: 'openai/gpt-3.5-turbo', name: 'GPT-3.5 Turbo', description: 'OpenAI legacy chat model', pricing: { prompt: '0.0005', completion: '0.0015' }, context_length: 16385, architecture: { modality: 'text' } },
        { id: 'anthropic/claude-sonnet-4.5', name: 'Claude Sonnet 4.5', description: 'Anthropic agentic model with tool orchestration', pricing: { prompt: '0.003', completion: '0.015' }, context_length: 200000, architecture: { modality: 'text' } },
        { id: 'anthropic/claude-3-5-sonnet', name: 'Claude 3.5 Sonnet', description: 'Anthropic capable model', pricing: { prompt: '0.003', completion: '0.015' }, context_length: 200000, architecture: { modality: 'text' } },
        { id: 'anthropic/claude-3-haiku', name: 'Claude 3 Haiku', description: 'Fast Anthropic model', pricing: { prompt: '0.00025', completion: '0.00125' }, context_length: 200000, architecture: { modality: 'text' } },
        { id: 'google/gemini-3-flash-preview', name: 'Gemini 3 Flash Preview', description: 'Google high-speed agentic model', pricing: { prompt: '0.000125', completion: '0.000375' }, context_length: 1000000, architecture: { modality: 'text' } },
        { id: 'google/gemini-2.5-flash', name: 'Gemini 2.5 Flash', description: 'Google fast model with tool calling', pricing: { prompt: '0.000125', completion: '0.000375' }, context_length: 1000000, architecture: { modality: 'text' } },
        { id: 'google/gemini-2.0-flash', name: 'Gemini 2.0 Flash', description: 'Google efficient model', pricing: { prompt: '0.0001', completion: '0.0003' }, context_length: 1000000, architecture: { modality: 'text' } },
        { id: 'meta-llama/llama-3.1-70b-instruct', name: 'Llama 3.1 70B', description: 'Meta open-source instruction model', pricing: { prompt: '0.00052', completion: '0.00075' }, context_length: 128000, architecture: { modality: 'text' } },
        { id: 'meta-llama/llama-3.1-8b-instruct', name: 'Llama 3.1 8B Instruct', description: 'Meta smaller instruction model', pricing: { prompt: '0.00018', completion: '0.00018' }, context_length: 128000, architecture: { modality: 'text' } },
        { id: 'mistralai/mistral-nemo', name: 'Mistral Nemo 12B', description: 'Mistral multilingual with function calling', pricing: { prompt: '0.0002', completion: '0.0002' }, context_length: 128000, architecture: { modality: 'text' } }
      ]
    };
    
    res.json(fallbackModels);
  }
});

export default router;
