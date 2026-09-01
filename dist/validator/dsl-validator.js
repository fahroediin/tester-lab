"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DSLConfigSchema = exports.DSLStepSchema = exports.StepOptionsSchema = exports.DSLActionSchema = void 0;
exports.validateDSL = validateDSL;
const zod_1 = require("zod");
exports.DSLActionSchema = zod_1.z.enum([
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
exports.StepOptionsSchema = zod_1.z.object({
    timeout: zod_1.z.number().positive().optional(),
    force: zod_1.z.boolean().optional(),
    iframeSelector: zod_1.z.string().optional(),
    exact: zod_1.z.boolean().optional()
}).optional();
exports.DSLStepSchema = zod_1.z.object({
    step: zod_1.z.number().int().positive(),
    action: exports.DSLActionSchema,
    targetLabel: zod_1.z.string().optional(),
    value: zod_1.z.string().optional(),
    expected: zod_1.z.string().optional(),
    description: zod_1.z.string().optional(),
    options: exports.StepOptionsSchema
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
exports.DSLConfigSchema = zod_1.z.object({
    testSuite: zod_1.z.string().min(1, "testSuite must not be empty"),
    targetUrl: zod_1.z
        .string()
        .min(1, "targetUrl must not be empty")
        .refine((v) => {
        try {
            const u = new URL(v);
            return u.protocol === 'http:' || u.protocol === 'https:';
        }
        catch {
            return false;
        }
    }, "targetUrl must be a valid http(s) URL"),
    framework: zod_1.z.enum(['playwright', 'cypress', 'selenium', 'robotframework']).default('playwright').optional(),
    language: zod_1.z.enum(['typescript', 'javascript', 'python', 'robot']).default('typescript').optional(),
    viewport: zod_1.z.object({
        width: zod_1.z.number().positive(),
        height: zod_1.z.number().positive()
    }).optional(),
    steps: zod_1.z.array(exports.DSLStepSchema).min(1, "At least one step is required in steps array")
});
function normalizeDSLInput(input) {
    if (!input || typeof input !== 'object')
        return input;
    try {
        const cloned = JSON.parse(JSON.stringify(input));
        if (Array.isArray(cloned.steps)) {
            cloned.steps = cloned.steps.map((s, idx) => {
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
    }
    catch {
        return input;
    }
}
function validateDSL(input) {
    const normalized = normalizeDSLInput(input);
    const parseResult = exports.DSLConfigSchema.safeParse(normalized);
    if (!parseResult.success) {
        const formattedErrors = parseResult.error.errors.map((err) => `${err.path.join('.')}: ${err.message}`);
        return {
            valid: false,
            errors: formattedErrors
        };
    }
    return {
        valid: true,
        data: parseResult.data
    };
}
