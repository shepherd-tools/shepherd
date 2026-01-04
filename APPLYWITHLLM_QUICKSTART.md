# ApplyWithLLM Command - Quick Start Guide

## Installation & Setup

The `applywithllm` command is now part of Shepherd. It has been fully integrated and tested.

### Prerequisites

1. **Node.js 18+** (for built-in fetch support)
2. **OpenAI API Key** - Get one from [platform.openai.com](https://platform.openai.com/api-keys)
3. **Git** - Must be installed on your system

### Configuration

Set your OpenAI API key as an environment variable:

```bash
# Export the API key (add to .bashrc or .zshrc for persistence)
export GROQ_API_KEY="sk-your-openai-api-key-here"

# Optionally set the model (defaults to gpt-4)
export GROQ_MODEL="gpt-4-turbo"  # or gpt-4, gpt-3.5-turbo, etc.
```

## Command Syntax

```bash
shepherd applywithllm <migration> <prompt> [options]
```

### Parameters

- **`<migration>`** (required) - Path to your migration directory (must contain `shepherd.yml`)
- **`<prompt>`** (required) - The prompt for the LLM, including `@files` directive

### Options

- **`--repos <repos>`** - Comma-separated list of specific repositories to operate on
- **`--dry-run`** - Validate diffs without applying them (useful for testing)
- **`--skip-validation`** - Skip diff validation (not recommended)
- **`--upstreamOwner <owner>`** - For fork-based workflows

## Examples

### 1. Basic Code Refactoring

```bash
shepherd applywithllm my-migration "@files src/utils.ts Convert callback functions to async/await"
```

What happens:
1. Reads `src/utils.ts` from each checked-out repository
2. Sends it to OpenAI with your refactoring instructions
3. Receives unified diffs back
4. Validates diffs using `git apply --check`
5. Applies the changes to your repositories

### 2. Dry Run - Test First

```bash
shepherd applywithllm my-migration "@files src/app.ts Update React imports from v17 to v18" --dry-run
```

Result: Diffs are validated but NOT applied, so you can review the changes first.

### 3. Multiple Files

```bash
shepherd applywithllm my-migration "@files src/utils.ts,src/helpers.ts,src/constants.ts \
  Modernize all utility files to use ES6+ features"
```

### 4. Target Specific Repos

```bash
shepherd applywithllm my-migration "@files src/legacy.ts Add TypeScript types" \
  --repos frontend-app,backend-service
```

### 5. Complex Refactoring with Instructions

```bash
shepherd applywithllm my-migration "@files src/services/api.ts \
  Refactor this API service:
  1. Add proper error handling with try-catch blocks
  2. Add JSDoc comments for all functions
  3. Convert to use async/await
  4. Add input validation
  5. Use TypeScript strict types"
```

## How It Works

### The 7-Step Process

```
INPUT (Natural Language Prompt + Files)
        ↓
1. PARSE: Extract file paths from @files directive
        ↓
2. VALIDATE: Check files exist in repository
        ↓
3. READ: Load file contents
        ↓
4. CALL LLM: Send prompt + context to OpenAI
        ↓
5. VALIDATE DIFFS: Check patches with git apply --check
        ↓
6. APPLY: Use git apply to apply validated diffs
        ↓
OUTPUT (Modified repository with new code changes)
```

### Error Handling

If anything fails:
- ❌ File not found → Skip repository
- ❌ LLM API error → Reset and skip
- ❌ Diff validation fails → Reset and skip
- ❌ Diff application fails → Reset and skip

Repositories are **automatically reset** on failure, ensuring no partial changes.

## Real-World Scenarios

### Scenario 1: Framework Migration

Migrate from React class components to hooks:

```bash
export GROQ_API_KEY="sk-..."
shepherd applywithllm react-hooks-migration "@files src/components/UserProfile.tsx,src/components/Header.tsx \
  Convert these React class components to functional components with hooks. \
  Use useState for state management and useEffect for lifecycle methods."
```

### Scenario 2: TypeScript Migration

Add TypeScript types to JavaScript files:

```bash
shepherd applywithllm ts-migration "@files src/api.js,src/utils.js,src/constants.js \
  Convert these JavaScript files to TypeScript:
  1. Add strict type annotations
  2. Use interfaces for objects
  3. Add JSDoc comments
  4. Use const assertions where appropriate"
```

### Scenario 3: Library Upgrade

Migrate from old to new library API:

```bash
shepherd applywithllm lodash-upgrade "@files src/helpers.ts,src/utils.ts \
  Modernize lodash usage:
  - Replace \_.map with .map()
  - Replace \_.filter with .filter()
  - Replace \_.reduce with .reduce()
  - Use modern JavaScript instead of lodash where possible"
```

### Scenario 4: Code Style Standardization

Apply consistent coding standards:

```bash
shepherd applywithllm code-style "@files src/index.ts \
  Apply code style improvements:
  - Add proper error handling
  - Use consistent naming conventions
  - Add input validation
  - Add comprehensive comments
  - Format code with proper spacing"
```

## Monitoring and Verification

### During Execution

The command provides real-time feedback:

```
[repo-name] 1/5
Calling LLM for code modifications...
Validating diffs from LLM response...
Diff statistics: +5 additions, -2 deletions
Affected files: src/utils.ts
Applying diffs to repository...
Successfully applied diffs to repository

Summary: 5 succeeded, 0 failed
```

### After Execution

Verify changes before committing:

```bash
# View the changes
git diff

# Stage and review carefully
git add .
git status

# Verify tests still pass
npm test

# Commit
git commit -m "LLM-assisted refactoring: modern patterns"

# Use Shepherd to push
shepherd push my-migration
shepherd pr my-migration
```

## Troubleshooting

### "GROQ_API_KEY environment variable is not set"

```bash
# Solution: Export your API key
export GROQ_API_KEY="sk-your-key"
```

### "Diff validation failed"

The LLM may have generated an invalid diff. Try:
1. Use `--dry-run` first to see the error
2. Refine your prompt to be more specific
3. Use a simpler, more targeted prompt
4. Check if the prompt format is correct (with `@files`)

### "File not found: src/example.ts"

Ensure:
- File paths are relative to repository root
- Spell file names correctly
- Files are actually committed (not untracked)

### "LLM API error"

- Check your API key is valid
- Check your OpenAI account has credits
- Check network connectivity
- Verify GROQ_MODEL is valid (gpt-4, gpt-3.5-turbo, etc.)

## Best Practices

### ✅ DO:

1. **Test with dry-run first**
   ```bash
   shepherd applywithllm migration "prompt" --dry-run
   ```

2. **Start with small, targeted changes**
   ```bash
   # Good: One clear transformation
   "@files utils.ts Convert to async/await"
   ```

3. **Be specific in your prompt**
   ```bash
   # Better than vague
   "@files app.ts Add error handling to all functions"
   ```

4. **Test one repo first**
   ```bash
   shepherd applywithllm migration "prompt" --repos single-test-repo
   ```

5. **Verify the changes**
   ```bash
   git diff
   npm test
   ```

### ❌ DON'T:

1. ❌ Use vague prompts like "refactor the code"
2. ❌ Skip validation - always review diffs
3. ❌ Make multiple unrelated changes in one prompt
4. ❌ Apply to all repos without testing on one first
5. ❌ Commit without running tests

## Performance Considerations

- **LLM calls take time**: 10-30 seconds per repository depending on file size and model
- **Large files**: Break into smaller files if needed
- **Multiple repos**: Process linearly, so total time = repos × time-per-repo
- **API costs**: Each repository incurs one LLM API call

Plan accordingly for batch migrations on many repositories.

## Limitations & Future Work

Current limitations:
- Single LLM provider (OpenAI only, for now)
- Sequential processing (one repo at a time)
- No caching between runs

Planned improvements:
- [ ] Support for Anthropic Claude API
- [ ] Support for Google Gemini API
- [ ] Parallel processing for speed
- [ ] Caching for cost optimization
- [ ] Interactive prompt refinement
- [ ] Integration with GitHub Copilot

## Support & Contribution

For issues, feature requests, or contributions:
- Check [docs/applywithllm.md](docs/applywithllm.md) for full documentation
- Review test files for usage examples
- Check [IMPLEMENTATION_SUMMARY.md](IMPLEMENTATION_SUMMARY.md) for technical details

---

**Happy migrating! 🚀**
