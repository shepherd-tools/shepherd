import Joi from 'joi';
import fs from 'fs';
import * as yaml from 'js-yaml';
import _ from 'lodash';
const { cloneDeep, mapValues } = _;
import path from 'path';

export interface IMigrationHooks {
  should_migrate?: string[];
  should_create_issue?: string[];
  post_checkout?: string[];
  apply?: string[];
  pr_message?: string[];
  [name: string]: string[] | undefined;
}

export interface IMigrationIssues {
  title?: string | number;
  description?: string;
  labels?: string[];
  state?: 'open' | 'closed';
  state_reason?: 'completed' | 'not_planned' | 'reopened' | null;
}

export interface IApplyWithLLMConfig {
  enabled?: boolean;
  prompt?: string;
  files?: string[];
  model?: string;
  dryRun?: boolean;
  skipValidation?: boolean;
}

export type MigrationPhase = [keyof IMigrationHooks];

export interface IMigrationSpec {
  id: string;
  title: string;
  adapter: {
    type: string;
    [key: string]: any;
  };
  hooks: IMigrationHooks;
  issues?: IMigrationIssues;
  applywithllm?: IApplyWithLLMConfig;
}

export function loadSpec(directory: string): IMigrationSpec {
  const docPath = path.join(directory, 'shepherd.yml');
  const spec = yaml.load(fs.readFileSync(docPath, 'utf8'));
  const normalizedSpec = normalizeSpec(spec);
  const validationResult = validateSpec(normalizedSpec);
  if (validationResult.error) {
    throw new Error(`Error loading migration spec: ${validationResult.error.message}`);
  }
  return normalizedSpec;
}

export function normalizeSpec(originalSpec: any): IMigrationSpec {
  const spec = cloneDeep(originalSpec);
  if (spec.hooks) {
    spec.hooks = mapValues(spec.hooks, (steps: any, phase: string) => {
      if (typeof steps === 'string') {
        return [steps];
      } else if (Array.isArray(steps)) {
        return steps;
      } else {
        throw new Error(`Error reading shepherd.yml: ${phase} must be a string or array`);
      }
    });
  } else {
    spec.hooks = {};
  }
  return spec;
}

export function validateSpec(spec: any) {
  const hookSchema = Joi.array().items(Joi.string());
  const applywithllmSchema = Joi.object({
    enabled: Joi.boolean().optional(),
    prompt: Joi.string().optional(),
    files: Joi.array().items(Joi.string()).optional(),
    model: Joi.string().optional(),
    dryRun: Joi.boolean().optional(),
    skipValidation: Joi.boolean().optional(),
  }).optional();

  const schema = Joi.object({
    id: Joi.string().required(),
    title: Joi.string().required(),
    adapter: Joi.object({
      type: Joi.string().valid('github').required(),
    })
      .unknown(true)
      .required(),
    hooks: Joi.object({
      should_migrate: hookSchema,
      should_create_issue: hookSchema,
      post_checkout: hookSchema,
      apply: hookSchema,
      pr_message: hookSchema,
    }),
    issues: Joi.object({
      title: Joi.any().required(),
      description: Joi.string().required(),
      state: Joi.string().optional(),
      state_reason: Joi.string().optional(),
      labels: hookSchema.optional(),
    }).optional(),
    applywithllm: applywithllmSchema,
  });

  return schema.validate(spec);
}
