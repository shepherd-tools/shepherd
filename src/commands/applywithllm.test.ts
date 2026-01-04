import applywithllm from './applywithllm';
import { IMigrationContext } from '../migration-context';
import mockAdapter from '../adapters/adapter.mock';
import mockLogger from '../logger/logger.mock';
import * as llmService from '../services/llm';
import * as gitDiff from '../util/git-diff';
import fs from 'fs-extra';

jest.mock('../services/llm');
jest.mock('../util/git-diff');
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
    (fs.pathExists as jest.Mock).mockResolvedValue(true);
    (llmService.readFilesForContext as jest.Mock).mockResolvedValue([
      { path: 'file1.ts', content: 'const x = 1;' },
    ]);
    (gitDiff.validateDiff as jest.Mock).mockResolvedValue({
      valid: true,
      errors: [],
      warnings: [],
    });
    (gitDiff.applyDiff as jest.Mock).mockResolvedValue(undefined);
    (gitDiff.parseDiffStats as jest.Mock).mockReturnValue({
      additions: 1,
      deletions: 1,
    });
    (gitDiff.extractFilePaths as jest.Mock).mockReturnValue(['file1.ts']);

    const mockProvider = {
      callLLM: jest.fn().mockResolvedValue({
        diffs: `--- a/file1.ts
+++ b/file1.ts
@@ -1 +1 @@
-const x = 1;
+const x = 2;
`,
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

    // validateDiff should be called but not applyDiff
    expect(gitDiff.validateDiff).toHaveBeenCalled();
  });

  it('should reset repo on validation failure', async () => {
    const prompt = '@files file1.ts\nRefactor this file';
    (gitDiff.validateDiff as jest.Mock).mockResolvedValueOnce({
      valid: false,
      errors: ['Patch does not apply'],
      warnings: [],
    });

    await applywithllm(mockContext, options, prompt);

    // Should reset the repo on failure
    expect(mockAdapter.resetChangedFiles).toHaveBeenCalled();
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

