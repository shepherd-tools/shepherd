# ApplyWithLLM Command

## Overview

The `applywithLLM` command is a powerful Shepherd command that leverages Large Language Models (LLMs) to generate and apply code modifications across multiple repositories. It integrates with LLM providers (currently OpenAI) to:

1. Accept a natural language prompt describing the desired code changes
2. Send the prompt along with file contents to the LLM
3. Receive unified diffs from the LLM
4. Validate the diffs using `git apply --check`
5. Apply the validated diffs to the repository

## Usage

```bash
shepherd applywithllm <migration> <prompt> [options]
```

### Basic Example

```bash
shepherd applywithllm my-migration "@files src/utils.ts,src/helpers.ts Refactor these utilities to use async/await patterns"
```

### With Options

```bash
# Dry run - validate without applying
shepherd applywithllm my-migration "@files src/app.ts Modernize the code" --dry-run

# Target specific repositories
shepherd applywithllm my-migration "@files src/app.ts Fix the bug" --repos repo1,repo2
```

## Environment Variables

The command requires the following environment variables to be set:

### Required
- **`GROQ_API_KEY`**: Your LLM provider's API key (e.g., OpenAI API key)
  ```bash
  export GROQ_API_KEY="sk-..."
  ```

### Optional
- **`GROQ_MODEL`**: The LLM model to use (default: `gpt-4`)
  ```bash
  export GROQ_MODEL="gpt-4-turbo"
  ```

## Command Options

- **`--dry-run`**: Validate diffs without applying them. Useful for testing prompts.
- **`--skip-validation`**: Skip diff validation (not recommended, use with caution)
- **`--repos <repos>`**: Comma-separated list of specific repositories to operate on
- **`--upstreamOwner <owner>`**: Upstream owner for fork-based workflows

## Prompt Format

### Standard Prompt
A simple description of the desired changes:
```
"Refactor all components to use TypeScript strict mode"
```

### Prompt with File Specification
Use the `@files` directive to specify which files should be sent to the LLM:
```
"@files src/utils.ts,src/helpers.ts Convert CommonJS exports to ES6 modules"
```

The prompt can include:
- Detailed instructions for code modifications
- Reference to specific file paths (prefixed with `@files`)
- Context about the migration or desired changes
- Code style guidelines or patterns to follow

## How It Works

### Step 1: File Context Gathering
The command reads the specified files from the checked-out repository and includes their contents in the LLM prompt.

### Step 2: LLM Invocation
The full prompt (original instruction + file contents + formatting guidelines) is sent to the configured LLM. The LLM is instructed to respond with unified diff format.

### Step 3: Diff Validation
Before applying any changes, the diffs are validated using `git apply --check`. This ensures:
- The diff format is correct
- The changes can be applied without conflicts
- No file is missing or corrupted

### Step 4: Diff Application
Once validated, the diffs are applied to the working directory using `git apply`.

### Step 5: Repository Reset on Failure
If any step fails (validation, application, etc.), the repository is automatically reset to prevent partial changes.

## Example Scenarios

### Scenario 1: Modern TypeScript Migration
```bash
export GROQ_API_KEY="sk-..."
shepherd applywithllm migration-typescript "@files src/legacy.ts Migrate this file to TypeScript with strict mode enabled"
```

### Scenario 2: Framework Upgrade
```bash
shepherd applywithllm react-upgrade "@files src/App.tsx,src/components/*.tsx Update React imports from v17 to v18 patterns" --dry-run
```

### Scenario 3: Code Style Refactoring
```bash
shepherd applywithllm lint-fixes "@files src/**/*.ts Convert var and let declarations to const where possible" --repos target-repo
```

## API Response Format

The LLM is expected to respond with unified diff format:

```
--- a/src/file.ts
+++ b/src/file.ts
@@ -10,5 +10,5 @@
 const helper = () => {
-  return new Promise((resolve) => {
+  return new Promise<void>((resolve) => {
     resolve();
   });
```

## Error Handling

The command includes comprehensive error handling:

1. **Missing API Key**: Exits with error if `GROQ_API_KEY` is not set
2. **Empty Prompt**: Requires a non-empty prompt argument
3. **File Not Found**: Logs error if specified files don't exist in repo
4. **Invalid Diff**: Rejects diffs that don't pass `git apply --check`
5. **LLM Errors**: Catches and logs API errors with descriptive messages
6. **Application Failures**: Automatically resets repository on failure

## Best Practices

### 1. Test with Dry Run
Always test your prompt first with `--dry-run`:
```bash
shepherd applywithllm migration my-prompt --dry-run
```

### 2. Start Small
Test with a few files before applying to many repositories:
```bash
shepherd applywithllm migration my-prompt --repos single-test-repo
```

### 3. Be Specific in Prompts
Provide clear, detailed instructions:
- ✅ Good: "Add error handling with try-catch blocks and log errors"
- ❌ Bad: "Fix the code"

### 4. Include Context
Help the LLM understand what to look for:
```
"@files src/handlers.ts Convert all callbacks to async/await, maintain error handling"
```

### 5. Review Generated Diffs
Even though diffs are validated, review the applied changes:
```bash
# After applying, check the diff
git diff
```

## Implementation Details

### Key Files
- [applywithllm.ts](applywithllm.ts) - Main command handler
- [llm.ts](../services/llm.ts) - LLM provider integration
- [git-diff.ts](../util/git-diff.ts) - Git diff validation and application utilities

### Supported LLM Providers
Currently supported:
- OpenAI (GPT-4, GPT-4-Turbo, etc.)

Future support:
- Anthropic Claude
- Google Gemini
- Local LLM instances

### Diff Validation
Uses `git apply --check` to validate diffs without modifying files. This ensures:
- Syntax correctness
- No merge conflicts
- File paths are valid

## Troubleshooting

### "GROQ_API_KEY is not set"
```bash
export GROQ_API_KEY="your-api-key"
```

### "Diff validation failed"
- LLM may have generated invalid diff format
- Try a simpler, more specific prompt
- Use `--dry-run` to inspect the exact diff error

### "File not found in repository"
- Verify file paths in your prompt are relative to repo root
- Check that `@files` directive lists correct paths

### "Failed to read file"
- Ensure all files are committed or visible in working directory
- Check file permissions

## Advanced Usage

### Custom Prompts with Reasoning
```bash
shepherd applywithllm migration "
@files src/complex-logic.ts
Refactor this file to improve readability:
1. Extract long functions into smaller units
2. Add JSDoc comments for complex logic
3. Use descriptive variable names
4. Add error handling where missing
"
```

### Batch Processing
The command automatically processes all checked-out repositories. For selective execution:
```bash
# Process only specific repos
shepherd applywithllm migration my-prompt --repos repo1,repo2,repo3
```

## Performance Considerations

- **LLM Call Time**: Varies based on model and file sizes. Plan for 10-30 seconds per repository.
- **File Size Limits**: For very large files, consider breaking into smaller units or using `--repos` to limit scope.
- **API Costs**: Each repository processed incurs an LLM API call. Budget accordingly.

## Security Notes

- API keys are read from environment variables, not passed as arguments
- Files are read from the local checked-out repositories
- Diffs are validated before application to prevent arbitrary code execution
- Repository state is preserved if errors occur

## Future Enhancements

Planned features:
- [ ] Support for multiple LLM providers (Anthropic, Google, etc.)
- [ ] Cached file reading for performance
- [ ] Parallel LLM calls for faster processing
- [ ] Interactive prompt refinement
- [ ] Custom diff output formats
- [ ] Pre-validation with static analysis
