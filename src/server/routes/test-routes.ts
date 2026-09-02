import { Router, Response } from 'express';
import { authenticateJWT, requireApprovedUser } from '../auth-middleware.js';
import type { AuthenticatedRequest } from '../auth-middleware.js';
import { addLog } from '../activity-log-store.js';
import { sanitizeCode } from '../../security/code-sanitizer.js';
import { globalTestRunnerQueue, globalTestGeneratorQueue } from '../queue-manager.js';
import { addHistory, updateHistory } from '../flow-history-store.js';
import { TestScriptGenerator } from '../../index.js';
import { DOMExtractor } from '../../crawler/dom-extractor.js';
import { recordApiKeyUsage } from '../api-key-usage-store.js';
import { executePlaywrightTest } from '../services/test-runner-service.js';

export const testRoutes = Router();

const generator = new TestScriptGenerator();
const extractor = new DOMExtractor();

/**
 * POST /api/v1/generate-script
 * Generate test script from JSON DSL payload (Requires approved account)
 */
testRoutes.post('/generate-script', authenticateJWT, requireApprovedUser, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { dsl, dryRun, outPath } = req.body;

    if (!dsl) {
      res.status(400).json({
        success: false,
        error: 'Missing required field: dsl'
      });
      return;
    }

    const result = await globalTestGeneratorQueue.enqueue(async () => {
      return generator.generate(dsl, {
        dryRun: !!dryRun,
        outPath
      });
    });

    if (!result.success) {
      await addLog({
        userId: req.user!.id,
        username: req.user!.username,
        action: 'Generate Script Failed',
        details: 'Failed due to validation or generation errors'
      });
      if (req.apiKey || req.authMethod === 'api_key') {
        await recordApiKeyUsage({
          apiKeyId: req.apiKey?.id,
          keyName: req.apiKey?.name,
          userId: req.user!.id,
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

    await addLog({
      userId: req.user!.id,
      username: req.user!.username,
      action: 'Generate Script',
      details: `Generated script for target URL: ${dsl.targetUrl}`
    });

    if (req.apiKey || req.authMethod === 'api_key') {
      await recordApiKeyUsage({
        apiKeyId: req.apiKey?.id,
        keyName: req.apiKey?.name,
        userId: req.user!.id,
        endpoint: 'generate-script',
        status: 'generated',
        details: `Generated script for target URL: ${dsl.targetUrl}`
      });
    }

    const historyRecord = await addHistory({
      userId: req.user!.id,
      username: req.user!.username,
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
  } catch (err: unknown) {
    const error = err as Error;
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
testRoutes.post('/inspect-dom', authenticateJWT, requireApprovedUser, async (req: AuthenticatedRequest, res: Response) => {
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
  } catch (err: unknown) {
    const error = err as Error;
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
testRoutes.post('/run-test', authenticateJWT, requireApprovedUser, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { code, mode = 'headless', language = 'typescript', historyId } = req.body;
    const userId = req.user!.id;

    if (!code || typeof code !== 'string') {
      res.status(400).json({
        success: false,
        error: 'Missing required field: code'
      });
      return;
    }

    // Layer 2: Code Content Validation — block dangerous patterns
    const sanitizeResult = sanitizeCode(code);
    if (!sanitizeResult.safe) {
      await addLog({
        userId: req.user!.id,
        username: req.user!.username,
        action: 'Run Test Blocked',
        details: `Code rejected: ${sanitizeResult.violations.join('; ')}`
      });
      if (req.apiKey || req.authMethod === 'api_key') {
        await recordApiKeyUsage({
          apiKeyId: req.apiKey?.id,
          keyName: req.apiKey?.name,
          userId: req.user!.id,
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
      await updateHistory(historyId, { status: 'RUNNING' });
    }

    // Enqueue task into Concurrency Manager
    const runResult = await globalTestRunnerQueue.enqueue(async () => {
      const execResult = await executePlaywrightTest({
        code,
        mode,
        language,
        userId
      });

      await addLog({
        userId: req.user!.id,
        username: req.user!.username,
        action: 'Run Test',
        details: `Ran script in ${mode} mode (Status: ${execResult.success ? 'Success' : 'Failed'}, Duration: ${execResult.durationMs}ms)`
      });

      if (req.apiKey || req.authMethod === 'api_key') {
        await recordApiKeyUsage({
          apiKeyId: req.apiKey?.id,
          keyName: req.apiKey?.name,
          userId: req.user!.id,
          endpoint: 'run-test',
          status: execResult.success ? 'success' : 'failed',
          details: `Execution ${execResult.success ? 'Passed' : 'Failed'} (${execResult.durationMs}ms)`
        });
      }

      if (historyId) {
        await updateHistory(historyId, {
          status: execResult.success ? 'SUCCESS' : 'FAILED',
          durationMs: execResult.durationMs,
          runLogs: execResult.logs.trim(),
          ...(execResult.videoStoragePath ? { videoUrl: execResult.videoStoragePath } : {})
        });
      }

      return execResult;
    });

    res.json(runResult);
  } catch (err: unknown) {
    const error = err as Error;
    res.status(500).json({
      success: false,
      error: error.message || 'Internal Server Error'
    });
  }
});
