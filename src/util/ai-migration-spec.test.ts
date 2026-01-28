import { loadAISpec, validateAISpec, hasShepherdYaml } from './ai-migration-spec';
import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';

jest.mock('fs');
jest.mock('path');
jest.mock('js-yaml');

describe('ai-migration-spec', () => {
  const mockDirectory = '/mock/directory';
  const mockFilePath = '/mock/directory/shepherd.yml';
  const mockSpec = {
    id: 'test-ai-migration',
    title: 'Test AI Migration',
    adapter: {
      type: 'github',
      org: 'test-org',
    },
    provider: 'claude',
    model: 'claude-sonnet-4-20250514',
    context: {
      include: ['**/*.ts'],
      exclude: ['node_modules/**'],
    },
    max_tokens: 4096,
  };

  beforeEach(() => {
    (path.join as jest.Mock).mockReturnValue(mockFilePath);
    (fs.existsSync as jest.Mock).mockReturnValue(true);
    (fs.readFileSync as jest.Mock).mockReturnValue('mock yaml content');
    (yaml.load as jest.Mock).mockReturnValue(mockSpec);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('loadAISpec', () => {
    it('should load and validate the AI spec', () => {
      const result = loadAISpec(mockDirectory);
      expect(path.join).toHaveBeenCalledWith(mockDirectory, 'shepherd.yml');
      expect(fs.readFileSync).toHaveBeenCalledWith(mockFilePath, 'utf8');
      expect(yaml.load).toHaveBeenCalledWith('mock yaml content');
      expect(result).toEqual(mockSpec);
    });

    it('should throw an error if shepherd.yml does not exist', () => {
      (fs.existsSync as jest.Mock).mockReturnValue(false);
      expect(() => loadAISpec(mockDirectory)).toThrow('shepherd.yml not found');
    });

    it('should throw an error if validation fails', () => {
      const invalidSpec = { ...mockSpec, id: undefined };
      (yaml.load as jest.Mock).mockReturnValue(invalidSpec);
      expect(() => loadAISpec(mockDirectory)).toThrow('Error loading AI migration spec');
    });
  });

  describe('validateAISpec', () => {
    it('should validate a complete AI spec', () => {
      const result = validateAISpec(mockSpec);
      expect(result.error).toBeUndefined();
    });

    it('should validate a minimal AI spec (without provider)', () => {
      const minimalSpec = {
        id: 'test-ai-migration',
        title: 'Test AI Migration',
        adapter: {
          type: 'github',
          org: 'test-org',
        },
      };
      const result = validateAISpec(minimalSpec);
      expect(result.error).toBeUndefined();
    });

    it('should return error for missing id', () => {
      const invalidSpec = { ...mockSpec, id: undefined };
      const result = validateAISpec(invalidSpec);
      expect(result.error).toBeDefined();
    });

    it('should return error for missing title', () => {
      const invalidSpec = { ...mockSpec, title: undefined };
      const result = validateAISpec(invalidSpec);
      expect(result.error).toBeDefined();
    });

    it('should return error for missing adapter', () => {
      const invalidSpec = { ...mockSpec, adapter: undefined };
      const result = validateAISpec(invalidSpec);
      expect(result.error).toBeDefined();
    });

    it('should return error for invalid provider', () => {
      const invalidSpec = { ...mockSpec, provider: 'invalid-provider' };
      const result = validateAISpec(invalidSpec);
      expect(result.error).toBeDefined();
    });

    it('should accept openai as valid provider', () => {
      const openaiSpec = { ...mockSpec, provider: 'openai' };
      const result = validateAISpec(openaiSpec);
      expect(result.error).toBeUndefined();
    });

    it('should return error for negative max_tokens', () => {
      const invalidSpec = { ...mockSpec, max_tokens: -100 };
      const result = validateAISpec(invalidSpec);
      expect(result.error).toBeDefined();
    });

    it('should allow unknown fields (like hooks)', () => {
      const specWithHooks = {
        ...mockSpec,
        hooks: { apply: ['some-step'] },
      };
      const result = validateAISpec(specWithHooks);
      expect(result.error).toBeUndefined();
    });
  });

  describe('hasShepherdYaml', () => {
    it('should return true if shepherd.yml exists', () => {
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      expect(hasShepherdYaml(mockDirectory)).toBe(true);
    });

    it('should return false if shepherd.yml does not exist', () => {
      (fs.existsSync as jest.Mock).mockReturnValue(false);
      expect(hasShepherdYaml(mockDirectory)).toBe(false);
    });
  });
});
