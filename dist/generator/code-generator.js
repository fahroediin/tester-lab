"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CodeGenerator = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const handlebars_1 = __importDefault(require("handlebars"));
const prettier = __importStar(require("prettier"));
// Register Handlebars helper for equality check
handlebars_1.default.registerHelper('eq', function (a, b) {
    return a === b;
});
// Register Handlebars helper for escaping regex special characters inside string literals
handlebars_1.default.registerHelper('escapeRegex', function (str) {
    if (typeof str !== 'string')
        return '';
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\\\$&').replace(/'/g, "\\'");
});
// Coerce any templated value to a plain string (avoids [object Object]/undefined leaks)
function toStr(v) {
    if (v === undefined || v === null)
        return '';
    return typeof v === 'string' ? v : String(v);
}
// Escape a value for safe embedding inside a single-quoted JavaScript/TypeScript string literal.
// Prevents string-literal breakout (code injection) in generated Playwright/Cypress scripts.
handlebars_1.default.registerHelper('jsLit', function (str) {
    const escaped = toStr(str)
        .replace(/\\/g, '\\\\')
        .replace(/'/g, "\\'")
        .replace(/\r/g, '\\r')
        .replace(/\n/g, '\\n')
        .replace(/\u2028/g, '\\u2028')
        .replace(/\u2029/g, '\\u2029');
    return new handlebars_1.default.SafeString(escaped);
});
// Escape a value for safe embedding inside a Python string literal (single or double quoted).
handlebars_1.default.registerHelper('pyLit', function (str) {
    const escaped = toStr(str)
        .replace(/\\/g, '\\\\')
        .replace(/"/g, '\\"')
        .replace(/'/g, "\\'")
        .replace(/\r/g, '\\r')
        .replace(/\n/g, '\\n');
    return new handlebars_1.default.SafeString(escaped);
});
// Sanitize a value for a Robot Framework cell: strip line breaks and collapse the
// 2+ space separator so injected text cannot spill into extra keywords/arguments.
handlebars_1.default.registerHelper('rfText', function (str) {
    const cleaned = toStr(str)
        .replace(/[\r\n]+/g, ' ')
        .replace(/\t/g, ' ')
        .replace(/ {2,}/g, ' ')
        .trim();
    return new handlebars_1.default.SafeString(cleaned);
});
class CodeGenerator {
    /**
     * Transpile resolved steps & DSL config into formatted test script code
     */
    async generateScript(config, resolvedSteps) {
        const framework = config.framework || 'playwright';
        const language = config.language || 'typescript';
        let templateFileName = 'playwright-ts.hbs';
        if (framework === 'cypress') {
            templateFileName = 'cypress-js.hbs';
        }
        else if (framework === 'selenium') {
            templateFileName = 'selenium-py.hbs';
        }
        else if (framework === 'robotframework') {
            templateFileName = 'robot-rf.hbs';
        }
        else if (language === 'javascript') {
            templateFileName = 'playwright-js.hbs';
        }
        // Find template file path: prefer __dirname-based path (reliable regardless of cwd),
        // then fallback to process.cwd()-based paths
        let templatePath = path_1.default.join(__dirname, '..', 'templates', templateFileName);
        if (!fs_1.default.existsSync(templatePath)) {
            templatePath = path_1.default.join(process.cwd(), 'src', 'templates', templateFileName);
        }
        if (!fs_1.default.existsSync(templatePath)) {
            templatePath = path_1.default.join(process.cwd(), 'dist', 'templates', templateFileName);
        }
        let templateSource;
        try {
            templateSource = fs_1.default.readFileSync(templatePath, 'utf-8');
        }
        catch {
            // Fallback inline Playwright TS template
            templateSource = `import { test, expect } from '@playwright/test';

test('{{jsLit testSuite}}', async ({ page }) => {
  await page.goto('{{jsLit targetUrl}}');
  await page.waitForLoadState('networkidle');

  {{#each resolvedSteps}}
  // Step {{step}}: {{description}}
  {{#if (eq action "fill")}}
  await page.{{selectorType}}('{{jsLit selectorValue}}').fill('{{jsLit value}}');
  {{/if}}
  {{#if (eq action "click")}}
  await page.{{selectorType}}('{{jsLit selectorValue}}').click();
  {{/if}}
  {{#if (eq action "assert_url")}}
  await expect(page).toHaveURL(new RegExp('{{escapeRegex selectorValue}}'));
  {{/if}}
  {{#if (eq action "assert_text")}}
  await expect(page.{{selectorType}}('{{jsLit selectorValue}}')).toContainText('{{jsLit expected}}');
  {{/if}}
  {{/each}}
});`;
        }
        const needsRobustHelper = resolvedSteps.some(step => (step.action === 'fill' || step.action === 'select') &&
            step.selectorType === 'locator' &&
            !!step.targetLabel);
        const template = handlebars_1.default.compile(templateSource);
        const testTimeout = process.env.PLAYWRIGHT_TIMEOUT ? parseInt(process.env.PLAYWRIGHT_TIMEOUT, 10) : 120000;
        const rawCode = template({
            testSuite: config.testSuite,
            sanitizedTestSuite: config.testSuite.replace(/[^a-zA-Z0-9]/g, ''),
            targetUrl: config.targetUrl,
            viewport: config.viewport,
            resolvedSteps,
            needsRobustHelper,
            testTimeout
        });
        let formattedCode = rawCode;
        if (['playwright', 'cypress'].includes(framework)) {
            try {
                formattedCode = await prettier.format(rawCode, {
                    parser: language === 'javascript' || framework === 'cypress' ? 'babel' : 'typescript',
                    singleQuote: true,
                    trailingComma: 'none',
                    printWidth: 100
                });
            }
            catch (err) {
                console.warn('Prettier formatting warning:', err.message || err);
            }
        }
        const warnings = [];
        const logs = [];
        resolvedSteps.forEach((step) => {
            if (step.warning) {
                warnings.push(`Step ${step.step}: ${step.warning}`);
            }
            logs.push(`Step ${step.step} (${step.action}): Matched '${step.targetLabel || step.expected}' via ${step.selectorType}('${step.selectorValue}') with score ${step.matchScore}`);
        });
        return {
            success: true,
            code: formattedCode,
            resolvedSteps,
            warnings,
            logs
        };
    }
    /**
     * Save generated code to file system
     */
    async saveToFile(filePath, code) {
        const dir = path_1.default.dirname(filePath);
        if (!fs_1.default.existsSync(dir)) {
            fs_1.default.mkdirSync(dir, { recursive: true });
        }
        fs_1.default.writeFileSync(filePath, code, 'utf-8');
    }
}
exports.CodeGenerator = CodeGenerator;
