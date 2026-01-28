/**
 * AI Migration Spec - Separate schema for AI-powered migrations
 */

import Joi from 'joi';
import fs from 'fs';
import * as yaml from 'js-yaml';
import path from 'path';

/**
 * AI Migration Spec interface
 * Used when running `shepherd ai` command
 */
export interface IAIMigrationSpec {
  id: string;
  title: string;
  adapter: {
    type: string;
    [key: string]: any;
  };
  /** AI provider: 'claude', 'openai', or 'ollama' */
  provider?: string;
  /** Model identifier (provider-specific) */
  model?: string;
  /** File filtering configuration */
  context?: {
    /** Glob patterns for files to include */
    include?: string[];
    /** Glob patterns for files to exclude */
    exclude?: string[];
  };
  /** Maximum tokens for AI response */
  max_tokens?: number;
  /** Custom API base URL (for local models or OpenAI-compatible servers) */
  baseUrl?: string;
}

const SUPPORTED_PROVIDERS = ['claude', 'openai', 'ollama'];

/**
 * Load and validate AI migration spec from shepherd.yml
 */
export function loadAISpec(directory: string): IAIMigrationSpec {
  const docPath = path.join(directory, 'shepherd.yml');

  if (!fs.existsSync(docPath)) {
    throw new Error(`shepherd.yml not found in ${directory}`);
  }

  const spec = yaml.load(fs.readFileSync(docPath, 'utf8')) as any;
  const validationResult = validateAISpec(spec);

  if (validationResult.error) {
    throw new Error(`Error loading AI migration spec: ${validationResult.error.message}`);
  }

  return spec as IAIMigrationSpec;
}

/**
 * Validate AI migration spec against schema
 */
export function validateAISpec(spec: any): Joi.ValidationResult {
  const schema = Joi.object({
    id: Joi.string().required(),
    title: Joi.string().required(),
    adapter: Joi.object({
      type: Joi.string().valid('github').required(),
    })
      .unknown(true)
      .required(),
    provider: Joi.string()
      .valid(...SUPPORTED_PROVIDERS)
      .optional(),
    model: Joi.string().optional(),
    context: Joi.object({
      include: Joi.array().items(Joi.string()).optional(),
      exclude: Joi.array().items(Joi.string()).optional(),
    }).optional(),
    max_tokens: Joi.number().positive().optional(),
    baseUrl: Joi.string().uri().optional(),
  }).unknown(true); // Allow other fields (like hooks) to exist but ignore them

  return schema.validate(spec);
}

/**
 * Check if shepherd.yml exists in the directory
 */
export function hasShepherdYaml(directory: string): boolean {
  const docPath = path.join(directory, 'shepherd.yml');
  return fs.existsSync(docPath);
}
