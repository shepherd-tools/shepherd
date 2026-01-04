import chalk from 'chalk';
import fs from 'fs-extra';
import path from 'path';
import { IRepo } from '../adapters/base.js';
import { IMigrationContext } from '../migration-context.js';
import { getLLMProvider, readFilesForContext } from '../services/llm.js';
import {
  validateDiff,
  applyDiff,
  extractFilePaths,
  parseDiffStats,
} from '../util/git-diff.js';
import forEachRepo from '../util/for-each-repo.js';

interface ApplyWithLLMOptions {
  prompt: string;
  repos?: string[];
  skipValidation?: boolean;
  dryRun?: boolean;
}

const logRepoInfo = (
  repo: IRepo,
  count: number,
  total: number,
  adapter: any,
  repoLogs: string[]
): void => {
  const indexString = chalk.dim(`${count}/${total}`);
  repoLogs.push(chalk.bold(`\n[${adapter.stringifyRepo(repo)}] ${indexString}`));
};

async function resetRepoOnFailure(
  context: IMigrationContext,
  repo: any,
  repoLogs: string[]
): Promise<void> {
  const { adapter } = context;
  try {
    await adapter.resetChangedFiles(repo);
    repoLogs.push(chalk.yellow('Reset repo after LLM application failed'));
  } catch (e: any) {
    repoLogs.push(chalk.red(`Failed to reset repo: ${e.message}`));
  }
}

async function processRepoWithLLM(
  context: IMigrationContext,
  repo: any,
  options: ApplyWithLLMOptions,
  repoLogs: string[]
): Promise<boolean> {
  const { adapter, logger } = context;
  const repoDir = adapter.getRepoDir(repo);

  try {
    // Parse @files directive
    const promptLines = options.prompt.split('\n');
    let filesToModify: string[] = [];
    let actualPrompt = options.prompt;

    if (promptLines[0]?.startsWith('@files')) {
      const match = promptLines[0].match(/^@files\s+(.+)$/);
      if (match) {
        filesToModify = match[1].split(',').map((f) => f.trim());
        actualPrompt = promptLines.slice(1).join('\n').trim();
      }
    }

    if (filesToModify.length === 0) {
      repoLogs.push(chalk.yellow('No files specified for LLM modification'));
      return false;
    }

    // Verify files exist
    for (const file of filesToModify) {
      const fullPath = path.join(repoDir, file);
      if (!(await fs.pathExists(fullPath))) {
        repoLogs.push(chalk.red(`File not found: ${file}`));
        return false;
      }
    }

    // Read file contents
    repoLogs.push('Reading files for LLM context...');
    const fileContents = await readFilesForContext(repoDir, filesToModify);
    repoLogs.push(`Loaded ${fileContents.length} files for LLM processing`);

    // Normalize content → raw text (CRITICAL)
    const normalizedFiles = fileContents.map((f: any) => {
      if (Array.isArray(f.content?.lines)) {
        return {
          ...f,
          content: f.content.lines.join('\n'),
        };
      }
      return f;
    });

    // Call LLM
    repoLogs.push('Calling LLM for code modifications...');
    const llmProvider = getLLMProvider();
    let llmResponse = await llmProvider.callLLM(actualPrompt, normalizedFiles);

    if (process.env.DEBUG_LLM === 'true') {
      console.log('\n=== LLM RESPONSE ===');
      console.log('Length:', llmResponse?.diffs?.length ?? 0);
      console.log(llmResponse?.diffs?.substring(0, 200));
      console.log('=== END LLM RESPONSE ===\n');
    }

    // Retry once if empty
    if (!llmResponse?.diffs || llmResponse.diffs.trim().length === 0) {
      repoLogs.push(chalk.yellow('Empty LLM response, retrying with strict diff enforcement'));
      llmResponse = await llmProvider.callLLM(
        `${actualPrompt}\n\nRespond ONLY with a valid unified git diff.`,
        normalizedFiles
      );
    }

    if (!llmResponse?.diffs || llmResponse.diffs.trim().length === 0) {
      repoLogs.push(chalk.yellow('LLM did not generate any diffs'));
      return false;
    }

    // Require strict unified diff
    const diffText = llmResponse.diffs.trim();
    const isUnifiedDiff = diffText.startsWith('diff --git');

    if (!isUnifiedDiff) {
      repoLogs.push(chalk.red('LLM response is not a valid unified git diff'));
      await resetRepoOnFailure(context, repo, repoLogs);
      return false;
    }

    // Validate diff
    repoLogs.push('Validating diffs from LLM response...');
    const validationResult = await validateDiff(repoDir, diffText);

    if (!validationResult.valid) {
      repoLogs.push(chalk.red('Diff validation failed:'));
      validationResult.errors.forEach((e) => repoLogs.push(chalk.red(`  - ${e}`)));
      await resetRepoOnFailure(context, repo, repoLogs);
      return false;
    }

    if (validationResult.warnings.length > 0) {
      repoLogs.push(chalk.yellow('Diff validation warnings:'));
      validationResult.warnings.forEach((w) => repoLogs.push(chalk.yellow(`  - ${w}`)));
    }

    const stats = parseDiffStats(diffText);
    repoLogs.push(
      chalk.blue(`Diff statistics: +${stats.additions}, -${stats.deletions}`)
    );

    const affectedFiles = extractFilePaths(diffText);
    repoLogs.push(`Affected files: ${affectedFiles.join(', ')}`);

    if (options.dryRun) {
      repoLogs.push(chalk.cyan('[DRY RUN] Diff validated but not applied'));
      return true;
    }

    repoLogs.push('Applying diffs to repository...');
    await applyDiff(repoDir, diffText);
    repoLogs.push(chalk.green('Successfully applied diffs'));

    return true;
  } catch (e: any) {
    const msg = e.message || String(e);
    logger.error(`Error processing repo with LLM: ${msg}`);
    repoLogs.push(chalk.red(`Error: ${msg}`));
    await resetRepoOnFailure(context, repo, repoLogs);
    return false;
  }
}

export default async (
  context: IMigrationContext,
  options: any,
  promptArg?: string
): Promise<void> => {
  const { adapter, logger, migration } = context;
  const repos = migration.repos || [];

  console.log('Applying migration with LLM to repos:', repos);

  const prompt = promptArg || options.prompt;
  if (!prompt || prompt.trim().length === 0) {
    logger.error('Prompt is required');
    process.exit(1);
  }

  if (!process.env.GROQ_API_KEY && !process.env.OPENAI_API_KEY) {
    logger.error('Either GROQ_API_KEY or OPENAI_API_KEY must be set');
    process.exit(1);
  }

  const llmOptions: ApplyWithLLMOptions = {
    prompt,
    repos: options.repos,
    skipValidation: options.skipValidation || false,
    dryRun: options.dryRun || false,
  };

  if (llmOptions.dryRun) {
    logger.info(chalk.cyan('Running in DRY RUN mode'));
  }

  let count = 1;
  const results = { succeeded: 0, failed: 0 };

  await forEachRepo(context, async (repo) => {
    const repoLogs: string[] = [];
    logRepoInfo(repo, count++, repos.length, adapter, repoLogs);

    const success = await processRepoWithLLM(context, repo, llmOptions, repoLogs);
    success ? results.succeeded++ : results.failed++;

    repoLogs.forEach((log) => logger.info(log));
  });

  logger.info(
    chalk.bold(
      `\nSummary: ${chalk.green(results.succeeded + ' succeeded')}, ${chalk.red(
        results.failed + ' failed'
      )}`
    )
  );

  if (results.failed > 0) {
    process.exit(1);
  }
};
