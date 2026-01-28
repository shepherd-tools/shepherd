/**
 * Claude (Anthropic) AI Provider
 */

import Anthropic from '@anthropic-ai/sdk';
import { AIProvider } from './base.js';
import { IAIRequest, IAIResponse } from '../types.js';

export class ClaudeProvider extends AIProvider {
  private client: Anthropic;

  constructor() {
    super('ANTHROPIC_API_KEY');
    this.client = new Anthropic({ apiKey: this.apiKey });
  }

  async generateEdits(request: IAIRequest): Promise<IAIResponse> {
    const systemPrompt = this.buildSystemPrompt();
    const userMessage = this.buildUserMessage(request);

    const response = await this.client.messages.create({
      model: request.model || 'claude-sonnet-4-20250514',
      max_tokens: request.maxTokens || 4096,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    });

    // Extract text content from response
    const textContent = response.content.find((block) => block.type === 'text');
    if (!textContent || textContent.type !== 'text') {
      throw new Error('No text response from Claude');
    }

    const result = this.parseJsonResponse(textContent.text);
    result.tokensUsed = response.usage?.output_tokens;

    return result;
  }
}
