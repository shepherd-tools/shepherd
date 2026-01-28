import { createAIProvider, isProviderSupported, getSupportedProviders } from './index';
import { ClaudeProvider } from './providers/claude';
import { OpenAIProvider } from './providers/openai';
import { OllamaProvider } from './providers/ollama';

// Mock the providers
jest.mock('./providers/claude');
jest.mock('./providers/openai');
jest.mock('./providers/ollama');

describe('AI Service Factory', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = {
      ...originalEnv,
      ANTHROPIC_API_KEY: 'test-anthropic-key',
      OPENAI_API_KEY: 'test-openai-key',
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('createAIProvider', () => {
    it('should create ClaudeProvider for "claude"', () => {
      createAIProvider('claude');
      expect(ClaudeProvider).toHaveBeenCalled();
    });

    it('should create OpenAIProvider for "openai"', () => {
      createAIProvider('openai');
      expect(OpenAIProvider).toHaveBeenCalled();
    });

    it('should create OllamaProvider for "ollama"', () => {
      createAIProvider('ollama');
      expect(OllamaProvider).toHaveBeenCalled();
    });

    it('should pass baseUrl option to OpenAIProvider', () => {
      createAIProvider('openai', { baseUrl: 'http://localhost:8080/v1' });
      expect(OpenAIProvider).toHaveBeenCalledWith({ baseUrl: 'http://localhost:8080/v1' });
    });

    it('should throw error for unsupported provider', () => {
      expect(() => createAIProvider('unsupported')).toThrow('Unsupported AI provider');
    });

    it('should include supported providers in error message', () => {
      expect(() => createAIProvider('gemini')).toThrow('claude, openai, ollama');
    });
  });

  describe('isProviderSupported', () => {
    it('should return true for claude', () => {
      expect(isProviderSupported('claude')).toBe(true);
    });

    it('should return true for openai', () => {
      expect(isProviderSupported('openai')).toBe(true);
    });

    it('should return true for ollama', () => {
      expect(isProviderSupported('ollama')).toBe(true);
    });

    it('should return false for unsupported provider', () => {
      expect(isProviderSupported('gemini')).toBe(false);
    });

    it('should return false for empty string', () => {
      expect(isProviderSupported('')).toBe(false);
    });
  });

  describe('getSupportedProviders', () => {
    it('should return array of supported providers', () => {
      const providers = getSupportedProviders();
      expect(providers).toContain('claude');
      expect(providers).toContain('openai');
      expect(providers).toContain('ollama');
      expect(providers).toHaveLength(3);
    });

    it('should return a copy of the array', () => {
      const providers1 = getSupportedProviders();
      const providers2 = getSupportedProviders();
      expect(providers1).not.toBe(providers2);
    });
  });
});
