import chalk from 'chalk';
import _ from 'lodash';
import path from 'path';

import { IMigrationContext } from '../migration-context.js';
import { IEnvironmentVariables, IRepo } from './base.js';
import GitAdapter from './git.js';
import GithubService from '../services/github.js';

enum SafetyStatus {
  Success,
  PullRequestExisted,
  NonShepherdCommits,
}

class GithubAdapter extends GitAdapter {
  private githubService: GithubService;

  constructor(migrationContext: IMigrationContext, githubService: GithubService) {
    super(migrationContext);
    this.migrationContext = migrationContext;
    this.githubService = githubService;
  }

  public async getCandidateRepos(): Promise<IRepo[]> {
    const {
      org,
      search_type = 'code',
      search_query,
    } = this.migrationContext.migration.spec.adapter;
    let repoNames: string[];

    // list all of an orgs active repos
    if (org) {
      if (search_query) {
        throw new Error('Cannot use both "org" and "search_query" in GitHub adapter. Pick one.');
      }

      repoNames = await this.githubService.getActiveReposForOrg({ org });
    } else {
      repoNames = await this.githubService.getActiveReposForSearchTypeAndQuery({
        search_type,
        search_query,
      });
    }

    return _.uniq(repoNames).map((r) => this.parseRepo(r));
  }

  public async mapRepoAfterCheckout(repo: Readonly<IRepo>): Promise<IRepo> {
    const { owner, name } = repo;
    const defaultBranch = await this.githubService.getDefaultBranchForRepo({
      owner,
      repo: name,
    });

    return {
      ...repo,
      defaultBranch,
    };
  }

  public parseRepo(repo: string): IRepo {
    const [owner, name] = repo.split('/');
    if (!owner || !name) {
      throw new Error(`Could not parse repo "${repo}"`);
    }
    return { owner, name };
  }

  public reposEqual(repo1: IRepo, repo2: IRepo): boolean {
    // GitHub ignores case when differentiating organizations and repos, so we
    // can safely use a case-insensitive compare to make things slightly easier
    // for users who might be using a case-insensitive name on the command line.
    return (
      repo1.owner.toLowerCase() === repo2.owner.toLowerCase() &&
      repo1.name.toLowerCase() === repo2.name.toLowerCase()
    );
  }

  public stringifyRepo({ owner, name }: IRepo): string {
    return `${owner}/${name}`;
  }

  public async resetRepoBeforeApply(repo: IRepo, force: boolean) {
    const { defaultBranch } = repo;
    // First, get any changes from the remote
    // --prune will ensure that any remote branch deletes are reflected here
    await this.git(repo).fetch(['origin', '--prune']);

    if (!force) {
      const safetyStatus = await this.checkActionSafety(repo);
      if (safetyStatus === SafetyStatus.PullRequestExisted) {
        throw new Error(
          'Remote branch did not exist, but a pull request does or did; try with --force-reset-branch?'
        );
      } else if (safetyStatus === SafetyStatus.NonShepherdCommits) {
        throw new Error(
          'Found non-Shepherd commits on remote branch; try with --force-reset-branch?'
        );
      }
    }

    // If we got this far, we can go ahead and reset to the default branch
    await this.git(repo).reset(['--hard', `origin/${defaultBranch}`]);
  }

  public async pushRepo(repo: IRepo, force: boolean, noVerify: boolean): Promise<void> {
    let shouldForce = false;

    // First, get any changes from the remote
    // --prune will ensure that any remote branch deletes are reflected here
    await this.git(repo).fetch(['origin', '--prune']);

    if (!force) {
      const safetyStatus = await this.checkActionSafety(repo);
      if (safetyStatus === SafetyStatus.PullRequestExisted) {
        throw new Error(
          'Remote branch did not exist, but a pull request does or did; try with --force?'
        );
      } else if (safetyStatus === SafetyStatus.NonShepherdCommits) {
        throw new Error('Found non-Shepherd commits on remote branch; try with --force?');
      }

      // If we get to here, it's safe to force-push to this branch
      shouldForce = true;
    }

    await super.pushRepo(repo, force || shouldForce, noVerify);
  }

