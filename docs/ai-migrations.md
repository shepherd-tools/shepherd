# AI-Powered Migrations

Shepherd's AI-powered migrations allow you to apply code changes across repositories using natural language prompts. Instead of writing shell scripts, you describe what changes you want in plain English, and an AI model generates and applies the necessary code changes.

## Overview

The AI migration workflow follows the same pattern as traditional Shepherd migrations:

1. **Checkout**: Clone repositories using `shepherd checkout`
2. **AI Apply**: Apply AI-generated changes using `shepherd ai`
3. **Review & Commit**: Review changes and commit using `shepherd commit`
4. **Push & PR**: Push and create PRs using `shepherd push` and `shepherd pr`

The key difference is that instead of the `apply` hook with shell commands, you provide a natural language prompt that describes the desired changes.

## Prerequisites

### API Keys

You need an API key for your chosen AI provider:

**Claude (Anthropic):**

```bash
export ANTHROPIC_API_KEY="your-api-key-here"
```

**OpenAI:**

```bash
export OPENAI_API_KEY="your-api-key-here"
```

**Ollama (Local):**

No API key required. Just ensure Ollama is running:

```bash
ollama serve
```

## Configuration

### Minimal Configuration

The simplest AI migration configuration:

```yaml
# shepherd.yml
id: upgrade-lodash
title: Upgrade lodash to v4
adapter:
  type: github
  org: my-org
provider: claude
```

### Full Configuration

```yaml
# shepherd.yml
id: node-24-migration
title: Migrate to Node 24
adapter:
  type: github
  search_query: org:my-org topic:nodejs

# AI Configuration
provider: claude # Required: 'claude', 'openai', or 'ollama'
model: claude-sonnet-4-20250514 # Optional: specific model to use
baseUrl: http://localhost:8080/v1 # Optional: custom API URL for local models
context: # Optional: file filtering
  include: # Glob patterns for files to include
    - '**/*.js'
    - '**/*.ts'
    - '**/*.jsx'
    - '**/*.tsx'
    - 'package.json'
    - '.nvmrc'
    - 'Dockerfile'
  exclude: # Glob patterns for files to exclude
    - 'node_modules/**'
    - 'dist/**'
    - 'build/**'
    - 'coverage/**'
    - '*.min.js'
max_tokens: 8192 # Optional: max tokens for AI response
```

### Configuration Fields

| Field             | Required | Description                                                                                   |
| ----------------- | -------- | --------------------------------------------------------------------------------------------- |
| `provider`        | Yes\*    | AI provider: `claude`, `openai`, or `ollama`. Can be specified via `--provider` CLI flag.     |
| `model`           | No       | Specific model to use. Defaults to provider's recommended model.                              |
| `baseUrl`         | No       | Custom API base URL for local models or OpenAI-compatible servers.                            |
| `context.include` | No       | Glob patterns for files to analyze. Defaults to `["**/*"]`.                                   |
| `context.exclude` | No       | Glob patterns for files to exclude. Common paths like `node_modules` are excluded by default. |
| `max_tokens`      | No       | Maximum tokens for AI response. Defaults to 4096.                                             |

## CLI Usage

### Basic Usage

```bash
# Apply AI migration with inline prompt
shepherd ai ./my-migration "upgrade all dependencies to latest versions"
```

### CLI Options

```bash
shepherd ai <migration> <prompt> [options]

Options:
  --provider <provider>  AI provider (claude, openai, or ollama)
  --model <model>        AI model to use
  --max-tokens <number>  Maximum tokens for AI response
  --base-url <url>       Custom API base URL for local models
  --repos <repos>        Comma-separated list of repos to operate on
```

### Examples

```bash
# Specify provider via CLI
shepherd ai ./migration "fix security vulnerabilities" --provider openai

# Use specific model
shepherd ai ./migration "add TypeScript types" --provider claude --model claude-3-opus-20240229

# Target specific repos
shepherd ai ./migration "update README" --repos org/repo1,org/repo2
```

## Supported Providers

### Claude (Anthropic)

- **Environment Variable**: `ANTHROPIC_API_KEY`
- **Default Model**: `claude-sonnet-4-20250514`
- **Documentation**: https://docs.anthropic.com/

### OpenAI

- **Environment Variable**: `OPENAI_API_KEY`
- **Default Model**: `gpt-4o`
- **Documentation**: https://platform.openai.com/docs/

### Ollama (Local)

- **Environment Variable**: `OLLAMA_HOST` (optional, defaults to `http://localhost:11434`)
- **Default Model**: `llama3.2`
- **Documentation**: https://ollama.ai/

Ollama is a popular tool for running LLMs locally. No API key is required.

```yaml
# shepherd.yml
provider: ollama
model: codellama  # or llama3.2, mistral, etc.
```

```bash
# Start Ollama server
ollama serve

# Pull a model
ollama pull codellama

# Run migration
shepherd ai ./migration "refactor this code" --provider ollama
```

## Local and Self-Hosted Models

Shepherd supports local LLM servers through two approaches:

### 1. Ollama Provider (Recommended for Ollama)

Use the dedicated `ollama` provider for the simplest setup:

