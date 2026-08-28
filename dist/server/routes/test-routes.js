"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.testRoutes = void 0;
const fs_1 = __importDefault(require("fs"));
const os_1 = __importDefault(require("os"));
const path_1 = __importDefault(require("path"));
const express_1 = require("express");
const child_process_1 = require("child_process");
const util_1 = require("util");
const auth_middleware_js_1 = require("../auth-middleware.js");
const activity_log_store_js_1 = require("../activity-log-store.js");
const code_sanitizer_js_1 = require("../code-sanitizer.js");
const queue_manager_js_1 = require("../queue-manager.js");
const sanitized_env_js_1 = require("../lib/sanitized-env.js");
const flow_history_store_js_1 = require("../flow-history-store.js");
const index_js_1 = require("../../index.js");
const dom_extractor_js_1 = require("../../crawler/dom-extractor.js");
const supabase_client_js_1 = require("../supabase-client.js");
const execAsync = (0, util_1.promisify)(child_process_1.exec);
exports.testRoutes = (0, express_1.Router)();
const generator = new index_js_1.TestScriptGenerator();
const extractor = new dom_extractor_js_1.DOMExtractor();
/**
 * POST /api/v1/generate-script
 * Generate test script from JSON DSL payload (Requires approved account)
 */
exports.testRoutes.post('/generate-script', auth_middleware_js_1.authenticateJWT, auth_middleware_js_1.requireApprovedUser, async (req, res) => {
    try {
        const { dsl, dryRun, outPath } = req.body;
        if (!dsl) {
            res.status(400).json({
                success: false,
                error: 'Missing required field: dsl'
            });
            return;
        }
        const result = await generator.generate(dsl, {
            dryRun: !!dryRun,
            outPath
        });
        if (!result.success) {
            await (0, activity_log_store_js_1.addLog)({
                userId: req.user.id,
                username: req.user.username,
                action: 'Generate Script Failed',
                details: 'Failed due to validation or generation errors'
            });
            res.status(422).json({
                success: false,
                errors: result.warnings
            });
            return;
        }
        await (0, activity_log_store_js_1.addLog)({
            userId: req.user.id,
            username: req.user.username,
            action: 'Generate Script',
            details: `Generated script for target URL: ${dsl.targetUrl}`
        });
        const historyRecord = await (0, flow_history_store_js_1.addHistory)({
            userId: req.user.id,
            username: req.user.username,
            testSuite: dsl.testSuite || 'Unknown Test Suite',
            targetUrl: dsl.targetUrl || '',
            status: 'GENERATED',
            generatedCode: result.code,
            resolvedSteps: result.resolvedSteps,
            rawDsl: dsl
        });
        res.json({
            success: true,
            historyId: historyRecord.id,
            code: result.code,
            resolvedSteps: result.resolvedSteps,
            warnings: result.warnings,
            logs: result.logs,
            dryRunPassed: result.dryRunPassed,
            dryRunError: result.dryRunError
        });
    }
    catch (err) {
        const error = err;
        res.status(500).json({
            success: false,
            error: error.message || 'Internal Server Error'
        });
    }
});
/**
 * POST /api/v1/inspect-dom
 * Extract interactive candidate DOM elements from target URL (Requires approved account)
 */
exports.testRoutes.post('/inspect-dom', auth_middleware_js_1.authenticateJWT, auth_middleware_js_1.requireApprovedUser, async (req, res) => {
    try {
        const { url, viewport } = req.body;
        if (!url) {
            res.status(400).json({
                success: false,
                error: 'Missing required field: url'
            });
            return;
        }
        const candidates = await extractor.extractCandidates(url, { viewport });
        res.json({
            success: true,
            url,
            candidateCount: candidates.length,
            candidates
        });
    }
    catch (err) {
        const error = err;
        res.status(500).json({
            success: false,
            error: error.message || 'Internal Server Error'
        });
    }
});
/**
 * POST /api/v1/run-test
 * Directly execute generated Playwright test code with Concurrency Queue
 */
