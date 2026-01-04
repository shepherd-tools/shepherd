# ApplyWithLLM Command

## Overview

The `applywithLLM` command is a powerful Shepherd command that leverages Large Language Models (LLMs) to generate and apply code modifications across multiple repositories or to individual files. It integrates with LLM providers (OpenAI and Groq) to:

1. Accept a natural language prompt describing the desired code changes
2. Send the prompt along with file contents to the LLM
3. Receive modified file content from the LLM
4. Write the response directly to the specified file(s)

## Usage

### Mode 1: Single File (Direct Mode)

Process a single file and write the LLM response directly:

```bash
shepherd applywithllm "<prompt>" <filepath>
```

### Mode 2: Multiple Repositories (Repo Mode)

Apply changes across multiple repositories defined in your migration:

```bash
shepherd applywithllm <migration> "@files <files> <prompt>"
```

### Examples

#### Direct File Mode

```bash
shepherd applywithllm "Add groq-sdk==0.5.0 as a new dependency" requirements.txt
```

#### Repo Mode with File Specification

```bash
shepherd applywithllm my-migration "@files src/utils.ts,src/helpers.ts Refactor these utilities to use async/await patterns"
```

#### With Options

```bash
# Target specific repositories
shepherd applywithllm my-migration "@files src/app.ts Fix the bug" --repos repo1,repo2
```

## Environment Variables

The command requires the following environment variables to be set:

### Required (choose one)

- **`OPENAI_API_KEY`**: Your OpenAI API key
  ```bash
  export OPENAI_API_KEY="sk-..."
  ```
- **`GROQ_API_KEY`**: Your Groq API key
  ```bash
  export GROQ_API_KEY="gsk-..."
  ```

### Optional

- **`OPENAI_MODEL`**: The OpenAI model to use (default: `gpt-3.5-turbo`)
  ```bash
  export OPENAI_MODEL="gpt-4-turbo"
  ```
- **`GROQ_MODEL`**: The Groq model to use (default: `llama-3.3-70b-versatile`)
  ```bash
  export GROQ_MODEL="mixtral-8x7b-32768"
  ```

## Command Options

### Repo Mode Options

- **`--dry-run`**: Validate diffs without applying them (repo mode only)
- **`--skip-validation`**: Skip diff validation (not recommended, use with caution)
- **`--repos <repos>`**: Comma-separated list of specific repositories to operate on
- **`--upstreamOwner <owner>`**: Upstream owner for fork-based workflows

### Direct File Mode

- No additional options needed; the file is updated directly

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

## How It Works

### Direct File Mode

**Step 1: File Reading**
The command reads the file from the provided filepath.

**Step 2: LLM Invocation**
The file content and prompt are sent to the configured LLM (OpenAI or Groq). The LLM is instructed to respond with only the complete modified file content.

**Step 3: Content Extraction**
The response is extracted from the LLM API response (`choices[0].message.content`).

**Step 4: File Writing**
The modified content is written directly to the specified filepath, replacing the original content.

### Repo Mode

**Step 1: File Context Gathering**
The command reads the specified files from the checked-out repository and includes their contents in the LLM prompt.

**Step 2: LLM Invocation**
The full prompt (original instruction + file contents + formatting guidelines) is sent to the configured LLM.

**Step 3: Content Extraction**
The modified content is extracted from the LLM response.

**Step 4: File Writing**
The modified content is written directly to the repository files.

**Step 5: Repository Reset on Failure**
If any step fails, the repository is automatically reset to prevent partial changes.

## Example Scenarios

### Scenario 1: Update Dependencies in requirements.txt

```bash
export OPENAI_API_KEY="sk-..."
shepherd applywithllm "Add groq-sdk==0.5.0 as a new line" requirements.txt
```

### Scenario 2: Modern TypeScript Migration (Repo Mode)

```bash
shepherd applywithllm migration-typescript "@files src/legacy.ts Migrate this file to TypeScript with strict mode enabled"
```

### Scenario 3: Framework Upgrade (Repo Mode)

```bash
shepherd applywithllm react-upgrade "@files src/App.tsx,src/components/*.tsx Update React imports from v17 to v18 patterns" --repos target-repo
```

### Scenario 4: Code Style Refactoring (Repo Mode)

```bash
shepherd applywithllm lint-fixes "@files src/**/*.ts Convert var and let declarations to const where possible" --repos target-repo
```

## API Response Format

The LLM responds with plain text content representing the complete modified file:

### Direct File Mode Example

**Request:**

```
Task: Add groq-sdk==0.5.0 as a new line to requirements.txt

Current file content:
psycopg2-binary
openai
langchain
```

**Response:**

```
psycopg2-binary
openai
langchain
langchain-community
pypdf
langchain-openai
ipykernel
langgraph
groq-sdk==0.5.0
```

The response is written directly to the file, replacing its entire content.

## Error Handling

The command includes comprehensive error handling:

### Direct File Mode

