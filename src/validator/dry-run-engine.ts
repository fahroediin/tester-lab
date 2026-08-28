import fs from 'fs';
import path from 'path';
import os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';
import type { DryRunResult, ResolvedStep, DSLConfig } from '../types/index.js';
import { CodeGenerator } from '../generator/code-generator.js';

const execAsync = promisify(exec);

/**
 * Build a sanitized environment object for child processes.
 * Only includes variables required for Playwright to function.
 * ALL secrets (JWT_SECRET, ADMIN_PASSWORD, etc.) are stripped.
 */
function getSanitizedEnv(): Record<string, string> {
  const ALLOWED_ENV_KEYS = [
    'PATH', 'HOME', 'USER', 'LANG', 'LC_ALL', 'SHELL',
    'DISPLAY', 'XAUTHORITY', 'DBUS_SESSION_BUS_ADDRESS',
    'XDG_RUNTIME_DIR', 'XDG_CONFIG_HOME', 'XDG_DATA_HOME',
    'TMPDIR', 'TMP', 'TEMP',
    'PLAYWRIGHT_BROWSERS_PATH',
    'CHROMIUM_FLAGS', 'CHROME_FLAGS',
    'PUPPETEER_CHROMIUM_REVISION',
    'NODE_PATH',
    'SystemRoot', 'APPDATA', 'LOCALAPPDATA', 'ProgramFiles',
    'ProgramFiles(x86)', 'CommonProgramFiles', 'USERPROFILE',
    'HOMEDRIVE', 'HOMEPATH', 'PATHEXT', 'COMSPEC', 'windir',
  ];

  const sanitized: Record<string, string> = {};
  for (const key of ALLOWED_ENV_KEYS) {
    if (process.env[key]) {
      sanitized[key] = process.env[key]!;
    }
  }
  return sanitized;
}

export class DryRunEngine {
  private generator = new CodeGenerator();

  /**
   * Perform dry-run headless execution of generated test script
   */
  public async executeDryRun(
    config: DSLConfig,
    resolvedSteps: ResolvedStep[],
    code: string
  ): Promise<DryRunResult> {
    const startTime = Date.now();
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'playwright-dryrun-'));
    const testFilePath = path.join(tempDir, 'dryrun.spec.ts');
    const configFilePath = path.join(tempDir, 'playwright.config.ts');

    // Create minimal Playwright config for dry run
    const playwrightConfig = `
import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: '${tempDir.replace(/\\/g, '/')}',
  timeout: 10000,
  use: {
    headless: true,
    viewport: { width: 1280, height: 720 },
  },
});
`;

    // Helper to safely cleanup temp directory
    const cleanupTempDir = () => {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {}
    };

    try {
      fs.writeFileSync(testFilePath, code, 'utf-8');
      fs.writeFileSync(configFilePath, playwrightConfig, 'utf-8');

      // Run playwright test on generated script from project working directory
      const command = `npx playwright test "${testFilePath.replace(/\\/g, '/')}" --config="${configFilePath.replace(/\\/g, '/')}"`;
      await execAsync(command, { 
        cwd: process.cwd(),
        env: {
          ...getSanitizedEnv(),
          NODE_PATH: path.join(process.cwd(), 'node_modules')
        }
      });

      const durationMs = Date.now() - startTime;
      cleanupTempDir();
      return {
        success: true,
        durationMs
      };
    } catch (error: unknown) {
      const err = error as { stdout?: string; stderr?: string; message?: string };
      const errorOutput = (err.stdout || '') + '\n' + (err.stderr || '');
      console.warn('Initial dry-run failed. Attempting Self-Healing Fallback Strategy...');

      // Attempt Self-Healing Strategy (tempDir is still alive here — NOT cleaned up yet)
      const healResult = await this.attemptSelfHealing(config, resolvedSteps, tempDir, configFilePath, errorOutput);
      
      // NOW cleanup temp directory, after self-healing is complete
      cleanupTempDir();

      if (healResult.success) {
        return {
          success: true,
          durationMs: Date.now() - startTime,
          selfHealed: true,
          healedSteps: healResult.healedSteps,
          healedCode: healResult.healedCode
        };
      }

      return {
        success: false,
        error: err.stderr || err.stdout || err.message || 'Dry run test execution failed',
        durationMs: Date.now() - startTime
      };
    }
  }

  /**
   * Self-healing rule: fallback to Rank 2 candidates if initial selector fails.
   * Returns the healed code string if successful so the caller can use the corrected script.
   */
  private async attemptSelfHealing(
    config: DSLConfig,
    resolvedSteps: ResolvedStep[],
    tempDir: string,
    configFilePath: string,
    errorOutput: string
  ): Promise<{ success: boolean; healedCode?: string; healedSteps?: { stepNumber: number; oldSelector: string; newSelector: string }[] }> {
    const healedStepsList: { stepNumber: number; oldSelector: string; newSelector: string }[] = [];
    const patchedSteps = [...resolvedSteps];

    // Find which step failed by parsing the console.log output
    const stepStarts = [...errorOutput.matchAll(/__STEP_START__ (\d+)/g)];
    const lastMatch = stepStarts[stepStarts.length - 1];
    const failedStepNumber = lastMatch && lastMatch[1] ? parseInt(lastMatch[1]) : -1;

    let healedAny = false;

    for (let i = 0; i < patchedSteps.length; i++) {
      const step = patchedSteps[i];
      // ONLY patch the step that actually failed!
      if (step && step.step === failedStepNumber && step.candidatesRank && step.candidatesRank.length > 1) {
        const rank2 = step.candidatesRank[1];
        if (!rank2) continue;
        const cand = rank2.candidate;

        const oldSelector = `${step.selectorType}('${step.selectorValue}')`;
        let newType = step.selectorType;
        let newValue = step.selectorValue;

        if (cand.testId) {
          newType = 'getByTestId';
          newValue = cand.testId;
        } else if (cand.labelText) {
          newType = 'getByLabel';
          newValue = cand.labelText;
        } else if (cand.placeholder) {
          newType = 'getByPlaceholder';
          newValue = cand.placeholder;
        } else if (cand.id) {
          newType = 'locator';
          newValue = `#${cand.id}`;
        } else if (cand.innerText) {
          newType = 'getByText';
          newValue = cand.innerText;
        }

        const newSelector = `${newType}('${newValue}')`;

        if (newSelector !== oldSelector) {
          patchedSteps[i] = {
            ...step,
            selectorType: newType as any,
            selectorValue: newValue,
            warning: `Self-Healed: Fallback to Rank 2 candidate (${rank2.matchReason})`
          } as ResolvedStep;

          healedStepsList.push({
            stepNumber: step.step,
            oldSelector,
            newSelector
          });
          healedAny = true;
        }
      }
    }

    if (!healedAny) {
      return { success: false };
    }

    const patchedResult = await this.generator.generateScript(config, patchedSteps);
    const patchedFilePath = path.join(tempDir, 'dryrun_healed.spec.ts');

    try {
      fs.writeFileSync(patchedFilePath, patchedResult.code, 'utf-8');
      const command = `npx playwright test "${patchedFilePath.replace(/\\/g, '/')}" --config="${configFilePath.replace(/\\/g, '/')}"`;
      await execAsync(command, { 
        cwd: process.cwd(),
        env: {
          ...getSanitizedEnv(),
          NODE_PATH: path.join(process.cwd(), 'node_modules')
        }
      });
      return {
        success: true,
        healedCode: patchedResult.code,
        healedSteps: healedStepsList
      };
    } catch {
      return { success: false };
    }
  }
}
