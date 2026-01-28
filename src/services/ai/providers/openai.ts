/**
 * OpenAI AI Provider
 *
 * Also supports OpenAI-compatible APIs (Ollama, LM Studio, vLLM, LocalAI)
 * via the baseUrl option.
 */

import OpenAI from 'openai';
import { AIProvider } from './base.js';
import { IAIRequest, IAIResponse } from '../types.js';

export interface OpenAIProviderOptions {
  /** Custom API base URL for local/compatible servers */
  baseUrl?: string;
}

export class OpenAIProvider extends AIProvider {
  private client: OpenAI;
  private defaultBaseUrl?: string;

  constructor(options?: OpenAIProviderOptions) {
    // API key is optional when using a custom baseUrl (local servers often don't require auth)
    super('OPENAI_API_KEY', { optional: !!options?.baseUrl });

    this.defaultBaseUrl = options?.baseUrl;

    this.client = new OpenAI({
      apiKey: this.apiKey || 'not-required', // Some local servers need a placeholder
      baseURL: options?.baseUrl,
    });
  }

  async generateEdits(request: IAIRequest): Promise<IAIResponse> {
    const systemPrompt = this.buildSystemPrompt();
    const userMessage = this.buildUserMessage(request);

    // Use request-level baseUrl if provided, otherwise use constructor default
    let client = this.client;
    if (request.baseUrl && request.baseUrl !== this.defaultBaseUrl) {
      client = new OpenAI({
        apiKey: this.apiKey || 'not-required',
        baseURL: request.baseUrl,
      });
    }

    const response = await client.chat.completions.create({
      model: request.model || 'gpt-4o',
      max_tokens: request.maxTokens || 4096,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      response_format: { type: 'json_object' },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('No response content from OpenAI');
    }

    const result = this.parseJsonResponse(content);
    result.tokensUsed = response.usage?.completion_tokens;

    return result;
  }
}
