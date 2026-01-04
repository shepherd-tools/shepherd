import fs from 'fs-extra';
import path from 'path';

export interface FileContent {
  path: string;
  content: string;
}

export interface LLMResponse {
  diffs: string;
  reasoning?: string;
}

export interface ILLMProvider {
  callLLM(prompt: string, files: FileContent[]): Promise<LLMResponse>;
}

export class GroqProvider implements ILLMProvider {
  private apiKey: string;
  private model: string;

  constructor(apiKey: string, model?: string) {
    this.apiKey = apiKey;
    this.model = model || process.env.GROQ_MODEL || 'mixtral-8x7b-32768';
  }

  async callLLM(prompt: string, files: FileContent[]): Promise<LLMResponse> {
    const originalFile = files[0]; // For now, assume single file
    const fileContent = originalFile.content;
    const lines = fileContent.split('\n');
    
    const userPrompt = `Task: ${prompt}

Current file has ${lines.length} lines:
${lines.map((line, i) => `Line ${i + 1}: ${line}`).join('\n')}

Respond in this exact JSON format with ALL current lines plus any new lines:
{
  "lines": ["line1", "line2", "line3", ...]
}

Include every single line from the file in the correct order, with modifications applied.`;

    const messages = [
      {
        role: 'user',
        content: userPrompt,
      }
    ];

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.model,
        messages,
        temperature: 0.0,
        max_completion_tokens: 8192,
        top_p: 1.0,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Groq API error: ${error.error?.message || response.statusText}`);
    }

    const data = await response.json();
    let content = data.choices[0]?.message?.content;
    
    if (process.env.DEBUG_LLM === 'true') {
      console.log('\n=== LLM API RESPONSE ===');
      console.log('Full response:', JSON.stringify(data, null, 2).substring(0, 500));
      console.log('Content:', content?.substring(0, 200));
      console.log('=== END ===\n');
    }
    
    if (!content) {
      throw new Error('No content received from Groq API');
    }

    // Try to parse JSON response
    let modifiedContent: string;
    try {
      // First try direct JSON parsing
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        // Handle both "modified_content" (string) and "lines" (array) formats
        if (parsed.lines && Array.isArray(parsed.lines)) {
          modifiedContent = parsed.lines.join('\n');
        } else if (parsed.modified_content) {
          modifiedContent = parsed.modified_content;
        } else {
          // Fallback: use content as-is
          modifiedContent = content;
        }
      } else {
        // If no JSON found, use the content as-is (fallback)
        modifiedContent = content;
      }
    } catch (e) {
      // If JSON parsing fails, use content as-is
      modifiedContent = content.replace(/^```.*\n?/gm, '').replace(/\n```$/gm, '').trim();
    }

    // Generate a unified diff from original and modified content
    const diff = this.generateUnifiedDiff(originalFile.path, fileContent, modifiedContent);

    return {
      diffs: diff,
      reasoning: 'Modified file content via Groq API and generated unified diff',
    };
  }

  private generateUnifiedDiff(filePath: string, original: string, modified: string): string {
    const origLines = original.split('\n');
    const newLines = modified.split('\n');
    
    // Find the first and last changed lines
    let firstChange = -1;
    let lastChange = -1;
    
    const minLen = Math.min(origLines.length, newLines.length);
    for (let i = 0; i < minLen; i++) {
      if (origLines[i] !== newLines[i]) {
        if (firstChange === -1) firstChange = i;
        lastChange = i;
      }
    }
    
    // If lengths differ, that's a change too
    if (origLines.length !== newLines.length) {
      lastChange = Math.max(lastChange, Math.max(origLines.length, newLines.length) - 1);
    }
    
    // If no changes found
    if (firstChange === -1) {
      return ''; // No diff needed
    }
    
    // Build the unified diff with context
    const lines: string[] = [];
    lines.push(`--- ${filePath}`);
    lines.push(`+++ ${filePath}`);
    
    // Add context before first change (up to 3 lines)
    const contextStart = Math.max(0, firstChange - 3);
    const contextEnd = Math.min(Math.max(origLines.length, newLines.length), lastChange + 3);
    
    // Hunk header
    const origCount = Math.min(origLines.length - contextStart, contextEnd - contextStart);
    const newCount = newLines.length - contextStart;
    lines.push(`@@ -${contextStart + 1},${origCount} +${contextStart + 1},${newCount} @@`);
    
    // Output context and changes
    for (let i = contextStart; i < contextEnd; i++) {
      const origLine = i < origLines.length ? origLines[i] : null;
      const newLine = i < newLines.length ? newLines[i] : null;
      
      if (origLine === newLine) {
        // Context line (unchanged)
        lines.push(` ${origLine}`);
      } else {
        // Changed line
        if (origLine !== null) lines.push(`-${origLine}`);
        if (newLine !== null) lines.push(`+${newLine}`);
      }
    }
    
    return lines.join('\n');
  }
}

export function getLLMProvider(apiKey?: string, model?: string): ILLMProvider {
  // Try OpenAI first if key is available
  const openaiApiKey = apiKey || process.env.OPENAI_API_KEY;
  const groqApiKey = process.env.GROQ_API_KEY;
  
  if (openaiApiKey) {
    return new OpenAIProvider(openaiApiKey, model);
  }
  
  // Fall back to Groq if available
  if (groqApiKey) {
    const selectedModel = model || process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';
    return new GroqProvider(groqApiKey, selectedModel);
  }
  
  throw new Error('No LLM API key found. Set OPENAI_API_KEY or GROQ_API_KEY environment variable.');
}

export async function readFilesForContext(
  repoDir: string,
  filePaths: string[]
): Promise<FileContent[]> {
  const files: FileContent[] = [];

  for (const filePath of filePaths) {
    const fullPath = path.join(repoDir, filePath);
    try {
      const content = await fs.readFile(fullPath, 'utf-8');
      files.push({
        path: filePath,
        content,
      });
    } catch (error: any) {
      throw new Error(`Failed to read file ${filePath}: ${error.message}`);
    }
  }

  return files;
}
export class OpenAIProvider implements ILLMProvider {
  private apiKey: string;
  private model: string;

  constructor(apiKey: string, model?: string) {
    this.apiKey = apiKey;
    this.model = model || process.env.OPENAI_MODEL || 'gpt-3.5-turbo';
  }

  async callLLM(prompt: string, files: FileContent[]): Promise<LLMResponse> {
    const originalFile = files[0]; // For now, assume single file
    const fileContent = originalFile.content;
    const lines = fileContent.split('\n');
    
    const userPrompt = `Task: ${prompt}

Current file has ${lines.length} lines:
${lines.map((line, i) => `Line ${i + 1}: ${line}`).join('\n')}

Respond in this exact JSON format with ALL current lines plus any new lines:
{
  "lines": ["line1", "line2", "line3", ...]
}

Include every single line from the file in the correct order, with modifications applied.`;

    const messages = [
      {
        role: 'user' as const,
        content: userPrompt,
      }
    ];

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.model,
        messages,
        temperature: 0.0,
        max_completion_tokens: 4096,
        top_p: 1.0,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`OpenAI API error: ${error.error?.message || response.statusText}`);
    }

    const data = await response.json();
    let content = data.choices[0]?.message?.content;
    
    if (process.env.DEBUG_LLM === 'true') {
      console.log('\n=== OpenAI API RESPONSE ===');
      console.log('Full response:', JSON.stringify(data, null, 2).substring(0, 500));
      console.log('Content:', content?.substring(0, 200));
      console.log('=== END ===\n');
    }
    
    if (!content) {
      throw new Error('No content received from OpenAI API');
    }

    // Try to parse JSON response
    let modifiedContent: string;
    try {
      // First try direct JSON parsing
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        // Handle both "modified_content" (string) and "lines" (array) formats
        if (parsed.lines && Array.isArray(parsed.lines)) {
          modifiedContent = parsed.lines.join('\n');
        } else if (parsed.modified_content) {
          modifiedContent = parsed.modified_content;
        } else {
          // Fallback: use content as-is
          modifiedContent = content;
        }
      } else {
        // If no JSON found, use the content as-is (fallback)
        modifiedContent = content;
      }
    } catch (e) {
      // If JSON parsing fails, use content as-is
      modifiedContent = content.replace(/^```.*\n?/gm, '').replace(/\n```$/gm, '').trim();
    }

    // Generate a unified diff from original and modified content
    const diff = this.generateUnifiedDiff(originalFile.path, fileContent, modifiedContent);

    return {
      diffs: diff,
      reasoning: 'Modified file content via OpenAI API and generated unified diff',
    };
  }

  private generateUnifiedDiff(filePath: string, original: string, modified: string): string {
    const origLines = original.split('\n');
    const newLines = modified.split('\n');
    
    // Find the first and last changed lines
    let firstChange = -1;
    let lastChange = -1;
    
    const minLen = Math.min(origLines.length, newLines.length);
    for (let i = 0; i < minLen; i++) {
      if (origLines[i] !== newLines[i]) {
        if (firstChange === -1) firstChange = i;
        lastChange = i;
      }
    }
    
    // If lengths differ, that's a change too
    if (origLines.length !== newLines.length) {
      lastChange = Math.max(lastChange, Math.max(origLines.length, newLines.length) - 1);
    }
    
    // If no changes found
    if (firstChange === -1) {
      return ''; // No diff needed
    }
    
    // Build the unified diff with context
    const lines: string[] = [];
    lines.push(`--- a/${filePath}`);
    lines.push(`+++ b/${filePath}`);
    
    // Add context before first change (up to 3 lines)
    const contextStart = Math.max(0, firstChange - 3);
    const contextEnd = Math.min(Math.max(origLines.length, newLines.length), lastChange + 3);
    
    // Hunk header
    const origCount = Math.min(origLines.length - contextStart, contextEnd - contextStart);
    const newCount = newLines.length - contextStart;
    lines.push(`@@ -${contextStart + 1},${origCount} +${contextStart + 1},${newCount} @@`);
    
    // Output context and changes
    for (let i = contextStart; i < contextEnd; i++) {
      const origLine = i < origLines.length ? origLines[i] : null;
      const newLine = i < newLines.length ? newLines[i] : null;
      
      if (origLine === newLine) {
        // Context line (unchanged)
        lines.push(` ${origLine}`);
      } else {
        // Changed line
        if (origLine !== null) lines.push(`-${origLine}`);
        if (newLine !== null) lines.push(`+${newLine}`);
      }
    }
    
    return lines.join('\n');
  }
}
