#!/usr/bin/env node

import { Command } from 'commander';
import fs from 'fs-extra';
import { homedir } from 'os';
import path from 'path';
import Preferences from 'preferences';

import { adapterForName } from './adapters/index.js';
import { IMigrationContext } from './migration-context.js';
import { loadSpec } from './util/migration-spec.js';
import { loadRepoList } from './util/persisted-data.js';

// Commands
import apply from './commands/apply.js';
import checkout from './commands/checkout.js';
import commit from './commands/commit.js';
import list from './commands/list.js';
import pr from './commands/pr.js';
import prPreview from './commands/pr-preview.js';
import prStatus from './commands/pr-status.js';
import push from './commands/push.js';
import reset from './commands/reset.js';
import version from './commands/version.js';
import issue from './commands/issue.js';
import listIssues from './commands/list-issues.js';

import ConsoleLogger from './logger/index.js';

const program = new Command();

const { SHEPHERD_DOT_DIRECTORY } = process.env;

const shepherdDir = SHEPHERD_DOT_DIRECTORY || path.join(homedir(), '.shepherd');
const prefs = new Preferences(
  'com.nerdwallet.shepherd',
  {
    workingDirectory: shepherdDir,
  },
  {
    encrypt: false,
    file: path.join(shepherdDir, 'prefs.yaml'),
    format: 'yaml',
  }
);
const logger = new ConsoleLogger();

type CommandHandler = (context: IMigrationContext, options: any) => Promise<void>;

interface ICliOptions {
  repos?: string[];
  upstreamOwner: string;
}

const handleCommand =
  (handler: CommandHandler) => async (migration: string, options: ICliOptions) => {
    try {
      const spec = loadSpec(migration);
      const migrationWorkingDirectory = path.join(prefs.workingDirectory, spec.id);
      await fs.ensureDir(migrationWorkingDirectory);

      // We can't use type-checking on this context just yet since we have to dynamically
      // assign some properties
      const migrationContext = {
        migration: {
          migrationDirectory: path.resolve(migration),
          spec,
          workingDirectory: migrationWorkingDirectory,
        },
        shepherd: {
          workingDirectory: prefs.workingDirectory,
        },
        logger,
      } as any;

      const adapter = adapterForName(spec.adapter.type, migrationContext);
      migrationContext.adapter = adapter;

      const selectedRepos = options.repos && options.repos.map(adapter.parseRepo);
      migrationContext.migration.selectedRepos = selectedRepos;

      // The list of repos will be null if migration hasn't started yet
      migrationContext.migration.repos = await loadRepoList(migrationContext);
      migrationContext.migration.upstreamOwner = options.upstreamOwner;

      await handler(migrationContext, options);
    } catch (e: any) {
      logger.error(e);
      process.exit(1);
    }
  };

const buildCommand = (name: string, description: string) => {
  return program.command(`${name} <migration>`).description(description);
};

const addReposOption = (command: Command) => {
  return command.option('--repos <repos>', 'Comma-separated list of repos to operate on', (val) =>
    val.split(',')
  );
};

const addUpstreamOwnerOption = (command: Command) => {
  return command.option(
    '--upstreamOwner <upstreamOwner>',
    'Upstream Owner can be passed incase of trying to raise PR from fork to upstream'
  );
};

const addCommand = (name: string, description: string, repos: boolean, handler: CommandHandler) => {
  const subprogram = buildCommand(name, description);
  if (repos) {
    addReposOption(subprogram);
    addUpstreamOwnerOption(subprogram);
  }
  subprogram.action(handleCommand(handler));
};

addCommand(
  'checkout',
  'Check out any repositories that are candidates for a given migration',
  true,
  checkout
);

const applyCommand = buildCommand('apply', 'Apply a migration to all checked out repositories');
addReposOption(applyCommand);
applyCommand.option('--skip-reset-branch', "Don't reset branch before applying", false);
applyCommand.option('--force-reset-branch', 'Force a reset of the branch before applying', true);
applyCommand.option(
  '--skip-reset-on-error',
  'Keep changes in the working tree even if the migration fails',
  false
);
applyCommand.action(handleCommand(apply));

const commitCommand = buildCommand('commit', 'Commit all changes for the specified migration');
addReposOption(commitCommand)
commitCommand.option('-n, --no-verify', 'Skips pre-commit hooks');
commitCommand.action(handleCommand(commit));

addCommand('reset', 'Reset all changes for the specified migration', true, reset);

const pushCommand = buildCommand('push', 'Push all changes for the specified migration');
addReposOption(pushCommand);
pushCommand.option('-n, --no-verify', 'Skips pre-push hooks');
pushCommand.option('-f, --force', 'Force push, skipping any safety checks');
pushCommand.action(handleCommand(push));

addCommand(
  'pr-preview',
  'View a preview of the PR messages for the specified migration',
  true,
  prPreview
);
addCommand('pr', 'Create PRs for the specified migration', true, pr);
addCommand('pr-status', 'Check the status of all PRs for the specified migration', true, prStatus);

// These commands don't take --repos arguments
addCommand('list', 'List all checked out repositories for the given migration', false, list);

addCommand('issue', 'open an issue for the specified repos', true, issue);

addCommand('list-issues', 'List all opened issues using migration', true, listIssues);

program
  .command('version')
  .description('Print Shepherd version')
  .action(async () => {
    logger.info(await version());
  });

program.on('command:*', () => {
  logger.error(`Error: no such command "${program.args[0]}"`);
  process.exit(1);
});

program.parse(process.argv);