exports.testRoutes.post('/run-test', auth_middleware_js_1.authenticateJWT, auth_middleware_js_1.requireApprovedUser, async (req, res) => {
    try {
        const { code, mode = 'headless', language = 'typescript', historyId } = req.body;
        const userId = req.user.id;
        if (!code || typeof code !== 'string') {
            res.status(400).json({
                success: false,
                error: 'Missing required field: code'
            });
            return;
        }
        // Layer 2: Code Content Validation — block dangerous patterns
        const sanitizeResult = (0, code_sanitizer_js_1.sanitizeCode)(code);
        if (!sanitizeResult.safe) {
            await (0, activity_log_store_js_1.addLog)({
                userId: req.user.id,
                username: req.user.username,
                action: 'Run Test Blocked',
                details: `Code rejected: ${sanitizeResult.violations.join('; ')}`
            });
            res.status(403).json({
                success: false,
                error: 'Submitted code contains blocked patterns that are not allowed for security reasons.',
                violations: sanitizeResult.violations
            });
            return;
        }
        if (historyId) {
            await (0, flow_history_store_js_1.updateHistory)(historyId, { status: 'RUNNING' });
        }
        // Enqueue task into Concurrency Manager
        const runResult = await queue_manager_js_1.globalTestRunnerQueue.enqueue(async () => {
            const startTime = Date.now();
            const tempDir = fs_1.default.mkdtempSync(path_1.default.join(os_1.default.tmpdir(), 'playwright-ui-run-'));
            const fileExt = language === 'javascript' ? '.spec.js' : '.spec.ts';
            const testFilePath = path_1.default.join(tempDir, `manual_run${fileExt}`);
            const configFilePath = path_1.default.join(tempDir, 'playwright.config.ts');
            const isHeaded = mode === 'headed';
            const manualTimeout = process.env.PLAYWRIGHT_TIMEOUT ? parseInt(process.env.PLAYWRIGHT_TIMEOUT, 10) : 120000;
            const playwrightConfig = `
import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: '${tempDir.replace(/\\/g, '/')}',
  outputDir: '${tempDir.replace(/\\/g, '/')}/results',
  timeout: ${manualTimeout},
  use: {
    headless: ${!isHeaded},
    video: 'on',
    launchOptions: {
      slowMo: ${isHeaded ? 1000 : 0}
    },
    viewport: { width: 1280, height: 720 },
  },
});
`;
            fs_1.default.writeFileSync(testFilePath, code, 'utf-8');
            fs_1.default.writeFileSync(configFilePath, playwrightConfig, 'utf-8');
            let command = `npx playwright test "${testFilePath.replace(/\\/g, '/')}" --config="${configFilePath.replace(/\\/g, '/')}"`;
            if (isHeaded) {
                command += ' --headed';
                if (process.platform === 'linux' && !process.env.DISPLAY) {
                    command = `xvfb-run -a ${command}`;
                }
            }
            let logs = '';
            let success = false;
            let videoUrl;
            try {
                const { stdout, stderr } = await execAsync(command, {
                    cwd: process.cwd(),
                    env: {
                        ...(0, sanitized_env_js_1.getSanitizedEnv)(),
                        NODE_PATH: path_1.default.join(process.cwd(), 'node_modules')
                    }
                });
                logs = stdout || stderr || '[PASS] Test execution completed successfully.';
                success = true;
            }
            catch (err) {
                const error = err;
                logs = (error.stdout || '') + '\n' + (error.stderr || '') + '\n' + (error.message || '');
                success = false;
            }
            // Check for video recording artifact and upload to Supabase Storage
            try {
                const foundVideo = (0, sanitized_env_js_1.findVideoFile)(tempDir);
                if (foundVideo) {
                    const sanitizedUserId = userId.replace(/[^a-zA-Z0-9_-]/g, '');
                    const videoName = `run_${Date.now()}.webm`;
                    const storagePath = `${sanitizedUserId}/${videoName}`;
                    const fileBuffer = fs_1.default.readFileSync(foundVideo);
                    const { error: uploadError } = await supabase_client_js_1.supabase.storage
                        .from('test-videos')
                        .upload(storagePath, fileBuffer, {
                        contentType: 'video/webm',
                        upsert: true
                    });
                    if (uploadError) {
                        console.error('Failed to upload video recording to Supabase Storage:', uploadError);
                    }
                    else {
                        const { data: urlData } = supabase_client_js_1.supabase.storage
                            .from('test-videos')
                            .getPublicUrl(storagePath);
                        videoUrl = urlData?.publicUrl;
                    }
                }
            }
            catch (videoErr) {
                console.warn('Video artifact extraction warning:', videoErr);
            }
            finally {
                try {
                    fs_1.default.rmSync(tempDir, { recursive: true, force: true });
                }
                catch { }
            }
            const durationMs = Date.now() - startTime;
            await (0, activity_log_store_js_1.addLog)({
                userId: req.user.id,
                username: req.user.username,
                action: 'Run Test',
                details: `Ran script in ${mode} mode (Status: ${success ? 'Success' : 'Failed'}, Duration: ${durationMs}ms)`
            });
            if (historyId) {
                await (0, flow_history_store_js_1.updateHistory)(historyId, {
                    status: success ? 'SUCCESS' : 'FAILED',
                    durationMs,
                    runLogs: logs.trim(),
                    ...(videoUrl ? { videoUrl } : {})
                });
            }
            return {
                success,
                logs: logs.trim(),
                videoUrl,
                durationMs
            };
        });
        res.json(runResult);
    }
    catch (err) {
        const error = err;
        res.status(500).json({
            success: false,
            error: error.message || 'Internal Server Error'
        });
    }
});
