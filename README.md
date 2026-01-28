# Shepherd

![Project moved](https://img.shields.io/badge/Project%20moved%20to-shepherd--tools%2Fshepherd-blue?style=for-the-badge&logo=github)

> ⚠️ **NerdWalletOSS Repository Archived & Relocated to Shepherd-Tools**
>
> This project has been **relocated** to [**shepherd-tools/shepherd**](https://github.com/shepherd-tools/shepherd) and is **no longer actively maintained by NerdWalletOSS.**
>
> Future development, issue tracking, and releases will continue at the new location.
>
> 👉 Please update your references and [star ⭐ the new repo](https://github.com/shepherd-tools/shepherd) to stay up to date!
>
> **🙏 Special Thanks:**
> We want to extend our heartfelt gratitude to **[Aori Nevo](https://github.com/aorinevo)** for their significant contributions and dedication to maintaining this project in recent years. Their work has been invaluable to the Shepherd community.

[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](./CONTRIBUTING.md)
[![GitHub Workflow Status](https://img.shields.io/github/actions/workflow/status/NerdWalletOSS/shepherd/release.yml?style=flat-square)](https://github.com/NerdWalletOSS/shepherd/actions)
[![semantic-release: conventionalcommits](https://img.shields.io/badge/semantic--release-conventionalcommits-e10079?logo=semantic-release)](https://github.com/semantic-release/semantic-release)
![npm version](https://img.shields.io/npm/v/@nerdwallet/shepherd.svg?style=flat-square)
![GitHub issues](https://img.shields.io/github/issues/NerdWalletOSS/shepherd.svg?style=flat-square)

## About Shepherd

Shepherd is a utility for applying code changes across many repositories.

- **Powerful**: You can write migration scripts using your favorite Unix commands, tools like [`jscodeshift`](https://github.com/facebook/jscodeshift), or scripts in your preferred programming language.
- **Easy**: With just a few commands, you can checkout dozens of repositories, apply changes, commit those changes, and open pull requests with detailed messages.
- **Flexible**: Ships with support for Git/GitHub, but can easily be extended to work with other version control products like Bitbucket, GitLab, or SVN.

For more high level context, this [blog post](https://www.nerdwallet.com/blog/engineering/shepherd-automating-code-changes/) covers the basics.

## Getting started

Install the Shepherd CLI:

```sh
npm install -g @nerdwallet/shepherd
```

If using GitHub Enterprise, ensure the following environment variables are exported:

```
export SHEPHERD_GITHUB_ENTERPRISE_BASE_URL={company_github_enterprise_base_url} # e.g., github.com
export SHEPHERD_GITHUB_ENTERPRISE_URL={company_github_enterprise_url} # e.g., api.github.com/api/v3
```

If using ssh, ensure that your GITHUB_TOKEN is exported:

```
export GITHUB_TOKEN=<PAT>
```

Shepherd will now be available as the `shepherd` command in your shell:

```sh
shepherd --help
```

```text
Usage: shepherd [options] [command]
...
```

Take a look at the [tutorial](docs/tutorial.md) for a detailed walkthrough of what Shepherd does and how it works, or read on for a higher-level and more brief look!

[Go to tutorial →](docs/tutorial.md)

## Motivation for using Shepherd

Moving away from monorepos and monolithic applications has generally been a good thing for developers because it allows them to move quickly and independently from each other. However, it's easy to run into problems, especially if your code relies on shared libraries. Specifically, making a change to shared code and then trying to roll that shared code out to all consumers of that code becomes difficult:

- The person updating that library must communicate the change to consumers of the library
- The consumer must understand the change and how they have to update their own code
- The consumer must make the necessary changes in their own code
- The consumer must test, merge, and deploy those changes

Shepherd aims to help shift responsibility for the first three steps to the person actually making the change to the library. Since they have the best understanding of their change, they can write a code migration to automate that change and then user Shepherd to automate the process of applying that change to all relevant repos. Then the owners of the affected repos (who have the best understanding of their own code) can review and merge the changes. This process is especially efficient for teams who rely on continuous integration: automated tests can help repository owners have confidence that the code changes are working as expected.

## Migration Configuration Schema

### Example

A migration is declaratively specified with a `shepherd.yml` file called a spec. Here's an example of a migration spec that renames `.eslintrc` to `.eslintrc.json` in all NerdWallet repositories that have been modified in 2018:

```yml
id: 2018.07.16-eslintrc-json
title: Rename all .eslintrc files to .eslintrc.json
adapter:
  type: github
  search_type: code
  search_query: org:NerdWallet path:/ filename:.eslintrc
hooks:
  should_migrate:
    - ls .eslintrc # Check that this file actually exists in the repo
    - git log -1 --format=%cd | grep 2018 --silent # Only migrate things that have seen commits in 2018
  should_create_issue:
    - node $SHEPHERD_MIGRATION_DIR/should_create_issue.js
  post_checkout: npm install
  apply: mv .eslintrc .eslintrc.json
  pr_message: echo 'Hey! This PR renames `.eslintrc` to `.eslintrc.json`'
issues:
  title: 'this is my first updated issue'
  description: 'this is my first updated issue'
  labels: ['ENHANCEMENT', 'BUG']
  state: closed
  state_reason: completed
```

### Fields

- `id`:
  - **Description**: Specifies a unique identifier for this migration.
  - **Usage**: Used as a branch name for the migration and internally by Shepherd to track migration state.

- `title`:
  - **Description**: A title for the migration.
  - **Usage**: Used as the commit message.

- `adapter`:
  - **Description**: Specifies the version control adapter for repo operations.
  - **Details**: Currently supports only GitHub, but can be extended for Bitbucket or GitLab. Configuration differs based on the adapter.
    - **GitHub Specific**:
      - `search_query`: Utilizes GitHub's [code search qualifiers](https://help.github.com/articles/searching-code/) to identify candidate repositories.
      - `org`: Specify `YOURGITHUBORGANIZATION` to consider every visible repo in the organization.
      - `search_type` (optional): Either 'code' or 'repositories'. Defaults to code search. For repositories, use [Github repository search](https://docs.github.com/en/free-pro-team@latest/github/searching-for-information-on-github/searching-for-repositories).

### Hooks

Hooks define the core functionality of a migration in Shepherd.

- `should_migrate`:
  - **Description**: Commands to determine if a repo requires migration.
  - **Behavior**: Non-zero exit values indicate the repo should not be migrated.

- `should_create_issue`:
  - **Description**: Commands to determine if issue needs to be posted in the repo.
  - **Behavior**: Non-zero exit values indicate the issue should not be posted to repo.

- `post_checkout`:
  - **Description**: Commands executed after a repo passes `should_migrate` checks.
  - **Usage**: Ideal for one-time setup actions per repo, like installing dependencies.

- `apply`:
  - **Description**: Commands that perform the actual migration.
  - **Note**: This can range from simple to complex sequences, depending on migration needs.

- `pr_message`:
  - **Description**: Commands to generate a pull request message.
  - **Output**: Anything written to `stdout` is used for the message. Multiple commands will have their outputs concatenated.

- `issue`:
  - **Description**: Command to create, update, or close issues.
  - **Output**: Depending on the details provided in migration scripts, the issues will be created, updated or closed.

- `list-issues`:
  - **Description**: Commands to list all issues associated with a migration.
  - **Output**: All the posted issues are listed in the table format.

### Requirements

- Optional: `should_migrate`, `post_checkout`, `should_create_issue`
- Required: `apply`, `pr_message`

### Environment Variables

Shepherd exposes some context to each command via specific environment variables. Some additional enviornment variables are exposed when using the `git` or `github` adapters.

| Environment Variable                  | Default                | Description                                                                                                                                                                                                                                                                                                                                                                             |
| ------------------------------------- | ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SHEPHERD_REPO_DIR`                   | `~/.shepherd`          | the absolute path to the repository being operated on. This will be the working directory when commands are executed.                                                                                                                                                                                                                                                                   |
| `SHEPHERD_DATA_DIR`                   | `~/.shepherd`          | the absolute path to a special directory that can be used to persist state between steps. This would be useful if, for instance, a `jscodeshift` codemod in your `apply` hook generates a list of files that need human attention and you want to use that list in your `pr_message` hook.                                                                                              |
| `SHEPHERD_BASE_BRANCH`                | default branch         | the name of the branch Shepherd will set up a pull-request against. This will often, _but not always_, be main. Only available for `apply` and later steps.                                                                                                                                                                                                                             |
| `SHEPHERD_MIGRATION_DIR`              | path to migration spec | the absolute path to the directory containing your migration's `shepherd.yml` file. This is useful if you want to include a script with your migration spec and need to reference that command in a hook. For instance, if you have a script `pr.sh` that will generate a PR message: my `pr_message` hook might look something like this: ` pr_message: $SHEPHERD_MIGRATION_DIR/pr.sh` |
| `SHEPHERD_GIT_REVISION`               |                        | (`git` and `github` adapters) is the current revision of the repository being operated on.                                                                                                                                                                                                                                                                                              |
| `SHEPHERD_GITHUB_REPO_OWNER`          |                        | (`github` adapter) is the owner of the repository being operated on. For example, if operating on the repository `https://github.com/NerdWalletOSS/shepherd`, this would be `NerdWalletOSS`.                                                                                                                                                                                            |
| `SHEPHERD_GITHUB_REPO_NAME`           |                        | (`github` adapter) is the name of the repository being operated on. For example, if operating on the repository `https://github.com/NerdWalletOSS/shepherd`, this would be `shepherd`.                                                                                                                                                                                                  |
| `SHEPHERD_GITHUB_ENTERPRISE_URL`      | `api.github.com`       | For GitHub Enterprise, export this variable containing the company's GitHub Enterprise url (e.g., `api.github.com/api/v3`).                                                                                                                                                                                                                                                             |
| `SHEPHERD_GITHUB_ENTERPRISE_BASE_URL` | `api.github.com`       | For GitHub Enterprise, export this variable contraining the company's GitHub Enterprise base url.                                                                                                                                                                                                                                                                                       |
| `SHEPHERD_GITHUB_PROTOCOL`            | ssh                    | (github adapter) is the protocol to use when cloning repos. Can be https or ssh. https is useful when ssh is firewalled.                                                                                                                                                                                                                                                                |

**Additional Context**:

When working with GitHub, the API endpoints differ based on whether you are using GitHub's public cloud service, GitHub Enterprise Cloud, or GitHub Enterprise Server (on-premises). Here’s how the endpoints vary:

- GitHub Public (GitHub.com): https://api.github.com/.
- GitHub Enterprise Cloud: https://api.github.com/enterprise/[enterprise-name]
- GitHub Enterprise Server (On-Premises): https://[hostname]/api/v3/

In each case, the API functionality and how you interact with it are largely the same, but the base URL changes based on where your GitHub instance is hosted.

As a result, the value of `SHEPHERD_GITHUB_ENTERPRISE_URL` is a function of the type of GitHub service and used to support git APIs except cloning which is configurable via `SHEPHERD_GITHUB_ENTERPRISE_BASE_URL`. For `SHEPHERD_GITHUB_ENTERPRISE_BASE_URL`, while `github.com` works across GitHub service types, for backwards compatibility, we default to `api.github.com`.

## AI-Powered Migrations

Shepherd supports AI-powered migrations that use natural language prompts instead of shell scripts. This allows you to describe what changes you want to make in plain English, and let an AI model generate and apply the necessary code changes.

### Quick Start

```bash
# 1. Create a shepherd.yml with your adapter config
cat > my-migration/shepherd.yml << EOF
id: node-24-upgrade
title: Upgrade to Node 24
adapter:
  type: github
  org: my-org
provider: claude
EOF

# 2. Checkout repositories
shepherd checkout ./my-migration

# 3. Apply AI migration with a natural language prompt
shepherd ai ./my-migration "upgrade to Node 24 and update package.json engines field"

# 4. Review, commit, push, and create PRs
shepherd commit ./my-migration
shepherd push ./my-migration
shepherd pr ./my-migration
```

### AI Command

```bash
shepherd ai <migration> <prompt> [options]
```

**Options:**

- `--provider <provider>`: AI provider (`claude`, `openai`, or `ollama`). Required if not in shepherd.yml.
- `--model <model>`: AI model to use (optional, provider uses its default).
- `--max-tokens <number>`: Maximum tokens for AI response.
- `--base-url <url>`: Custom API base URL (for local models).
- `--repos <repos>`: Comma-separated list of repos to operate on.

### AI Configuration in shepherd.yml

```yaml
id: my-ai-migration
title: My AI Migration
adapter:
  type: github
  org: my-org

# AI-specific configuration
provider: claude # Required: 'claude', 'openai', or 'ollama'
model: claude-sonnet-4-20250514 # Optional: specific model
baseUrl: http://localhost:8080/v1 # Optional: for local models
context: # Optional: file filtering
  include:
    - '**/*.js'
    - '**/*.ts'
    - 'package.json'
  exclude:
    - 'node_modules/**'
    - 'dist/**'
max_tokens: 4096 # Optional: max tokens for AI response
```

### Environment Variables

| Variable            | Provider | Description                           |
| ------------------- | -------- | ------------------------------------- |
| `ANTHROPIC_API_KEY` | Claude   | API key for Anthropic's Claude        |
| `OPENAI_API_KEY`    | OpenAI   | API key for OpenAI                    |
| `OLLAMA_HOST`       | Ollama   | Ollama server URL (default: localhost)|

### Example Prompts

```bash
# Upgrade dependencies
shepherd ai ./migration "upgrade lodash to v4 and fix any breaking changes"

# Add TypeScript types
shepherd ai ./migration "add TypeScript type annotations to all functions"

# Fix security issues
shepherd ai ./migration "update axios to latest version and fix any deprecated API usage"

# Code modernization
shepherd ai ./migration "replace var with const/let and convert callback functions to async/await"
```

For more details, see the [AI Migrations documentation](docs/ai-migrations.md).

### Usage

Shepherd is run as follows:

```sh
shepherd <command> <migration> [options]
```

`<migration>` is the path to your migration directory containing a `shepherd.yml` file.

There are a number of commands that must be run to execute a migration:

- `checkout`: Determines which repositories are candidates for migration and clones or updates the repositories on your machine. Clones are "shallow", containing no git history. Uses `should_migrate` to decide if a repository should be kept after it's checked out.
- `apply`: Performs the migration using the `apply` hook discussed above.
- `commit`: Makes a commit with any changes that were made during the `apply` step, including adding newly-created files. The migration's `title` will be prepended with `[shepherd]` and used as the commit message.
- `push`: Pushes all commits to their respective repositories.
- `pr-preview`: Prints the commit message that would be used for each repository without actually creating a PR; uses the `pr_message` hook.
- `pr`: Creates a PR for each repo with the message generated from the `pr_message` hook.
- `version`: Prints Shepherd version
- `issue`: Create, update, or close issues across multiple repository.
- `list-issues`: List all issues associated with a migration.

By default, `checkout` will use the adapter to figure out which repositories to check out, and the remaining commands will operate on all checked-out repos. To only checkout a specific repo or to operate on only a subset of the checked-out repos, you can use the `--repos` flag, which specifies a comma-separated list of repos:

```sh
shepherd checkout path/to/migration --repos facebook/react,google/protobuf
```

Run `shepherd --help` to see all available commands and descriptions for each one.

### Developing

Run `npm install` to install dependencies.

Shepherd is written in TypeScript, which requires compilation to JavaScript. When developing Shepherd, it's recommended to run `npm run build:watch` in a separate terminal. This will incrementally compile the source code as you edit it. You can then invoke the Shepherd CLI by referencing the absolute path to the compiled `cli.js` file:

```sh
cd ../my-other-project
../shepherd/lib/cli.js checkout path/to/migration
```

Shepherd currently has minimal test coverage, but we're aiming to improve that with each new PR. Tests are written with Jest and should be named in a `*.test.ts` alongside the file under test. To run the test suite, run `npm run test`.

We use [ESLint](https://eslint.org/) to ensure a consistent coding style and to help prevent certain classes of problems. Run `npm run lint` to run the linter, and `npm run fix-lint` to automatically fix applicable problems.

### Credits

1. Logo designed by Christopher Wharton.
