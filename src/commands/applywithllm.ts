import chalk from 'chalk';
import fs from 'fs-extra';
import path from 'path';
import { IRepo } from '../adapters/base.js';
import { IMigrationContext } from '../migration-context.js';
import { getLLMProvider, readFilesForContext } from '../services/llm.js';
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

    console.log('Files sent to LLM:', fileContents);
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
    repoLogs.push('Calling OPENAI LLM for code modifications...');
    const llmProvider = getLLMProvider();
    let llmResponse = await llmProvider.callLLM(actualPrompt, normalizedFiles);

    // Save LLM response to shepherd directory
    const shepherdResponsePath = path.join(process.cwd(), 'llm_response.json');
    await fs.writeFile(shepherdResponsePath, JSON.stringify(llmResponse, null, 2), 'utf-8');
    repoLogs.push(`LLM response saved to ${shepherdResponsePath}`);

    if (process.env.DEBUG_LLM === 'true') {
      console.log('\n=== LLM RESPONSE ===');
      console.log('Length:', llmResponse?.diffs?.length ?? 0);
      console.log(llmResponse?.diffs?.substring(0, 200));
      console.log('=== END LLM RESPONSE ===\n');
    }

    // Retry once if empty
    if (!llmResponse?.diffs || llmResponse.diffs.trim().length === 0) {
      repoLogs.push(chalk.yellow('Empty LLM response, retrying'));
      llmResponse = await llmProvider.callLLM(actualPrompt, normalizedFiles);
    }

    if (!llmResponse?.diffs || llmResponse.diffs.trim().length === 0) {
      repoLogs.push(chalk.yellow('LLM did not generate any response'));
      return false;
    }

    // Replace files with the LLM response content
    try {
      repoLogs.push('Writing LLM response content to files...');

      for (const file of normalizedFiles) {
        const filePath = path.join(repoDir, file.path);
        await fs.writeFile(filePath, llmResponse.diffs, 'utf-8');
        repoLogs.push(chalk.green(`✓ Updated ${file.path}`));
      }

      repoLogs.push(chalk.green('Successfully updated files with LLM response'));
      return true;
    } catch (e: any) {
      repoLogs.push(chalk.red(`Failed to write files: ${e.message}`));
      await resetRepoOnFailure(context, repo, repoLogs);
      return false;
    }
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
  promptArg?: string,
  filepathArg?: string
): Promise<void> => {
  const { adapter, logger, migration } = context;

  const prompt = promptArg || options.prompt;
  const filepath = filepathArg || options.filepath;

  // If filepath is provided, use simple mode: read file, send to LLM, write response
  if (filepath) {
    try {
      if (!prompt || prompt.trim().length === 0) {
        logger.error('Prompt is required');
        process.exit(1);
      }

      if (!process.env.GROQ_API_KEY && !process.env.OPENAI_API_KEY) {
        logger.error('Either GROQ_API_KEY or OPENAI_API_KEY must be set');
        process.exit(1);
      }

      logger.info(`Processing file: ${filepath}`);

      // Read the file
      const fullPath = path.resolve(filepath);
      const fileContent = await fs.readFile(fullPath, 'utf-8');

      // Call LLM
      const llmProvider = getLLMProvider();
      const normalizedFiles = [
        {
          path: path.basename(filepath),
          content: fileContent,
        },
      ];

      logger.info('Calling LLM for code modifications...');
      const llmResponse = await llmProvider.callLLM(prompt, normalizedFiles);

      // Extract content from LLM response
      let responseContent = llmResponse.diffs;

      if (!responseContent || responseContent.trim().length === 0) {
        logger.error('Empty LLM response');
        process.exit(1);
      }

      // Write the response directly to the file
      await fs.writeFile(fullPath, responseContent, 'utf-8');
      logger.info(chalk.green(`✓ Successfully updated ${filepath}`));

      return;
    } catch (e: any) {
      const msg = e.message || String(e);
      logger.error(`Error processing file: ${msg}`);
      process.exit(1);
    }
  }

  // Original repo-based mode
  const repos = migration.repos || [];

  logger.info('Applying migration with LLM to repos:', repos);

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
