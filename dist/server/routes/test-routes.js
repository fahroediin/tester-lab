"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.testRoutes = void 0;
const express_1 = require("express");
const auth_middleware_js_1 = require("../auth-middleware.js");
const activity_log_store_js_1 = require("../activity-log-store.js");
const code_sanitizer_js_1 = require("../code-sanitizer.js");
const queue_manager_js_1 = require("../queue-manager.js");
const flow_history_store_js_1 = require("../flow-history-store.js");
const index_js_1 = require("../../index.js");
const dom_extractor_js_1 = require("../../crawler/dom-extractor.js");
const api_key_usage_store_js_1 = require("../api-key-usage-store.js");
const test_runner_service_js_1 = require("../services/test-runner-service.js");
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
        const result = await queue_manager_js_1.globalTestGeneratorQueue.enqueue(async () => {
            return generator.generate(dsl, {
                dryRun: !!dryRun,
                outPath
            });
        });
        if (!result.success) {
            await (0, activity_log_store_js_1.addLog)({
                userId: req.user.id,
                username: req.user.username,
                action: 'Generate Script Failed',
                details: 'Failed due to validation or generation errors'
            });
            if (req.apiKey || req.authMethod === 'api_key') {
                await (0, api_key_usage_store_js_1.recordApiKeyUsage)({
                    apiKeyId: req.apiKey?.id,
                    keyName: req.apiKey?.name,
                    userId: req.user.id,
                    endpoint: 'generate-script',
                    status: 'failed',
                    details: `Generation failed: ${(result.warnings || []).join('; ')}`
                });
            }
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
        if (req.apiKey || req.authMethod === 'api_key') {
            await (0, api_key_usage_store_js_1.recordApiKeyUsage)({
                apiKeyId: req.apiKey?.id,
                keyName: req.apiKey?.name,
                userId: req.user.id,
                endpoint: 'generate-script',
                status: 'generated',
                details: `Generated script for target URL: ${dsl.targetUrl}`
            });
        }
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
            if (req.apiKey || req.authMethod === 'api_key') {
                await (0, api_key_usage_store_js_1.recordApiKeyUsage)({
                    apiKeyId: req.apiKey?.id,
                    keyName: req.apiKey?.name,
                    userId: req.user.id,
                    endpoint: 'run-test',
                    status: 'failed',
                    details: `Code rejected by sanitizer: ${sanitizeResult.violations.join('; ')}`
                });
            }
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
            const execResult = await (0, test_runner_service_js_1.executePlaywrightTest)({
                code,
                mode,
                language,
                userId
            });
            await (0, activity_log_store_js_1.addLog)({
                userId: req.user.id,
                username: req.user.username,
                action: 'Run Test',
                details: `Ran script in ${mode} mode (Status: ${execResult.success ? 'Success' : 'Failed'}, Duration: ${execResult.durationMs}ms)`
            });
            if (req.apiKey || req.authMethod === 'api_key') {
                await (0, api_key_usage_store_js_1.recordApiKeyUsage)({
                    apiKeyId: req.apiKey?.id,
                    keyName: req.apiKey?.name,
                    userId: req.user.id,
                    endpoint: 'run-test',
                    status: execResult.success ? 'success' : 'failed',
                    details: `Execution ${execResult.success ? 'Passed' : 'Failed'} (${execResult.durationMs}ms)`
                });
            }
            if (historyId) {
                await (0, flow_history_store_js_1.updateHistory)(historyId, {
                    status: execResult.success ? 'SUCCESS' : 'FAILED',
                    durationMs: execResult.durationMs,
                    runLogs: execResult.logs.trim(),
                    ...(execResult.videoStoragePath ? { videoUrl: execResult.videoStoragePath } : {})
                });
            }
            return execResult;
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
