/**
 * File operations for AI migrations
 */

import fs from 'fs-extra';
import path from 'path';
import { glob } from 'glob';
import { IFileContent, IFileEdit, IAIConfig } from './types.js';

const DEFAULT_EXCLUDE_PATTERNS = [
  'node_modules/**',
  '.git/**',
  'dist/**',
  'build/**',
  'coverage/**',
  '*.min.js',
  '*.min.css',
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
];

const DEFAULT_INCLUDE_PATTERNS = ['**/*'];

/**
 * Read files from a repository based on include/exclude patterns
 */
export async function readRepoFiles(
  repoDir: string,
  config: Pick<IAIConfig, 'context'>
): Promise<IFileContent[]> {
  const includePatterns = config.context?.include || DEFAULT_INCLUDE_PATTERNS;
  const excludePatterns = [...DEFAULT_EXCLUDE_PATTERNS, ...(config.context?.exclude || [])];

  const files: IFileContent[] = [];

  for (const pattern of includePatterns) {
    const matches = await glob(pattern, {
      cwd: repoDir,
      ignore: excludePatterns,
      nodir: true,
      absolute: false,
    });

    for (const match of matches) {
      const filePath = path.join(repoDir, match);
      try {
        const stat = await fs.stat(filePath);
        // Skip files larger than 100KB to avoid token limits
        if (stat.size > 100 * 1024) {
          continue;
        }

        const content = await fs.readFile(filePath, 'utf-8');
        // Skip binary files
        if (!isBinaryContent(content)) {
          files.push({ path: match, content });
        }
      } catch {
        // Skip unreadable files
      }
    }
  }

  return files;
}

/**
 * Apply file edits to the repository
 */
export async function applyEdits(repoDir: string, edits: IFileEdit[]): Promise<void> {
  for (const edit of edits) {
    const filePath = path.join(repoDir, edit.path);

    // Security check: ensure the path is within the repo directory
    const resolvedPath = path.resolve(filePath);
    const resolvedRepoDir = path.resolve(repoDir);
    if (!resolvedPath.startsWith(resolvedRepoDir)) {
      throw new Error(`Security error: Path ${edit.path} is outside the repository`);
    }

    switch (edit.action) {
      case 'create':
      case 'modify':
        if (edit.content === undefined) {
          throw new Error(`Missing content for ${edit.action} action on ${edit.path}`);
        }
        await fs.ensureDir(path.dirname(filePath));
        await fs.writeFile(filePath, edit.content);
        break;
      case 'delete':
        if (await fs.pathExists(filePath)) {
          await fs.remove(filePath);
        }
        break;
      default:
        throw new Error(`Unknown edit action: ${(edit as IFileEdit).action}`);
    }
  }
}

/**
 * Check if content appears to be binary
 */
function isBinaryContent(content: string): boolean {
  // Check for null bytes (common in binary files)
  if (content.includes('\0')) {
    return true;
  }

  // Check for high ratio of non-printable characters
  const nonPrintable = content.split('').filter((char) => {
    const code = char.charCodeAt(0);
    return code < 32 && code !== 9 && code !== 10 && code !== 13;
  }).length;

  return nonPrintable / content.length > 0.1;
}
