import ai from './ai';
import executeAIApply from '../util/execute-ai-apply';
import forEachRepo from '../util/for-each-repo';

jest.mock('../util/execute-ai-apply');
jest.mock('../util/for-each-repo');

describe('ai command', () => {
  const mockLogger = {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  };

  const mockAdapter = {
    stringifyRepo: jest.fn((repo) => repo.name),
  };

  const mockContext = {
    adapter: mockAdapter,
    logger: mockLogger,
    migration: {
      repos: [{ name: 'org/repo1' }, { name: 'org/repo2' }],
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (forEachRepo as jest.Mock).mockImplementation(async (ctx, callback) => {
      for (const repo of ctx.migration.repos) {
        await callback(repo);
      }
    });
    (executeAIApply as jest.Mock).mockResolvedValue({ succeeded: true, stepResults: [] });
  });

  describe('provider validation', () => {
    it('should throw error if provider is not specified', async () => {
      await expect(ai(mockContext as any, 'test prompt', {}, {})).rejects.toThrow(
        'AI provider is required'
      );
    });

    it('should throw error for unsupported provider', async () => {
      await expect(
        ai(mockContext as any, 'test prompt', { provider: 'unsupported' }, {})
      ).rejects.toThrow('Unsupported AI provider');
    });

    it('should accept claude as provider', async () => {
      await ai(mockContext as any, 'test prompt', { provider: 'claude' }, {});
      expect(executeAIApply).toHaveBeenCalled();
    });

    it('should accept openai as provider', async () => {
      await ai(mockContext as any, 'test prompt', { provider: 'openai' }, {});
      expect(executeAIApply).toHaveBeenCalled();
    });
  });

  describe('option merging', () => {
    it('should prefer CLI options over spec config', async () => {
      await ai(
        mockContext as any,
        'test prompt',
        { provider: 'openai', model: 'gpt-4-turbo' },
        { provider: 'claude', model: 'claude-sonnet-4-20250514' }
      );

      expect(executeAIApply).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.objectContaining({
          provider: 'openai',
          model: 'gpt-4-turbo',
        }),
        expect.anything()
      );
    });

    it('should use spec config when CLI options not provided', async () => {
      await ai(
        mockContext as any,
        'test prompt',
        {},
        { provider: 'claude', model: 'claude-3-opus' }
      );

      expect(executeAIApply).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.objectContaining({
          provider: 'claude',
          model: 'claude-3-opus',
        }),
        expect.anything()
      );
    });
  });

  describe('execution', () => {
    it('should call executeAIApply for each repo', async () => {
      await ai(mockContext as any, 'test prompt', { provider: 'claude' }, {});

      expect(executeAIApply).toHaveBeenCalledTimes(2);
    });

    it('should pass prompt in AI config', async () => {
      await ai(mockContext as any, 'migrate to node 24', { provider: 'claude' }, {});

      expect(executeAIApply).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.objectContaining({
          prompt: 'migrate to node 24',
        }),
        expect.anything()
      );
    });

    it('should pass context config to AI', async () => {
      const specConfig = {
        provider: 'claude',
        context: { include: ['**/*.ts'], exclude: ['node_modules/**'] },
      };

      await ai(mockContext as any, 'test', {}, specConfig);

      expect(executeAIApply).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.objectContaining({
          context: { include: ['**/*.ts'], exclude: ['node_modules/**'] },
        }),
        expect.anything()
      );
    });

    it('should log summary after completion', async () => {
      await ai(mockContext as any, 'test', { provider: 'claude' }, {});

      expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('Summary'));
      expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('Succeeded: 2'));
    });

    it('should count failures separately', async () => {
      (executeAIApply as jest.Mock)
        .mockResolvedValueOnce({ succeeded: true, stepResults: [] })
        .mockResolvedValueOnce({ succeeded: false, stepResults: [] });

      await ai(mockContext as any, 'test', { provider: 'claude' }, {});

      expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('Succeeded: 1'));
      expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('Failed: 1'));
    });

    it('should handle exceptions in executeAIApply', async () => {
      (executeAIApply as jest.Mock)
        .mockResolvedValueOnce({ succeeded: true, stepResults: [] })
        .mockRejectedValueOnce(new Error('API error'));

      await ai(mockContext as any, 'test', { provider: 'claude' }, {});

      expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('Succeeded: 1'));
      expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('Failed: 1'));
    });
  });
});
