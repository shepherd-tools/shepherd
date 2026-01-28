import { ClaudeProvider } from './claude';

// Mock the Anthropic SDK
jest.mock('@anthropic-ai/sdk', () => {
  return jest.fn().mockImplementation(() => ({
    messages: {
      create: jest.fn(),
    },
  }));
});

describe('ClaudeProvider', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv, ANTHROPIC_API_KEY: 'test-api-key' };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('constructor', () => {
    it('should throw error if ANTHROPIC_API_KEY is not set', () => {
      delete process.env.ANTHROPIC_API_KEY;
      expect(() => new ClaudeProvider()).toThrow('Missing API key: ANTHROPIC_API_KEY');
    });

    it('should initialize with API key from environment', () => {
      const provider = new ClaudeProvider();
      expect(provider).toBeDefined();
    });
  });

  describe('generateEdits', () => {
    it('should call Anthropic API with correct parameters', async () => {
      const Anthropic = require('@anthropic-ai/sdk');
      const mockCreate = jest.fn().mockResolvedValue({
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              edits: [{ path: 'test.ts', action: 'modify', content: 'new content' }],
              explanation: 'Updated test file',
            }),
          },
        ],
        usage: { output_tokens: 100 },
      });
      Anthropic.mockImplementation(() => ({
        messages: { create: mockCreate },
      }));

      const provider = new ClaudeProvider();
      const result = await provider.generateEdits({
        prompt: 'Fix the bug',
        files: [{ path: 'test.ts', content: 'old content' }],
        repoDir: '/mock/repo',
      });

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 4096,
        })
      );
      expect(result.edits).toHaveLength(1);
      expect(result.explanation).toBe('Updated test file');
      expect(result.tokensUsed).toBe(100);
    });

    it('should use custom model when specified', async () => {
      const Anthropic = require('@anthropic-ai/sdk');
      const mockCreate = jest.fn().mockResolvedValue({
        content: [{ type: 'text', text: '{"edits":[],"explanation":"No changes"}' }],
        usage: {},
      });
      Anthropic.mockImplementation(() => ({
        messages: { create: mockCreate },
      }));

      const provider = new ClaudeProvider();
      await provider.generateEdits({
        prompt: 'Test',
        files: [],
        repoDir: '/mock/repo',
        model: 'claude-3-opus-20240229',
      });

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'claude-3-opus-20240229',
        })
      );
    });

    it('should throw error if no text response', async () => {
      const Anthropic = require('@anthropic-ai/sdk');
      const mockCreate = jest.fn().mockResolvedValue({
        content: [],
      });
      Anthropic.mockImplementation(() => ({
        messages: { create: mockCreate },
      }));

      const provider = new ClaudeProvider();
      await expect(
        provider.generateEdits({
          prompt: 'Test',
          files: [],
          repoDir: '/mock/repo',
        })
      ).rejects.toThrow('No text response from Claude');
    });
  });
});
