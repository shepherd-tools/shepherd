import applywithllm from './applywithllm';
import { IMigrationContext } from '../migration-context';
import mockAdapter from '../adapters/adapter.mock';
import mockLogger from '../logger/logger.mock';
import * as llmService from '../services/llm';
import fs from 'fs-extra';

jest.mock('../services/llm');
jest.mock('fs-extra');

// Mock process.exit globally - don't throw, just return
const mockExit = jest.spyOn(process, 'exit').mockImplementation(() => {
  return undefined as any;
});

describe('applywithllm command', () => {
  let mockContext: IMigrationContext;
  let options: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockExit.mockClear();
    process.env.GROQ_API_KEY = 'test-key';

    mockContext = {
      shepherd: {
        workingDirectory: 'workingDirectory',
      },
      migration: {
        migrationDirectory: 'migrationDirectory',
        spec: {
          id: 'id',
          title: 'title',
          adapter: {
            type: 'adapter',
          },
          hooks: {},
        },
        workingDirectory: 'workingDirectory',
        selectedRepos: [{ name: 'repo1' }],
        repos: [{ name: 'repo1' }],
        upstreamOwner: 'upstreamOwner',
      },
      adapter: mockAdapter,
      logger: mockLogger,
    };

    options = {};

    // Default mock implementations
    mockAdapter.getRepoDir.mockReturnValue('/tmp/repo1');
    mockAdapter.resetChangedFiles.mockResolvedValue(undefined);
    (fs.pathExists as jest.Mock).mockResolvedValue(true);
    (fs.writeFile as jest.Mock).mockResolvedValue(undefined);
    (llmService.readFilesForContext as jest.Mock).mockResolvedValue([
      { path: 'file1.ts', content: 'const x = 1;' },
    ]);

    const mockProvider = {
      callLLM: jest.fn().mockResolvedValue({
        diffs: 'const x = 2;',
      }),
    };
    (llmService.getLLMProvider as jest.Mock).mockReturnValue(mockProvider);
  });

  afterEach(() => {
    mockExit.mockClear();
  });

  afterAll(() => {
    mockExit.mockRestore();
  });

  it('should successfully process repo with valid diffs', async () => {
    const prompt = '@files file1.ts\nRefactor this file';

    await applywithllm(mockContext, options, prompt);

    expect(mockLogger.info).toHaveBeenCalled();
    // LLM provider should have been called
    expect(llmService.getLLMProvider).toHaveBeenCalled();
  });

  it('should handle missing GROQ_API_KEY', async () => {
    delete process.env.GROQ_API_KEY;
    const prompt = '@files file1.ts\nRefactor this file';

    await applywithllm(mockContext, options, prompt);

    // Should call process.exit with code 1
    expect(mockExit).toHaveBeenCalledWith(1);
  });

  it('should handle empty prompt', async () => {
    await applywithllm(mockContext, options, '');

    // Should call process.exit with code 1
    expect(mockExit).toHaveBeenCalledWith(1);
  });

  it('should skip applying diffs when dry-run is enabled', async () => {
    const prompt = '@files file1.ts\nRefactor this file';
    options.dryRun = true;

    await applywithllm(mockContext, options, prompt);

    expect(mockLogger.info).toHaveBeenCalled();
  });

  it('should handle empty LLM response', async () => {
    const prompt = '@files file1.ts\nRefactor this file';
    const mockProvider = {
      callLLM: jest.fn().mockResolvedValue({
        diffs: '',
      }),
    };
    (llmService.getLLMProvider as jest.Mock).mockReturnValue(mockProvider);

    await applywithllm(mockContext, options, prompt);

    // Should not write the file content when response is empty (only the response JSON is written)
    // Check that writeFile was only called once for the response JSON, not for the actual file
    const writeFileCalls = (fs.writeFile as jest.Mock).mock.calls;
    const fileContentWriteCalls = writeFileCalls.filter(
      (call) => call[0] === '/tmp/repo1/file1.ts'
    );
    expect(fileContentWriteCalls.length).toBe(0);
  });

  it('should handle LLM API errors gracefully', async () => {
    const prompt = '@files file1.ts\nRefactor this file';
    (llmService.getLLMProvider as jest.Mock).mockImplementationOnce(() => {
      throw new Error('API error');
    });

    await applywithllm(mockContext, options, prompt);

    // Should reset the repo on error
    expect(mockAdapter.resetChangedFiles).toHaveBeenCalled();
  });
});
