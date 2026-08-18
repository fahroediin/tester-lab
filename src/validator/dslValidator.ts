import { z } from 'zod';
import { DSLConfig } from '../types/index.js';

export const DSLActionSchema = z.enum([
  'fill',
  'click',
  'select',
  'check',
  'uncheck',
  'upload',
  'assert_text',
  'assert_url',
  'assert_visible',
  'wait'
]);

export const StepOptionsSchema = z.object({
  timeout: z.number().positive().optional(),
  force: z.boolean().optional(),
  iframeSelector: z.string().optional(),
  exact: z.boolean().optional()
}).optional();

export const DSLStepSchema = z.object({
  step: z.number().int().positive(),
  action: DSLActionSchema,
  targetLabel: z.string().optional(),
  value: z.string().optional(),
  expected: z.string().optional(),
  description: z.string().optional(),
  options: StepOptionsSchema
}).refine((data) => {
  if (['fill', 'select', 'upload'].includes(data.action) && !data.value) {
    return false;
  }
  if (data.action === 'assert_url' && !data.expected) {
    return false;
  }
  if (['assert_text', 'assert_visible'].includes(data.action) && !data.expected && !data.targetLabel) {
    return false;
  }
  return true;
}, {
  message: "Invalid step parameters for specified action"
});

export const DSLConfigSchema = z.object({
  testSuite: z.string().min(1, "testSuite must not be empty"),
  targetUrl: z.string().min(1, "targetUrl must not be empty"),
  framework: z.enum(['playwright', 'cypress', 'selenium', 'robotframework']).default('playwright').optional(),
  language: z.enum(['typescript', 'javascript', 'python', 'robot']).default('typescript').optional(),
  viewport: z.object({
    width: z.number().positive(),
    height: z.number().positive()
  }).optional(),
  steps: z.array(DSLStepSchema).min(1, "At least one step is required in steps array")
});

export interface ValidationResult {
  valid: boolean;
  data?: DSLConfig;
  errors?: string[];
}

export function validateDSL(input: unknown): ValidationResult {
  const parseResult = DSLConfigSchema.safeParse(input);
  if (!parseResult.success) {
    const formattedErrors = parseResult.error.errors.map(
      (err) => `${err.path.join('.')}: ${err.message}`
    );
    return {
      valid: false,
      errors: formattedErrors
    };
  }

  return {
    valid: true,
    data: parseResult.data as DSLConfig
  };
}
