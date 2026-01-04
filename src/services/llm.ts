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

    const userPrompt = `Task: ${prompt}

Current file content:
${fileContent}

Respond with ONLY the complete modified file content. Do not include markdown, code fences, or explanations.`;

    const messages = [
      {
        role: 'user',
        content: userPrompt,
      },
    ];

    console.log('Groq API request prompt:', userPrompt);

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
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

    // Handle plain text response - remove markdown code fences if present
    let modifiedContent = content.trim();
    // Remove markdown code fences if present
    modifiedContent = modifiedContent
      .replace(/^```[a-z]*\n?/gm, '')
      .replace(/\n?```$/gm, '')
      .trim();

    return {
      diffs: modifiedContent,
      reasoning: 'Modified file content via Groq API',
    };
  }
}

export function getLLMProvider(apiKey?: string, model?: string): ILLMProvider {
  // Try OpenAI first if key is available
  const openaiApiKey = process.env.OPENAI_API_KEY || apiKey;
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

    const userPrompt = `Task: ${prompt}

Current file content:
${fileContent}

Respond with ONLY the complete modified file content. Do not include markdown, code fences, or explanations.`;

    const messages = [
      {
        role: 'user' as const,
        content: userPrompt,
      },
    ];
    console.log('OpenAI API request prompt:', userPrompt);

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
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
    console.log('OpenAI API full response:', JSON.stringify(data, null, 2));
    let content = data.choices[0]?.message?.content;

    // Save response to file for debugging
    const responseFile = path.join(process.cwd(), 'openai_response.json');
    await fs.writeFile(responseFile, JSON.stringify(data, null, 2), 'utf-8');
    console.log(`OpenAI response saved to ${responseFile}`);

    if (process.env.DEBUG_LLM === 'true') {
      console.log('\n=== OpenAI API RESPONSE ===');
      console.log('Full response:', JSON.stringify(data, null, 2).substring(0, 500));
      console.log('Content:', content?.substring(0, 200));
      console.log('=== END ===\n');
    }

    if (!content) {
      throw new Error('No content received from OpenAI API');
    }

    // Handle plain text response - remove markdown code fences if present
    let modifiedContent = content.trim();
    // Remove markdown code fences if present
    modifiedContent = modifiedContent
      .replace(/^```[a-z]*\n?/gm, '')
      .replace(/\n?```$/gm, '')
      .trim();

    return {
      diffs: modifiedContent,
      reasoning: 'Modified file content via OpenAI API',
    };
  }
}
