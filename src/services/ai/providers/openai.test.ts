import { OpenAIProvider } from './openai';

// Mock the OpenAI SDK
jest.mock('openai', () => {
  return jest.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create: jest.fn(),
      },
    },
  }));
});

describe('OpenAIProvider', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv, OPENAI_API_KEY: 'test-api-key' };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('constructor', () => {
    it('should throw error if OPENAI_API_KEY is not set', () => {
      delete process.env.OPENAI_API_KEY;
      expect(() => new OpenAIProvider()).toThrow('Missing API key: OPENAI_API_KEY');
    });

    it('should initialize with API key from environment', () => {
      const provider = new OpenAIProvider();
      expect(provider).toBeDefined();
    });

    it('should accept custom baseUrl', () => {
      const OpenAI = require('openai');
      new OpenAIProvider({ baseUrl: 'http://localhost:8080/v1' });

      expect(OpenAI).toHaveBeenCalledWith(
        expect.objectContaining({
          baseURL: 'http://localhost:8080/v1',
        })
      );
    });

    it('should not require API key when baseUrl is provided', () => {
      delete process.env.OPENAI_API_KEY;
      const provider = new OpenAIProvider({ baseUrl: 'http://localhost:8080/v1' });
      expect(provider).toBeDefined();
    });
  });

  describe('generateEdits', () => {
    it('should call OpenAI API with correct parameters', async () => {
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

      const provider = new OpenAIProvider();
      const result = await provider.generateEdits({
        prompt: 'Fix the bug',
        files: [{ path: 'test.ts', content: 'old content' }],
        repoDir: '/mock/repo',
      });

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'gpt-4o',
          max_tokens: 4096,
          response_format: { type: 'json_object' },
        })
      );
      expect(result.edits).toHaveLength(1);
      expect(result.explanation).toBe('Updated test file');
      expect(result.tokensUsed).toBe(50);
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

      const provider = new OpenAIProvider();
      await provider.generateEdits({
        prompt: 'Test',
        files: [],
        repoDir: '/mock/repo',
        model: 'gpt-4-turbo',
      });

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'gpt-4-turbo',
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

      const provider = new OpenAIProvider();
      await expect(
        provider.generateEdits({
          prompt: 'Test',
          files: [],
          repoDir: '/mock/repo',
        })
      ).rejects.toThrow('No response content from OpenAI');
    });
  });
});
