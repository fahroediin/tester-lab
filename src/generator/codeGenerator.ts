import fs from 'fs';
import path from 'path';
import Handlebars from 'handlebars';
import * as prettier from 'prettier';
import { DSLConfig, ResolvedStep, GenerationResult } from '../types/index.js';

// Register Handlebars helper for equality check
Handlebars.registerHelper('eq', function (a, b) {
  return a === b;
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

test('{{testSuite}}', async ({ page }) => {
  await page.goto('{{{targetUrl}}}');
  await page.waitForLoadState('networkidle');

  {{#each resolvedSteps}}
  // Step {{step}}: {{description}}
  {{#if (eq action "fill")}}
  await page.{{selectorType}}('{{{selectorValue}}}').fill('{{{value}}}');
  {{/if}}
  {{#if (eq action "click")}}
  await page.{{selectorType}}('{{{selectorValue}}}').click();
  {{/if}}
  {{#if (eq action "assert_url")}}
  await expect(page).toHaveURL(/.*{{{selectorValue}}}/);
  {{/if}}
  {{#if (eq action "assert_text")}}
  await expect(page.{{selectorType}}('{{{selectorValue}}}')).toContainText('{{{expected}}}');
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
      } catch (err) {
        console.warn('Prettier formatting warning:', err);
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
