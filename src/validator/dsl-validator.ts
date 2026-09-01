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
  // assert_url accepts the URL fragment via `expected` OR `value` (engine reads `expected || value`)
  if (data.action === 'assert_url' && !data.expected && !data.value) {
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
  targetUrl: z
    .string()
    .min(1, "targetUrl must not be empty")
    .refine((v) => {
      try {
        const u = new URL(v);
        return u.protocol === 'http:' || u.protocol === 'https:';
      } catch {
        return false;
      }
    }, "targetUrl must be a valid http(s) URL"),
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

function normalizeDSLInput(input: unknown): unknown {
  if (!input || typeof input !== 'object') return input;
  try {
    const cloned = JSON.parse(JSON.stringify(input));
    if (Array.isArray(cloned.steps)) {
      cloned.steps = cloned.steps.map((s: Record<string, unknown>, idx: number) => {
        if (s && typeof s === 'object') {
          if (!s.step || typeof s.step !== 'number') {
            s.step = idx + 1;
          }
          // Normalize action: 'type' or 'input' -> 'fill'
          if (s.action === 'type' || s.action === 'input') {
            s.action = 'fill';
          }
          // Normalize target alias: 'target' -> 'targetLabel'
          if (s.target && !s.targetLabel) {
            s.targetLabel = s.target;
          }
        }
        return s;
      });
    }
    return cloned;
  } catch {
    return input;
  }
}

export function validateDSL(input: unknown): ValidationResult {
  const normalized = normalizeDSLInput(input);
  const parseResult = DSLConfigSchema.safeParse(normalized);
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
