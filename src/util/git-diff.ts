import { execSync } from 'child_process';

export interface DiffValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Validates a unified diff using git apply --check
 * @param repoDir - The directory of the repository
 * @param diffContent - The unified diff content
 * @returns Validation result with errors and warnings
 */
export async function validateDiff(repoDir: string, diffContent: string): Promise<DiffValidationResult> {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Basic validation: check if diff looks valid
  if (!diffContent || diffContent.trim().length === 0) {
    errors.push('Diff content is empty');
    return { valid: false, errors, warnings };
  }

  if (!diffContent.includes('---') || !diffContent.includes('+++')) {
    errors.push('Diff does not contain expected diff markers (--- and +++)');
    return { valid: false, errors, warnings };
  }

  // Use git apply --check to validate the diff
  try {
    if (process.env.DEBUG_DIFF === 'true') {
      console.log('\n=== VALIDATING DIFF ===');
      console.log('First 500 chars:', diffContent.substring(0, 500));
      console.log('=== END DEBUG ===\n');
    }
    
    execSync(`cd "${repoDir}" && git apply --check`, {
      input: diffContent,
      stdio: ['pipe', 'pipe', 'pipe'],
      encoding: 'utf-8',
    });
  } catch (error: any) {
    const errorOutput = error.stderr || error.message || String(error);
    errors.push(`Git apply validation failed: ${errorOutput}`);
    return { valid: false, errors, warnings };
  }

  return { valid: true, errors, warnings };
}

/**
 * Applies a unified diff to a repository
 * @param repoDir - The directory of the repository
 * @param diffContent - The unified diff content
 * @returns Applied successfully or throws error
 */
export async function applyDiff(repoDir: string, diffContent: string): Promise<void> {
  if (!diffContent || diffContent.trim().length === 0) {
    throw new Error('Cannot apply empty diff');
  }

  try {
    execSync(`cd "${repoDir}" && git apply`, {
      input: diffContent,
      stdio: ['pipe', 'pipe', 'pipe'],
      encoding: 'utf-8',
    });
  } catch (error: any) {
    const errorOutput = error.stderr || error.message || String(error);
    throw new Error(`Failed to apply diff: ${errorOutput}`);
  }
}

/**
 * Extracts file paths from a unified diff
 * @param diffContent - The unified diff content
 * @returns Array of file paths mentioned in the diff
 */
export function extractFilePaths(diffContent: string): string[] {
  const filePaths = new Set<string>();
  const lines = diffContent.split('\n');

  for (const line of lines) {
    // Match lines like: --- a/path/to/file or +++ b/path/to/file
    const match = line.match(/^[\+\-]{3}\s[ab]\/(.+)$/);
    if (match) {
      filePaths.add(match[1]);
    }
  }

  return Array.from(filePaths);
}

/**
 * Parses diff statistics from a unified diff
 */
export function parseDiffStats(diffContent: string): { additions: number; deletions: number } {
  let additions = 0;
  let deletions = 0;

  const lines = diffContent.split('\n');
  for (const line of lines) {
    if (line.startsWith('+') && !line.startsWith('+++')) {
      additions++;
    } else if (line.startsWith('-') && !line.startsWith('---')) {
      deletions++;
    }
  }

  return { additions, deletions };
}
