/**
 * Execute AI-powered migration on a repository
 */

import chalk from 'chalk';
import { IRepo } from '../adapters/base.js';
import { IMigrationContext } from '../migration-context.js';
import { createAIProvider, IAIConfig } from '../services/ai/index.js';
import { readRepoFiles, applyEdits } from '../services/ai/file-operations.js';
import { IStepsResults } from './execute-steps.js';

/**
 * Execute AI migration on a repository
 *
 * @param context - The migration context
 * @param repo - The repository to migrate
 * @param aiConfig - AI configuration (provider, model, prompt, etc.)
 * @param repoLogs - Array to collect logs
 * @returns Results of the AI migration
 */
export default async function executeAIApply(
  context: IMigrationContext,
  repo: IRepo,
  aiConfig: IAIConfig,
  repoLogs: string[]
): Promise<IStepsResults> {
  const { adapter, logger } = context;
  const repoDir = adapter.getRepoDir(repo);

  const results: IStepsResults = {
    succeeded: false,
    stepResults: [],
  };

  try {
    // Step 1: Read repository files
    repoLogs.push(chalk.dim('Reading repository files...'));
    const files = await readRepoFiles(repoDir, aiConfig);
    repoLogs.push(chalk.dim(`Found ${files.length} files to analyze`));

    if (files.length === 0) {
      repoLogs.push(chalk.yellow('No files matched the include patterns'));
      results.succeeded = true;
      results.stepResults.push({
        step: 'ai-read-files',
        succeeded: true,
        stdout: 'No files to analyze',
      });
      return results;
    }

    // Step 2: Create AI provider and generate edits
    repoLogs.push(chalk.dim(`Calling ${aiConfig.provider} API...`));
    const provider = createAIProvider(aiConfig.provider, { baseUrl: aiConfig.baseUrl });

    const response = await provider.generateEdits({
      prompt: aiConfig.prompt,
      files,
      repoDir,
      model: aiConfig.model,
      maxTokens: aiConfig.max_tokens,
      baseUrl: aiConfig.baseUrl,
    });

    repoLogs.push(chalk.dim(`AI generated ${response.edits.length} file edits`));

    if (response.explanation) {
      repoLogs.push(chalk.dim(`Explanation: ${response.explanation}`));
    }

    results.stepResults.push({
      step: 'ai-generate-edits',
      succeeded: true,
      stdout: `Generated ${response.edits.length} edits`,
    });

    // Step 3: Apply edits to filesystem
    if (response.edits.length > 0) {
      repoLogs.push(chalk.dim('Applying file changes...'));
      await applyEdits(repoDir, response.edits);

      // Log each edit
      for (const edit of response.edits) {
        const actionColor =
          edit.action === 'delete'
            ? chalk.red
            : edit.action === 'create'
              ? chalk.green
              : chalk.blue;
        repoLogs.push(`  ${actionColor(edit.action.toUpperCase())} ${edit.path}`);
      }

      results.stepResults.push({
        step: 'ai-apply-edits',
        succeeded: true,
        stdout: `Applied ${response.edits.length} edits`,
      });

      repoLogs.push(chalk.green('AI migration completed successfully'));
    } else {
      repoLogs.push(chalk.yellow('No changes needed'));
      results.stepResults.push({
        step: 'ai-apply-edits',
        succeeded: true,
        stdout: 'No changes needed',
      });
    }

    results.succeeded = true;
  } catch (error: any) {
    repoLogs.push(chalk.red(`AI migration failed: ${error.message}`));

    results.stepResults.push({
      step: 'ai-apply',
      succeeded: false,
      stderr: error.message,
    });

    // Log detailed error for debugging
    if (error.response?.data) {
      repoLogs.push(chalk.dim(`API Response: ${JSON.stringify(error.response.data)}`));
    }

    if (error.stack) {
      logger.debug(error.stack);
    }
  }

  return results;
}
