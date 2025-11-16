import fs from 'fs-extra';
import { simpleGit } from 'simple-git';

import { IMigrationContext } from '../migration-context.js';
import IRepoAdapter, { IEnvironmentVariables, IRepo, RetryMethod } from './base.js';

abstract class GitAdapter implements IRepoAdapter {
  protected migrationContext: IMigrationContext;
  protected branchName: string;
  constructor(migrationContext: IMigrationContext) {
    this.migrationContext = migrationContext;
    this.branchName = migrationContext.migration.spec.id;
  }

  public abstract getCandidateRepos(onRetry: RetryMethod): Promise<IRepo[]>;

  public abstract parseRepo(repo: string): IRepo;

  public abstract reposEqual(repo1: IRepo, repo2: IRepo): boolean;

  public abstract stringifyRepo(repo: IRepo): string;

  public abstract getRepoDir(repo: IRepo): string;

  public abstract getDataDir(repo: IRepo): string;

  public abstract mapRepoAfterCheckout(repo: Readonly<IRepo>): Promise<IRepo>;

  public abstract resetRepoBeforeApply(repo: IRepo, force: boolean): Promise<void>;

  public async checkoutRepo(repo: IRepo): Promise<void> {
    const repoPath = this.getRepositoryUrl(repo);
    const localPath = this.getRepoDir(repo);
    const localPathExistsAndIsRepo =
      (await fs.pathExists(localPath)) && (await this.git(repo).checkIsRepo());
    if (localPathExistsAndIsRepo) {
      // Repo already exists; just fetch
      await this.git(repo).fetch('origin');
    } else {
      const git = simpleGit();
      await git.clone(repoPath, localPath, ['--depth', '1']);
    }

    // We'll immediately create and switch to a new branch
    try {
      await this.git(repo).checkout(['-b', this.branchName, `origin/${this.branchName}`]);
    } catch {
      try {
        await this.git(repo).checkoutLocalBranch(this.branchName);
      } catch {
        // This branch probably already exists; we'll just switch to it
        // to make sure we're on the right branch for the commit phase
        await this.git(repo).checkout(this.branchName);
      }
    }
  }

  public async commitRepo(repo: IRepo, noVerify:boolean): Promise<void> {
    const {
      migration: { spec },
    } = this.migrationContext;
    const options = noVerify ? ['--no-verify'] : undefined;
    await this.git(repo).add('.');
    await this.git(repo).commit(`${spec.title} [shepherd]`, options);
  }

  public async resetChangedFiles(repo: IRepo): Promise<void> {
    await this.git(repo).reset(['--hard']);
    await this.git(repo).clean('f', ['-d']);
  }

  public async pushRepo(repo: IRepo, force: boolean, noVerify: boolean): Promise<void> {
    const options = []
    if (force) { options.push('--force') }
    if (noVerify) { options.push('--no-verify') }
    await this.git(repo).push('origin', 'HEAD', options);
  }

  public abstract createPullRequest(
    repo: IRepo,
    message: string,
    upstreamOwner: string
  ): Promise<void>;

  public abstract getPullRequestStatus(repo: IRepo): Promise<string[]>;

  public abstract getBaseBranch(repo: IRepo): string;

  public async getEnvironmentVariables(repo: IRepo): Promise<IEnvironmentVariables> {
    const revision = await this.git(repo).revparse(['HEAD']);

    return {
      SHEPHERD_GIT_REVISION: revision,
    };
  }

  protected abstract getRepositoryUrl(repo: IRepo): string;

  public abstract createIssue(repo: IRepo): Promise<string>;

  public abstract updateIssue(repo: IRepo, issueNumber: number): Promise<void>;

  protected git(repo: IRepo): any {
    return simpleGit(this.getRepoDir(repo));
  }

  protected isShepherdCommitMessage(message: string): boolean {
    return message.indexOf('Shepherd: ') === 0 || message.indexOf('[shepherd]') !== -1;
  }
}
export default GitAdapter;