  public async createPullRequest(
    repo: IRepo,
    message: string,
    upstreamOwner: string
  ): Promise<void> {
    const {
      migration: { spec },
    } = this.migrationContext;
    const { owner, name, defaultBranch } = repo;

    let baseOwner = owner;

    if (upstreamOwner) {
      baseOwner = upstreamOwner;
    }

    // Let's check if a PR already exists
    const pullRequests = await this.githubService.listPullRequests({
      owner,
      repo: name,
      head: `${owner}:${this.branchName}`,
    });

    if (pullRequests && pullRequests.length) {
      const pullRequest = pullRequests[0];

      if (pullRequest.state === 'open') {
        // A pull request exists and is open, let's update it
        await this.githubService.updatePullRequest({
          owner: baseOwner,
          repo: name,
          pull_number: pullRequest.number,
          title: spec.title,
          body: message,
        });
      } else {
        // A pull request exists but it was already closed - don't update it
        // TODO proper status reporting without errors
        throw new Error('Could not update pull request; it was already closed');
      }
    } else {
      // No PR yet - we have to create it

      await this.githubService.createPullRequest({
        owner: baseOwner,
        repo: name,
        head: `${owner}:${this.branchName}`,
        base: defaultBranch,
        title: spec.title,
        body: message,
      });
    }
  }

  public async getPullRequestStatus(repo: IRepo): Promise<string[]> {
    const { owner, name } = repo;
    const status: string[] = [];

    // First, check for a pull request
    const pullRequests = await this.githubService.listPullRequests({
      owner,
      repo: name,
      head: `${owner}:${this.branchName}`,
      state: 'all',
    });

    if (pullRequests && pullRequests.length) {
      // GitHub's API is weird - you need a second query to get information about mergeability
      const { data: pullRequest } = await this.githubService.getPullRequest({
        owner,
        repo: name,
        pull_number: pullRequests[0].number,
      });

      status.push(`PR #${pullRequest.number} [${pullRequest.html_url}]`);
      if (pullRequest.merged_at) {
        status.push(chalk.magenta(`PR was merged at ${pullRequest.merged_at}`));
      } else if (pullRequest.mergeable && pullRequest.mergeable_state === 'clean') {
        status.push(chalk.green('PR is mergeable!'));
      } else {
        status.push(chalk.red('PR is not mergeable'));
        // Let's see what's blocking us
        // Sadly, we can only get information about failing status checks, not being blocked
        // by things like required reviews
        const combinedStatus = await this.githubService.getCombinedRefStatus({
          owner,
          repo: name,
          ref: this.branchName,
        });

        const { statuses } = combinedStatus.data;
        const anyPending = statuses.some((s: any) => s.state === 'pending');
        const anyFailing = statuses.some((s: any) => s.state === 'error' || s.state === 'failure');

        const recordStatus = (s: any) =>
          status.push(`${s.context} ${chalk.dim(`- ${s.description}`)}`);

        if (anyPending) {
          status.push(chalk.underline.yellow('Pending status checks'));
          statuses.forEach((s: any) => {
            if (s.state !== 'pending') {
              return;
            }
            recordStatus(s);
          });
        }

        if (anyFailing) {
          status.push(chalk.underline.red('Failing status checks'));
          statuses.forEach((s: any) => {
            if (!(s.state === 'error' || s.state === 'failure')) {
              return;
            }
            recordStatus(s);
          });
        }
      }
    } else {
      try {
        // This will throw an exception if the branch does not exist
        await this.githubService.getBranch({
          owner,
          repo: name,
          branch: this.branchName,
        });
        status.push('No PR exists');
      } catch (e: any) {
        if (e.code === 404) {
          status.push('No branch or PR exists');
        } else {
          throw e;
        }
      }
    }

    return status;
  }

  public getRepoDir(repo: IRepo): string {
    return path.join(
      this.migrationContext.migration.workingDirectory,
      'repos',
      repo.owner,
      repo.name
    );
  }

