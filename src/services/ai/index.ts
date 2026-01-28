/**
 * AI Service Factory
 */

import { AIProvider } from './providers/base.js';
import { ClaudeProvider } from './providers/claude.js';
import { OpenAIProvider } from './providers/openai.js';
import { OllamaProvider } from './providers/ollama.js';

export type SupportedProvider = 'claude' | 'openai' | 'ollama';

const SUPPORTED_PROVIDERS: SupportedProvider[] = ['claude', 'openai', 'ollama'];

export interface CreateProviderOptions {
  /** Custom API base URL (for OpenAI-compatible servers) */
  baseUrl?: string;
}

/**
 * Create an AI provider instance based on the provider name
 */
export function createAIProvider(provider: string, options?: CreateProviderOptions): AIProvider {
  if (!SUPPORTED_PROVIDERS.includes(provider as SupportedProvider)) {
    throw new Error(
      `Unsupported AI provider: ${provider}. Supported providers: ${SUPPORTED_PROVIDERS.join(', ')}`
    );
  }

  switch (provider) {
    case 'claude':
      return new ClaudeProvider();
    case 'openai':
      return new OpenAIProvider({ baseUrl: options?.baseUrl });
    case 'ollama':
      return new OllamaProvider();
    default:
      throw new Error(`Unknown AI provider: ${provider}`);
  }
}

/**
 * Check if a provider is supported
 */
export function isProviderSupported(provider: string): provider is SupportedProvider {
  return SUPPORTED_PROVIDERS.includes(provider as SupportedProvider);
}

/**
 * Get list of supported providers
 */
export function getSupportedProviders(): SupportedProvider[] {
  return [...SUPPORTED_PROVIDERS];
}

export { AIProvider } from './providers/base.js';
export * from './types.js';
