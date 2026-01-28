import { OllamaProvider } from './ollama';

// Mock the OpenAI SDK (Ollama uses OpenAI-compatible API)
jest.mock('openai', () => {
  return jest.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create: jest.fn(),
      },
    },
  }));
});

describe('OllamaProvider', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
    // Ollama doesn't require an API key
    delete process.env.OLLAMA_API_KEY;
    delete process.env.OLLAMA_HOST;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('constructor', () => {
    it('should initialize without API key (Ollama does not require one)', () => {
      const provider = new OllamaProvider();
      expect(provider).toBeDefined();
    });

    it('should use default localhost URL', () => {
      const OpenAI = require('openai');
      new OllamaProvider();

      expect(OpenAI).toHaveBeenCalledWith(
        expect.objectContaining({
          baseURL: 'http://localhost:11434/v1',
        })
      );
    });

    it('should use OLLAMA_HOST env var if set', () => {
      process.env.OLLAMA_HOST = 'http://my-ollama-server:11434';
      const OpenAI = require('openai');
      new OllamaProvider();

      expect(OpenAI).toHaveBeenCalledWith(
        expect.objectContaining({
          baseURL: 'http://my-ollama-server:11434/v1',
        })
      );
    });
  });

  describe('generateEdits', () => {
    it('should call Ollama API with correct parameters', async () => {
      const OpenAI = require('openai');
      const mockCreate = jest.fn().mockResolvedValue({
        choices: [
          {
            message: {
              content: JSON.stringify({
                edits: [{ path: 'test.ts', action: 'modify', content: 'new content' }],
                explanation: 'Updated test file',
              }),
            },
          },
        ],
        usage: { completion_tokens: 50 },
      });
      OpenAI.mockImplementation(() => ({
        chat: { completions: { create: mockCreate } },
      }));

      const provider = new OllamaProvider();
      const result = await provider.generateEdits({
        prompt: 'Fix the bug',
        files: [{ path: 'test.ts', content: 'old content' }],
        repoDir: '/mock/repo',
      });

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'llama3.2',
          response_format: { type: 'json_object' },
        })
      );
      expect(result.edits).toHaveLength(1);
      expect(result.explanation).toBe('Updated test file');
    });

    it('should use custom model when specified', async () => {
      const OpenAI = require('openai');
      const mockCreate = jest.fn().mockResolvedValue({
        choices: [{ message: { content: '{"edits":[],"explanation":"No changes"}' } }],
        usage: {},
      });
      OpenAI.mockImplementation(() => ({
        chat: { completions: { create: mockCreate } },
      }));

      const provider = new OllamaProvider();
      await provider.generateEdits({
        prompt: 'Test',
        files: [],
        repoDir: '/mock/repo',
        model: 'codellama',
      });

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'codellama',
        })
      );
    });

    it('should throw error if no response content', async () => {
      const OpenAI = require('openai');
      const mockCreate = jest.fn().mockResolvedValue({
        choices: [{ message: { content: null } }],
      });
      OpenAI.mockImplementation(() => ({
        chat: { completions: { create: mockCreate } },
      }));

      const provider = new OllamaProvider();
      await expect(
        provider.generateEdits({
          prompt: 'Test',
          files: [],
          repoDir: '/mock/repo',
        })
      ).rejects.toThrow('No response content from Ollama');
    });
  });
});