1. **Missing Filepath**: Exits with error if filepath is not provided
2. **File Not Found**: Exits with error if the file doesn't exist
3. **Empty Prompt**: Exits with error if prompt is empty
4. **API Key Missing**: Exits with error if neither `OPENAI_API_KEY` nor `GROQ_API_KEY` is set
5. **Empty LLM Response**: Exits with error if the LLM returns no content
6. **File Write Failed**: Logs error if unable to write to the file

### Repo Mode

1. **Missing API Key**: Exits with error if `OPENAI_API_KEY` or `GROQ_API_KEY` is not set
2. **Empty Prompt**: Requires a non-empty prompt argument
3. **File Not Found**: Logs error if specified files don't exist in repo
4. **LLM Errors**: Catches and logs API errors with descriptive messages
5. **Application Failures**: Automatically resets repository on failure

## Best Practices

### 1. For Direct File Mode

Be explicit about the expected output:

```bash
shepherd applywithllm "Return ONLY the complete modified file content with groq-sdk==0.5.0 added. Do not include markdown or explanations." requirements.txt
```

### 2. For Repo Mode - Test with Specific Repos

Test with a few repositories before applying to many:

```bash
shepherd applywithllm migration "@files src/app.ts Fix the bug" --repos single-test-repo
```

### 3. Be Specific in Prompts

Provide clear, detailed instructions:

- ✅ Good: "Add error handling with try-catch blocks and log errors"
- ❌ Bad: "Fix the code"

### 4. Include Context

Help the LLM understand what to look for:

```
"Convert all callbacks to async/await, maintain error handling"
```

### 5. Avoid Markdown in Responses

For direct file mode, instruct the LLM to avoid code fences:

```
"Return ONLY the modified content without markdown, code fences, or explanations"
```

## Implementation Details

### Key Files

- [applywithllm.ts](applywithllm.ts) - Main command handler
- [llm.ts](../services/llm.ts) - LLM provider integration
- [git-diff.ts](../util/git-diff.ts) - Git diff validation and application utilities

## Supported LLM Providers

Currently supported:

- **OpenAI**: GPT-4, GPT-4-Turbo, GPT-3.5-Turbo
  - Set `OPENAI_API_KEY` environment variable
  - Optionally set `OPENAI_MODEL` (default: `gpt-3.5-turbo`)

- **Groq**: Llama-3.3-70b, Mixtral-8x7b, and other fast inference models
  - Set `GROQ_API_KEY` environment variable
  - Optionally set `GROQ_MODEL` (default: `llama-3.3-70b-versatile`)

The provider is selected based on which API key is available (OpenAI takes precedence if both are set).

## Troubleshooting

### "OPENAI_API_KEY or GROQ_API_KEY is not set"

Set at least one API key:

```bash
export OPENAI_API_KEY="sk-..."
# or
export GROQ_API_KEY="gsk-..."
```

### "File not found"

In direct file mode, verify the filepath is correct:

```bash
shepherd applywithllm "Your prompt" /correct/path/to/file.txt
```

In repo mode, ensure file paths are relative to repo root:

```bash
shepherd applywithllm migration "@files src/app.ts Your prompt"
```

### "Empty LLM response"

The LLM returned no content. Try:

- Simplifying your prompt
- Being more explicit about the expected output
- Using a different model via environment variables

### "Failed to write file"

- Check file permissions
- Ensure the directory exists
- Verify disk space availability

## Advanced Usage

### Custom Prompts for Direct File Mode

```bash
shepherd applywithllm "
Update dependencies in requirements.txt:
1. Add groq-sdk==0.5.0
2. Ensure all packages have version pinning
3. Remove any duplicate entries
Return ONLY the complete updated file content.
" requirements.txt
```

### Custom Prompts for Repo Mode

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

### Batch Processing (Repo Mode)

The command automatically processes all checked-out repositories. For selective execution:

```bash
shepherd applywithllm migration "@files src/app.ts Your prompt" --repos repo1,repo2,repo3
```

## Performance Considerations

### Direct File Mode

- **LLM Call Time**: Typically 2-10 seconds depending on file size and model
- **File Size**: Works efficiently with files up to several MB
- **API Costs**: Single LLM call per execution

### Repo Mode

- **LLM Call Time**: 10-30 seconds per repository depending on file count and sizes
- **File Size Limits**: For very large files, consider breaking into smaller units or using `--repos` to limit scope
- **API Costs**: One LLM call per repository processed

## Security Notes

- API keys are read from environment variables, not passed as arguments
- In direct mode, files are read from the provided filepath (no repository context)
- In repo mode, files are read from the local checked-out repositories
- File content is sent to external LLM APIs; avoid sensitive or confidential data
- Repository state is preserved if errors occur in repo mode

## Future Enhancements

Planned features:

- [ ] Support for additional LLM providers (Anthropic Claude, Google Gemini, etc.)
- [ ] Streaming responses for large files
- [ ] Parallel LLM calls for faster processing
- [ ] Interactive prompt refinement
- [ ] Caching for repeated prompts
- [ ] Batch mode with configuration files
- [ ] Output validation with custom rules
