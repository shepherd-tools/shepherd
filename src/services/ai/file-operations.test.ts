import { readRepoFiles, applyEdits } from './file-operations';
import fs from 'fs-extra';
import { glob } from 'glob';

jest.mock('fs-extra');
jest.mock('glob');

describe('file-operations', () => {
  const mockRepoDir = '/mock/repo';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('readRepoFiles', () => {
    it('should read files matching include patterns', async () => {
      (glob as unknown as jest.Mock).mockResolvedValue(['src/index.ts', 'src/utils.ts']);
      (fs.stat as jest.Mock).mockResolvedValue({ size: 1024 });
      (fs.readFile as jest.Mock)
        .mockResolvedValueOnce('const a = 1;')
        .mockResolvedValueOnce('const b = 2;');

      const result = await readRepoFiles(mockRepoDir, {
        context: { include: ['**/*.ts'] },
      });

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ path: 'src/index.ts', content: 'const a = 1;' });
      expect(result[1]).toEqual({ path: 'src/utils.ts', content: 'const b = 2;' });
    });

    it('should use default patterns when no context provided', async () => {
      (glob as unknown as jest.Mock).mockResolvedValue([]);

      await readRepoFiles(mockRepoDir, {});

      expect(glob).toHaveBeenCalledWith(
        '**/*',
        expect.objectContaining({
          cwd: mockRepoDir,
          nodir: true,
        })
      );
    });

    it('should skip files larger than 100KB', async () => {
      (glob as unknown as jest.Mock).mockResolvedValue(['large-file.ts']);
      (fs.stat as jest.Mock).mockResolvedValue({ size: 150 * 1024 }); // 150KB

      const result = await readRepoFiles(mockRepoDir, {});

      expect(result).toHaveLength(0);
      expect(fs.readFile).not.toHaveBeenCalled();
    });

    it('should skip binary files', async () => {
      (glob as unknown as jest.Mock).mockResolvedValue(['binary.bin']);
      (fs.stat as jest.Mock).mockResolvedValue({ size: 1024 });
      (fs.readFile as jest.Mock).mockResolvedValue('binary\0content');

      const result = await readRepoFiles(mockRepoDir, {});

      expect(result).toHaveLength(0);
    });

    it('should skip unreadable files', async () => {
      (glob as unknown as jest.Mock).mockResolvedValue(['unreadable.ts']);
      (fs.stat as jest.Mock).mockRejectedValue(new Error('EACCES'));

      const result = await readRepoFiles(mockRepoDir, {});

      expect(result).toHaveLength(0);
    });
  });

  describe('applyEdits', () => {
    it('should create a new file', async () => {
      (fs.ensureDir as jest.Mock).mockResolvedValue(undefined);
      (fs.writeFile as jest.Mock).mockResolvedValue(undefined);

      await applyEdits(mockRepoDir, [
        { path: 'src/new-file.ts', action: 'create', content: 'const x = 1;' },
      ]);

      expect(fs.ensureDir).toHaveBeenCalled();
      expect(fs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('new-file.ts'),
        'const x = 1;'
      );
    });

    it('should modify an existing file', async () => {
      (fs.ensureDir as jest.Mock).mockResolvedValue(undefined);
      (fs.writeFile as jest.Mock).mockResolvedValue(undefined);

      await applyEdits(mockRepoDir, [
        { path: 'src/index.ts', action: 'modify', content: 'const updated = true;' },
      ]);

      expect(fs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('index.ts'),
        'const updated = true;'
      );
    });

    it('should delete an existing file', async () => {
      (fs.pathExists as jest.Mock).mockResolvedValue(true);
      (fs.remove as jest.Mock).mockResolvedValue(undefined);

      await applyEdits(mockRepoDir, [{ path: 'src/delete-me.ts', action: 'delete' }]);

      expect(fs.remove).toHaveBeenCalled();
    });

    it('should not delete if file does not exist', async () => {
      (fs.pathExists as jest.Mock).mockResolvedValue(false);

      await applyEdits(mockRepoDir, [{ path: 'src/nonexistent.ts', action: 'delete' }]);

      expect(fs.remove).not.toHaveBeenCalled();
    });

    it('should throw error for path traversal attempt', async () => {
      await expect(
        applyEdits(mockRepoDir, [{ path: '../../../etc/passwd', action: 'create', content: 'bad' }])
      ).rejects.toThrow('Security error');
    });

    it('should throw error for missing content on create', async () => {
      await expect(
        applyEdits(mockRepoDir, [{ path: 'src/file.ts', action: 'create' }])
      ).rejects.toThrow('Missing content');
    });

    it('should throw error for missing content on modify', async () => {
      await expect(
        applyEdits(mockRepoDir, [{ path: 'src/file.ts', action: 'modify' }])
      ).rejects.toThrow('Missing content');
    });
  });
});
