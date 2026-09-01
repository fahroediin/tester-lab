import fs from 'fs';
import path from 'path';
import Handlebars from 'handlebars';
import * as prettier from 'prettier';
import type { DSLConfig, ResolvedStep, GenerationResult } from '../types/index.js';

// Register Handlebars helper for equality check
Handlebars.registerHelper('eq', function (a: unknown, b: unknown) {
  return a === b;
});

// Register Handlebars helper for escaping regex special characters inside string literals
Handlebars.registerHelper('escapeRegex', function (str: unknown) {
  if (typeof str !== 'string') return '';
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\\\$&').replace(/'/g, "\\'");
});

// Coerce any templated value to a plain string (avoids [object Object]/undefined leaks)
function toStr(v: unknown): string {
  if (v === undefined || v === null) return '';
  return typeof v === 'string' ? v : String(v);
}

// Escape a value for safe embedding inside a single-quoted JavaScript/TypeScript string literal.
// Prevents string-literal breakout (code injection) in generated Playwright/Cypress scripts.
Handlebars.registerHelper('jsLit', function (str: unknown) {
  const escaped = toStr(str)
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
  return new Handlebars.SafeString(escaped);
});

// Escape a value for safe embedding inside a Python string literal (single or double quoted).
Handlebars.registerHelper('pyLit', function (str: unknown) {
  const escaped = toStr(str)
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/'/g, "\\'")
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n');
  return new Handlebars.SafeString(escaped);
});

// Sanitize a value for a Robot Framework cell: strip line breaks and collapse the
// 2+ space separator so injected text cannot spill into extra keywords/arguments.
Handlebars.registerHelper('rfText', function (str: unknown) {
  const cleaned = toStr(str)
    .replace(/[\r\n]+/g, ' ')
    .replace(/\t/g, ' ')
    .replace(/ {2,}/g, ' ')
    .trim();
  return new Handlebars.SafeString(cleaned);
});

export class CodeGenerator {
  /**
   * Transpile resolved steps & DSL config into formatted test script code
   */
  public async generateScript(
    config: DSLConfig,
    resolvedSteps: ResolvedStep[]
  ): Promise<GenerationResult> {
    const framework = config.framework || 'playwright';
    const language = config.language || 'typescript';

    let templateFileName = 'playwright-ts.hbs';
    if ((framework as string) === 'cypress') {
      templateFileName = 'cypress-js.hbs';
    } else if ((framework as string) === 'selenium') {
      templateFileName = 'selenium-py.hbs';
    } else if ((framework as string) === 'robotframework') {
      templateFileName = 'robot-rf.hbs';
    } else if (language === 'javascript') {
      templateFileName = 'playwright-js.hbs';
    }

    // Find template file path: prefer __dirname-based path (reliable regardless of cwd),
    // then fallback to process.cwd()-based paths
    let templatePath = path.join(__dirname, '..', 'templates', templateFileName);
    if (!fs.existsSync(templatePath)) {
      templatePath = path.join(process.cwd(), 'src', 'templates', templateFileName);
    }
    if (!fs.existsSync(templatePath)) {
      templatePath = path.join(process.cwd(), 'dist', 'templates', templateFileName);
    }

    let templateSource: string;
    try {
      templateSource = fs.readFileSync(templatePath, 'utf-8');
    } catch {
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

    const needsRobustHelper = resolvedSteps.some(step => 
      (step.action === 'fill' || step.action === 'select') && 
      step.selectorType === 'locator' && 
      !!step.targetLabel
    );

    const template = Handlebars.compile(templateSource);
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
      } catch (err: unknown) {
        console.warn('Prettier formatting warning:', (err as Error).message || err);
      }
    }

    const warnings: string[] = [];
    const logs: string[] = [];

    resolvedSteps.forEach((step) => {
      if (step.warning) {
        warnings.push(`Step ${step.step}: ${step.warning}`);
      }
      logs.push(
        `Step ${step.step} (${step.action}): Matched '${step.targetLabel || step.expected}' via ${step.selectorType}('${step.selectorValue}') with score ${step.matchScore}`
      );
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
  public async saveToFile(filePath: string, code: string): Promise<void> {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(filePath, code, 'utf-8');
  }
}
