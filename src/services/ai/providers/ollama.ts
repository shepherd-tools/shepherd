/**
 * Ollama AI Provider
 *
 * Ollama is a popular tool for running LLMs locally.
 * This provider uses Ollama's OpenAI-compatible API endpoint.
 *
 * @see https://ollama.ai
 */

import OpenAI from 'openai';
import { AIProvider } from './base.js';
import { IAIRequest, IAIResponse } from '../types.js';

const DEFAULT_OLLAMA_HOST = 'http://localhost:11434';
const DEFAULT_MODEL = 'llama3.2';

export class OllamaProvider extends AIProvider {
  private client: OpenAI;
  private baseUrl: string;

  constructor() {
    // Ollama doesn't require an API key, but we check for OLLAMA_HOST
    super('OLLAMA_API_KEY', { optional: true });

    // Use OLLAMA_HOST env var or default to localhost
    const host = process.env.OLLAMA_HOST || DEFAULT_OLLAMA_HOST;
    this.baseUrl = `${host}/v1`;

    this.client = new OpenAI({
      apiKey: 'ollama', // Ollama doesn't validate this, but OpenAI client requires it
      baseURL: this.baseUrl,
    });
  }

  async generateEdits(request: IAIRequest): Promise<IAIResponse> {
    const systemPrompt = this.buildSystemPrompt();
    const userMessage = this.buildUserMessage(request);

    // Use request-level baseUrl if provided
    let client = this.client;
    if (request.baseUrl) {
      client = new OpenAI({
        apiKey: 'ollama',
        baseURL: request.baseUrl,
      });
    }

    const response = await client.chat.completions.create({
      model: request.model || DEFAULT_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      // Ollama supports JSON mode via format parameter
      response_format: { type: 'json_object' },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('No response content from Ollama');
    }

    const result = this.parseJsonResponse(content);
    result.tokensUsed = response.usage?.completion_tokens;

    return result;
  }
}