  public getDataDir(repo: IRepo): string {
    return path.join(
      this.migrationContext.migration.workingDirectory,
      'data',
      repo.owner,
      repo.name
    );
  }

  public getOwnerName(owner: string): string {
    return owner;
  }

  public getBaseBranch(repo: IRepo): string {
    return process.env.SHEPHERD_BASE_BRANCH ?? repo.defaultBranch;
  }

  public async getEnvironmentVariables(repo: IRepo): Promise<IEnvironmentVariables> {
    const superEnvVars = await super.getEnvironmentVariables(repo);

    return {
      ...superEnvVars,
      SHEPHERD_GITHUB_REPO_OWNER: repo.owner,
      SHEPHERD_GITHUB_REPO_NAME: repo.name,
    };
  }

  protected getRepositoryUrl(repo: IRepo): string {
    const gitHubEnterpriseBaseUrl =
      process.env.SHEPHERD_GITHUB_ENTERPRISE_BASE_URL ?? 'api.github.com';
    const githubProtocol = process.env.SHEPHERD_GITHUB_PROTOCOL ?? 'ssh';

    if (githubProtocol === 'ssh') {
      return `git@${gitHubEnterpriseBaseUrl}:${repo.owner}/${repo.name}.git`;
    } else if (githubProtocol === 'https') {
      return `https://${gitHubEnterpriseBaseUrl}/${repo.owner}/${repo.name}.git`;
    } else {
      throw new Error(`Unknown protocol ${githubProtocol}. Valid values are 'ssh' and 'https'`);
    }
  }

  public createIssue = async (repo: IRepo): Promise<string> => {
    const {
      migration: { spec },
    } = this.migrationContext;
    const { owner, name } = repo;
    const { issues } = spec;
    //Create an issue with the title , issue message and labels

    return await this.githubService.createAndGetIssueNumber({
      owner,
      repo: name,
      title: issues?.title || 0,
      body: issues?.description,
      labels: issues?.labels,
    });
  };

  public updateIssue = async (repo: IRepo, issueNumber: number): Promise<void> => {
    const {
      migration: { spec },
    } = this.migrationContext;
    const { owner, name } = repo;
    const { issues } = spec;

    //Update an issue's title , issue message and labels
    await this.githubService.updateIssue({
      owner,
      repo: name,
      title: issues?.title?.toString(),
      issue_number: issueNumber,
      body: issues?.description,
      labels: issues?.labels,
      state: issues?.state,
      state_reason: issues?.state_reason,
    });
  };

  private async checkActionSafety(repo: IRepo): Promise<SafetyStatus> {
    const { owner, name } = repo;

    // Get all branches and look for the remote branch
    // @ts-ignore (typings are broken)
    const { branches } = await this.git(repo).branch();
    if (branches[`remotes/origin/${this.branchName}`] === undefined) {
      // This remote branch does not exist
      // We need to figure out if that's because a PR was open and
      // subsequently closed, or if it's because we just haven't pushed
      // a branch yet
      const pullRequests = await this.githubService.listPullRequests({
        owner,
        repo: name,
        head: `${owner}:${this.branchName}`,
        state: 'all',
      });

      if (pullRequests && pullRequests.length) {
        // We'll assume that if a remote branch does not exist but a PR
        // does/did, we don't want to apply to this branch
        return SafetyStatus.PullRequestExisted;
      }
    } else {
      // The remote branch exists!
      // We'll get the list of all commits not on main and check if they're
      // all from Shepherd. If they are, it's safe to reset the branch to
      // main.
      const upstreamBranch = `remotes/origin/${this.branchName}`;
      const commits = await this.git(repo).log([`HEAD..${upstreamBranch}`]);
      const allShepherd = commits.all.every(({ message }: any) =>
        this.isShepherdCommitMessage(message)
      );
      if (!allShepherd) {
        // RIP.
        return SafetyStatus.NonShepherdCommits;
      }
    }

    return SafetyStatus.Success;
  }
}

export default GithubAdapter;
