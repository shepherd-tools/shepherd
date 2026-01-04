import { getLLMProvider, readFilesForContext, GroqProvider } from './llm';
import fs from 'fs-extra';
import path from 'path';

jest.mock('fs-extra');

describe('LLM Service', () => {
  const mockFsReadFile = fs.readFile as jest.MockedFunction<typeof fs.readFile>;
  const mockFsPathExists = fs.pathExists as jest.MockedFunction<typeof fs.pathExists>;

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.GROQ_API_KEY;
    delete process.env.GROQ_MODEL;
  });

  describe('getLLMProvider', () => {
    it('should throw error when API key is not provided', () => {
      expect(() => getLLMProvider()).toThrow('Groq API key not provided');
    });

    it('should return provider with provided API key', () => {
      const provider = getLLMProvider('test-key');
      expect(provider).toBeDefined();
    });

    it('should use environment variable for API key', () => {
      process.env.GROQ_API_KEY = 'env-key';
      const provider = getLLMProvider();
      expect(provider).toBeDefined();
    });

    it('should use provided model over environment variable', () => {
      process.env.GROQ_MODEL = 'llama2-70b';
      const provider = getLLMProvider('test-key', 'mixtral-8x7b-32768');
      expect(provider).toBeDefined();
    });

    it('should use environment model when not provided', () => {
      process.env.GROQ_API_KEY = 'test-key';
      process.env.GROQ_MODEL = 'llama2-70b';
      const provider = getLLMProvider();
      expect(provider).toBeDefined();
    });
  });

  describe('readFilesForContext', () => {
    it('should read multiple files and return their contents', async () => {
      mockFsReadFile.mockResolvedValueOnce('content1');
      mockFsReadFile.mockResolvedValueOnce('content2');

      const files = await readFilesForContext('/tmp/repo', ['file1.ts', 'file2.ts']);

      expect(files).toHaveLength(2);
      expect(files[0]).toEqual({ path: 'file1.ts', content: 'content1' });
      expect(files[1]).toEqual({ path: 'file2.ts', content: 'content2' });
    });

    it('should throw error when file does not exist', async () => {
      const error = new Error('ENOENT: no such file');
      mockFsReadFile.mockRejectedValueOnce(error);

      await expect(readFilesForContext('/tmp/repo', ['missing.ts'])).rejects.toThrow(
        'Failed to read file missing.ts'
      );
    });

    it('should handle empty file list', async () => {
      const files = await readFilesForContext('/tmp/repo', []);
      expect(files).toEqual([]);
    });

    it('should preserve relative paths', async () => {
      mockFsReadFile.mockResolvedValueOnce('content');

      const files = await readFilesForContext('/tmp/repo', ['src/utils/helper.ts']);

      expect(files[0].path).toBe('src/utils/helper.ts');
    });
  });

  describe('GroqProvider', () => {
    let provider: GroqProvider;

    beforeEach(() => {
      provider = new GroqProvider('test-key', 'mixtral-8x7b-32768');
    });

    it('should have the provided model', () => {
      const testProvider = new GroqProvider('test-key', 'llama2-70b');
      expect((testProvider as any).model).toBe('llama2-70b');
    });

    it('should have default model of mixtral-8x7b-32768', () => {
      const testProvider = new GroqProvider('test-key');
      expect((testProvider as any).model).toBe('mixtral-8x7b-32768');
    });
  });
});
