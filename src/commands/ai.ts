/**
 * AI Command - Apply AI-powered migrations using natural language prompts
 */

import chalk from 'chalk';
import IRepoAdapter, { IRepo } from '../adapters/base.js';
import { IMigrationContext } from '../migration-context.js';
import { IAIConfig } from '../services/ai/types.js';
import { isProviderSupported, getSupportedProviders } from '../services/ai/index.js';
import executeAIApply from '../util/execute-ai-apply.js';
import forEachRepo from '../util/for-each-repo.js';

export interface IAICommandOptions {
  provider?: string;
  model?: string;
  repos?: string[];
  maxTokens?: number;
  baseUrl?: string;
}

const logRepoInfo = (
  repo: IRepo,
  count: number,
  total: number,
  adapter: IRepoAdapter,
  repoLogs: string[]
): void => {
  const indexString = chalk.dim(`${count}/${total}`);
  repoLogs.push(chalk.bold(`\n[${adapter.stringifyRepo(repo)}] ${indexString}`));
};

/**
 * Apply AI-powered migration to all checked out repositories
 *
 * @param context - The migration context
 * @param prompt - The natural language prompt for the AI
 * @param options - Command options (provider, model, etc.)
 * @param specConfig - Configuration from shepherd.yml (provider, model, context, max_tokens)
 */
export default async function ai(
  context: IMigrationContext,
  prompt: string,
  options: IAICommandOptions,
  specConfig: {
    provider?: string;
    model?: string;
    context?: { include?: string[]; exclude?: string[] };
    max_tokens?: number;
    baseUrl?: string;
  }
): Promise<void> {
  const { adapter, logger, migration } = context;
  const repos = migration.repos || [];

  // Merge CLI options with spec config (CLI takes precedence)
  const provider = options.provider || specConfig.provider;
  const model = options.model || specConfig.model;
  const maxTokens = options.maxTokens || specConfig.max_tokens;
  const baseUrl = options.baseUrl || specConfig.baseUrl;

  // Validate provider is specified
  if (!provider) {
    const supportedList = getSupportedProviders().join(', ');
    throw new Error(
      `AI provider is required. Specify via --provider flag or 'provider' in shepherd.yml.\n` +
        `Supported providers: ${supportedList}`
    );
  }

  // Validate provider is supported
  if (!isProviderSupported(provider)) {
    const supportedList = getSupportedProviders().join(', ');
    throw new Error(`Unsupported AI provider: ${provider}. Supported providers: ${supportedList}`);
  }

  // Build AI config
  const aiConfig: IAIConfig = {
    provider,
    model,
    prompt,
    context: specConfig.context,
    max_tokens: maxTokens,
    baseUrl,
  };

  logger.info(chalk.bold('AI Migration'));
  logger.info(chalk.dim(`Provider: ${provider}`));
  if (model) {
    logger.info(chalk.dim(`Model: ${model}`));
  }
  if (baseUrl) {
    logger.info(chalk.dim(`Base URL: ${baseUrl}`));
  }
  logger.info(chalk.dim(`Prompt: ${prompt}`));
  logger.info('');

  let count = 1;
  let successCount = 0;
  let failCount = 0;

  await forEachRepo(context, async (repo) => {
    const repoLogs: string[] = [];
    logRepoInfo(repo, count++, repos.length, adapter, repoLogs);

    try {
      const result = await executeAIApply(context, repo, aiConfig, repoLogs);

      if (result.succeeded) {
        successCount++;
      } else {
        failCount++;
      }
    } catch (error: any) {
      repoLogs.push(chalk.red(`Error: ${error.message}`));
      failCount++;
    }

    repoLogs.forEach((log) => logger.info(log));
  });

  // Summary
  logger.info('');
  logger.info(chalk.bold('Summary'));
  logger.info(chalk.green(`  Succeeded: ${successCount}`));
  if (failCount > 0) {
    logger.info(chalk.red(`  Failed: ${failCount}`));
  }
}
