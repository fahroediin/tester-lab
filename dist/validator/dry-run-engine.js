"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DryRunEngine = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const os_1 = __importDefault(require("os"));
const child_process_1 = require("child_process");
const util_1 = require("util");
const code_generator_js_1 = require("../generator/code-generator.js");
const sanitized_env_js_1 = require("../server/lib/sanitized-env.js");
const code_sanitizer_js_1 = require("../server/code-sanitizer.js");
const execFileAsync = (0, util_1.promisify)(child_process_1.execFile);
async function runPlaywrightTest(testFilePath, configFilePath) {
    const npxCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
    const normalizedTestPath = testFilePath.replace(/\\/g, '/');
    const normalizedConfigPath = configFilePath.replace(/\\/g, '/');
    const args = ['playwright', 'test', normalizedTestPath, `--config=${normalizedConfigPath}`];
    return execFileAsync(npxCmd, args, {
        cwd: process.cwd(),
        shell: process.platform === 'win32',
        env: {
            ...(0, sanitized_env_js_1.getSanitizedEnv)(),
            NODE_PATH: path_1.default.join(process.cwd(), 'node_modules')
        }
    });
}
class DryRunEngine {
    generator = new code_generator_js_1.CodeGenerator();
    /**
     * Perform dry-run headless execution of generated test script
     */
    async executeDryRun(config, resolvedSteps, code) {
        const startTime = Date.now();
        const tempDir = fs_1.default.mkdtempSync(path_1.default.join(os_1.default.tmpdir(), 'playwright-dryrun-'));
        const testFilePath = path_1.default.join(tempDir, 'dryrun.spec.ts');
        const configFilePath = path_1.default.join(tempDir, 'playwright.config.ts');
        // Create minimal Playwright config for dry run
        const playwrightConfig = `
import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: '${tempDir.replace(/\\/g, '/')}',
  timeout: 60000,
  use: {
    headless: true,
    viewport: { width: 1280, height: 720 },
  },
});
`;
        // Helper to safely cleanup temp directory
        const cleanupTempDir = () => {
            try {
                fs_1.default.rmSync(tempDir, { recursive: true, force: true });
            }
            catch { }
        };
        // Defense-in-depth (CODING_STANDARD 6.5): never execute unsanitized code server-side
        const initialScan = (0, code_sanitizer_js_1.sanitizeCode)(code);
        if (!initialScan.safe) {
            cleanupTempDir();
            return {
                success: false,
                error: `Dry-run blocked by code sanitizer: ${initialScan.violations.join('; ')}`,
                durationMs: Date.now() - startTime
            };
        }
        try {
            fs_1.default.writeFileSync(testFilePath, code, 'utf-8');
            fs_1.default.writeFileSync(configFilePath, playwrightConfig, 'utf-8');
            // Run playwright test safely on generated script
            await runPlaywrightTest(testFilePath, configFilePath);
            const durationMs = Date.now() - startTime;
            cleanupTempDir();
            return {
                success: true,
                durationMs
            };
        }
        catch (error) {
            const err = error;
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
    async attemptSelfHealing(config, resolvedSteps, tempDir, configFilePath, errorOutput) {
        const healedStepsList = [];
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
                if (!rank2)
                    continue;
                const cand = rank2.candidate;
                const oldSelector = `${step.selectorType}('${step.selectorValue}')`;
                let newType = step.selectorType;
                let newValue = step.selectorValue;
                if (cand.testId) {
                    newType = 'getByTestId';
                    newValue = cand.testId;
                }
                else if (cand.labelText) {
                    newType = 'getByLabel';
                    newValue = cand.labelText;
                }
                else if (cand.placeholder) {
                    newType = 'getByPlaceholder';
                    newValue = cand.placeholder;
                }
                else if (cand.id) {
                    newType = 'locator';
                    newValue = `#${cand.id}`;
                }
                else if (cand.innerText) {
                    newType = 'getByText';
                    newValue = cand.innerText;
                }
                const newSelector = `${newType}('${newValue}')`;
                if (newSelector !== oldSelector) {
                    patchedSteps[i] = {
                        ...step,
                        selectorType: newType,
                        selectorValue: newValue,
                        warning: `Self-Healed: Fallback to Rank 2 candidate (${rank2.matchReason})`
                    };
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
        const patchedFilePath = path_1.default.join(tempDir, 'dryrun_healed.spec.ts');
        // Sanitize the self-healed code as well before executing it
        if (!(0, code_sanitizer_js_1.sanitizeCode)(patchedResult.code).safe) {
            return { success: false };
        }
        try {
            fs_1.default.writeFileSync(patchedFilePath, patchedResult.code, 'utf-8');
            await runPlaywrightTest(patchedFilePath, configFilePath);
            return {
                success: true,
                healedCode: patchedResult.code,
                healedSteps: healedStepsList
            };
        }
        catch {
            return { success: false };
        }
    }
}
exports.DryRunEngine = DryRunEngine;