```yaml
provider: ollama
model: llama3.2
```

Set `OLLAMA_HOST` to point to a remote Ollama server:

```bash
export OLLAMA_HOST=http://my-ollama-server:11434
```

### 2. OpenAI-Compatible API (For Other Servers)

Many local LLM servers provide OpenAI-compatible APIs. Use the `openai` provider with a custom `baseUrl`:

```yaml
provider: openai
model: my-local-model
baseUrl: http://localhost:8080/v1
```

This works with:
- **LM Studio**: `http://localhost:1234/v1`
- **vLLM**: `http://localhost:8000/v1`
- **LocalAI**: `http://localhost:8080/v1`
- **Text Generation WebUI**: `http://localhost:5000/v1`

Example with LM Studio:

```yaml
# shepherd.yml
id: local-migration
title: Local LLM Migration
adapter:
  type: github
  org: my-org
provider: openai
model: local-model
baseUrl: http://localhost:1234/v1
```

```bash
# No API key needed for local servers
shepherd ai ./migration "fix all TODOs in the codebase"
```

## File Handling

### Default Exclusions

The following patterns are excluded by default:

- `node_modules/**`
- `.git/**`
- `dist/**`
- `build/**`
- `coverage/**`
- `*.min.js`
- `*.min.css`
- `package-lock.json`
- `yarn.lock`
- `pnpm-lock.yaml`

### File Size Limits

- Files larger than 100KB are skipped to avoid token limits
- Binary files are automatically detected and skipped

## Example Workflows

### Dependency Upgrade

```yaml
# shepherd.yml
id: lodash-v4-upgrade
title: Upgrade lodash to v4
adapter:
  type: github
  search_query: org:my-org filename:package.json lodash
provider: claude
context:
  include:
    - '**/*.js'
    - '**/*.ts'
    - 'package.json'
```

```bash
shepherd checkout ./lodash-upgrade
shepherd ai ./lodash-upgrade "upgrade lodash from v3 to v4 and fix all breaking changes including _.pluck to _.map"
shepherd commit ./lodash-upgrade
shepherd push ./lodash-upgrade
shepherd pr ./lodash-upgrade
```

### Code Modernization

```yaml
# shepherd.yml
id: async-await-migration
title: Convert callbacks to async/await
adapter:
  type: github
  org: my-org
provider: openai
context:
  include:
    - 'src/**/*.js'
  exclude:
    - '**/*.test.js'
```

```bash
shepherd checkout ./async-migration
shepherd ai ./async-migration "convert all callback-based functions to use async/await syntax, handling errors with try/catch"
shepherd commit ./async-migration
```

### Security Fix

```yaml
# shepherd.yml
id: security-patch
title: Security vulnerability patches
adapter:
  type: github
  search_query: org:my-org filename:package.json axios
provider: claude
```

```bash
shepherd checkout ./security-patch
shepherd ai ./security-patch "upgrade axios to the latest version and update any deprecated API calls"
```

## Best Practices

### Writing Effective Prompts

1. **Be Specific**: Instead of "update the code", say "upgrade React from v17 to v18 and update all deprecated lifecycle methods"

2. **Provide Context**: Mention the technologies involved, e.g., "in this TypeScript React application"

3. **Describe Expected Behavior**: "Update the API calls to use the new v2 endpoint format: /api/v2/resource"

4. **Mention Edge Cases**: "Handle both CommonJS require() and ES6 import statements"

### File Filtering

Use `context.include` and `context.exclude` to focus the AI on relevant files:

```yaml
# Focus on TypeScript source files only
context:
  include:
    - 'src/**/*.ts'
    - 'src/**/*.tsx'
  exclude:
    - '**/*.test.ts'
    - '**/*.spec.ts'
```

### Review Changes

Always review AI-generated changes before committing:

```bash
# After running shepherd ai
cd ~/.shepherd/<migration-id>/repos/<org>/<repo>
git diff
```

## Troubleshooting

### API Key Errors

```
Missing API key: ANTHROPIC_API_KEY environment variable not set
```

Ensure you've exported the appropriate API key:

```bash
export ANTHROPIC_API_KEY="your-key"
# or
export OPENAI_API_KEY="your-key"
```

### Provider Not Specified

```
AI provider is required. Specify via --provider flag or 'provider' in shepherd.yml
```

Add `provider: claude` or `provider: openai` to your shepherd.yml, or use `--provider` flag.

### No Files Matched

```
No files matched the include patterns
```

Check your `context.include` patterns. The default is `["**/*"]` which matches all files.

### File Too Large

Large files (>100KB) are automatically skipped. If important files are being skipped, consider breaking them into smaller files or adjusting your include patterns to focus on specific sections.

## Comparison with Traditional Migrations

| Aspect            | Traditional Migration         | AI Migration                  |
| ----------------- | ----------------------------- | ----------------------------- |
| Change Definition | Shell scripts in `apply` hook | Natural language prompt       |
| Deterministic     | Yes                           | No (AI may vary)              |
| Complex Logic     | Requires scripting            | Described in plain English    |
| Review Required   | Recommended                   | Essential                     |
| Best For          | Precise, repeatable changes   | Complex refactoring, upgrades |
