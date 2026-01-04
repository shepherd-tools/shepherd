import { validateDiff, applyDiff, extractFilePaths, parseDiffStats } from './git-diff';
import { execSync } from 'child_process';

jest.mock('child_process');

describe('git-diff utilities', () => {
  const mockExecSync = execSync as jest.MockedFunction<typeof execSync>;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('validateDiff', () => {
    it('should validate a valid diff', async () => {
      mockExecSync.mockReturnValueOnce('');

      const validDiff = `--- a/test.ts
+++ b/test.ts
@@ -1,3 +1,3 @@
 const x = 1;
-const y = 2;
+const y = 3;
`;

      const result = await validateDiff('/tmp/repo', validDiff);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject empty diff', async () => {
      const result = await validateDiff('/tmp/repo', '');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Diff content is empty');
    });

    it('should reject diff without proper markers', async () => {
      const result = await validateDiff('/tmp/repo', 'some random content');
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('expected diff markers'))).toBe(true);
    });

    it('should catch git apply errors', async () => {
      const error = new Error('Git apply failed');
      (error as any).stderr = 'Does not apply';
      mockExecSync.mockImplementationOnce(() => {
        throw error;
      });

      const validDiff = `--- a/test.ts
+++ b/test.ts
@@ -1,3 +1,3 @@
 const x = 1;
-const y = 2;
+const y = 3;
`;

      const result = await validateDiff('/tmp/repo', validDiff);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('Git apply validation failed'))).toBe(true);
    });
  });

  describe('applyDiff', () => {
    it('should apply a valid diff', async () => {
      mockExecSync.mockReturnValueOnce('');

      const validDiff = `--- a/test.ts
+++ b/test.ts
@@ -1,3 +1,3 @@
 const x = 1;
-const y = 2;
+const y = 3;
`;

      await expect(applyDiff('/tmp/repo', validDiff)).resolves.not.toThrow();
    });

    it('should reject empty diff', async () => {
      await expect(applyDiff('/tmp/repo', '')).rejects.toThrow('Cannot apply empty diff');
    });

    it('should catch git apply errors', async () => {
      const error = new Error('Git apply failed');
      (error as any).stderr = 'Failed to apply patch';
      mockExecSync.mockImplementationOnce(() => {
        throw error;
      });

      const validDiff = `--- a/test.ts
+++ b/test.ts
@@ -1,3 +1,3 @@
 const x = 1;
-const y = 2;
+const y = 3;
`;

      await expect(applyDiff('/tmp/repo', validDiff)).rejects.toThrow('Failed to apply diff');
    });
  });

  describe('extractFilePaths', () => {
    it('should extract file paths from a diff', () => {
      const diff = `--- a/src/test.ts
+++ b/src/test.ts
@@ -1,3 +1,3 @@
 const x = 1;
-const y = 2;
+const y = 3;
--- a/src/other.ts
+++ b/src/other.ts
@@ -1,1 +1,1 @@
-old line
+new line
`;

      const paths = extractFilePaths(diff);
      expect(paths).toContain('src/test.ts');
      expect(paths).toContain('src/other.ts');
      expect(paths).toHaveLength(2);
    });

    it('should handle empty diff', () => {
      const paths = extractFilePaths('');
      expect(paths).toEqual([]);
    });

    it('should deduplicate file paths', () => {
      const diff = `--- a/test.ts
+++ b/test.ts
@@ -1,3 +1,3 @@
 const x = 1;
-const y = 2;
+const y = 3;
--- a/test.ts
+++ b/test.ts
@@ -5,3 +5,3 @@
 const a = 1;
-const b = 2;
+const b = 3;
`;

      const paths = extractFilePaths(diff);
      expect(paths).toEqual(['test.ts']);
    });
  });

  describe('parseDiffStats', () => {
    it('should parse diff statistics correctly', () => {
      const diff = `--- a/test.ts
+++ b/test.ts
@@ -1,3 +1,4 @@
 const x = 1;
-const y = 2;
+const y = 3;
+const z = 4;
`;

      const stats = parseDiffStats(diff);
      expect(stats.additions).toBe(2);
      expect(stats.deletions).toBe(1);
    });

    it('should handle empty diff', () => {
      const stats = parseDiffStats('');
      expect(stats.additions).toBe(0);
      expect(stats.deletions).toBe(0);
    });

    it('should not count diff markers', () => {
      const diff = `--- a/test.ts
+++ b/test.ts
@@ -1,1 +1,1 @@
-old
+new
`;

      const stats = parseDiffStats(diff);
      expect(stats.additions).toBe(1);
      expect(stats.deletions).toBe(1);
    });
  });
});
