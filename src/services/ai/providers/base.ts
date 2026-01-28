/**
 * Abstract base class for AI providers
 */

import { IAIRequest, IAIResponse } from '../types.js';

export abstract class AIProvider {
  protected apiKey: string;

  constructor(apiKeyEnvVar: string, options?: { optional?: boolean }) {
    const key = process.env[apiKeyEnvVar];
    if (!key && !options?.optional) {
      throw new Error(
        `Missing API key: ${apiKeyEnvVar} environment variable not set. ` +
          `Please set ${apiKeyEnvVar} to use this AI provider.`
      );
    }
    this.apiKey = key || '';
  }

  /**
   * Generate file edits based on the prompt and repository files
   */
  abstract generateEdits(request: IAIRequest): Promise<IAIResponse>;

  /**
   * Build the system prompt for the AI
   */
  protected buildSystemPrompt(): string {
    return `You are a code migration assistant. Given a repository's files and a migration task,
you must output the exact file changes needed as a JSON object.

Output format (JSON only, no markdown):
{
  "edits": [
    {
      "path": "relative/path/to/file.js",
      "action": "modify",
      "content": "full new content of the file"
    }
  ],
  "explanation": "Brief explanation of changes made"
}

Rules:
- Output ONLY valid JSON, no markdown code blocks or other text
- Include the COMPLETE new file content for modifications
- Use relative paths from the repository root
- For "create" action: provide full file content
- For "modify" action: provide complete new file content
- For "delete" action: content is optional
- If no changes are needed, return: {"edits": [], "explanation": "No changes needed"}
- Do not modify files that don't require changes`;
  }

  /**
   * Build the user message with files and prompt
   */
  protected buildUserMessage(request: IAIRequest): string {
    const filesSection = request.files.map((f) => `=== ${f.path} ===\n${f.content}`).join('\n\n');

    return `Migration Task: ${request.prompt}

Repository Files:
${filesSection}

Please analyze the files and provide the necessary edits as JSON.`;
  }

  /**
   * Parse JSON response from AI, handling potential formatting issues
   */
  protected parseJsonResponse(text: string): IAIResponse {
    // Try to extract JSON from markdown code blocks if present
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    const jsonText = jsonMatch ? jsonMatch[1] : text;

    try {
      const parsed = JSON.parse(jsonText.trim());
      return {
        edits: parsed.edits || [],
        explanation: parsed.explanation,
      };
    } catch {
      throw new Error(`Failed to parse AI response as JSON: ${text.substring(0, 200)}...`);
    }
  }
}
