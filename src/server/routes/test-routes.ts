import { Router, Response } from 'express';
import { authenticateJWT, requireApprovedUser } from '../auth-middleware.js';
import type { AuthenticatedRequest } from '../auth-middleware.js';
import { addLog } from '../activity-log-store.js';
import { sanitizeCode } from '../../security/code-sanitizer.js';
import { globalTestRunnerQueue, globalTestGeneratorQueue } from '../queue-manager.js';
import { addHistory, updateHistory } from '../flow-history-store.js';
import { getFolderById } from '../folder-store.js';
import { getSuiteById } from '../suite-store.js';
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
    const { dsl, dryRun, outPath, suiteId } = req.body;
    const folderId = req.body.projectId || req.body.folderId;

    if (!dsl) {
      res.status(400).json({
        success: false,
        error: 'Missing required field: dsl'
      });
      return;
    }

    // Projects and Suites are mandatory: a scenario must be generated into a suite within a project the user owns.
    if (!folderId || typeof folderId !== 'string') {
      res.status(400).json({
        success: false,
        error: 'Please select or create a project before generating a script.'
      });
      return;
    }
    const folder = await getFolderById(folderId);
    if (!folder || (folder.userId !== req.user!.id && req.user!.role !== 'admin')) {
      res.status(400).json({
        success: false,
        error: 'Invalid project. Select one of your own projects.'
      });
      return;
    }

    if (!suiteId || typeof suiteId !== 'string') {
      res.status(400).json({
        success: false,
        error: 'Please select or create a suite before generating a script.'
      });
      return;
    }
    const suite = await getSuiteById(suiteId);
    if (!suite || suite.projectId !== folder.id) {
      res.status(400).json({
        success: false,
        error: 'Invalid suite. Select a suite within the chosen project.'
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
      folderId: folder.id,
      suiteId: suite.id,
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
    const { code, mode = 'headless', language = 'typescript', saveAsNewHistory, testSuite, targetUrl, rawDsl, resolvedSteps, suiteId } = req.body;
    const folderId = req.body.projectId || req.body.folderId;
    let { historyId } = req.body;
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

    // Repeated work: when a scenario is re-run from Flow History, save it as a
    // NEW history record instead of overwriting the loaded one.
    if (saveAsNewHistory) {
      // Preserve the original scenario's project/suite when it belongs to this user.
      let keepFolderId: string | undefined;
      let keepSuiteId: string | undefined;
      if (folderId && typeof folderId === 'string') {
        const folder = await getFolderById(folderId);
        if (folder && (folder.userId === userId || req.user!.role === 'admin')) {
          keepFolderId = folder.id;
        }
      }
      if (suiteId && typeof suiteId === 'string') {
        const suite = await getSuiteById(suiteId);
        if (suite && (!keepFolderId || suite.projectId === keepFolderId)) {
          keepSuiteId = suite.id;
        }
      }
      const newRecord = await addHistory({
        userId: req.user!.id,
        username: req.user!.username,
        folderId: keepFolderId,
        suiteId: keepSuiteId,
        testSuite: (typeof testSuite === 'string' && testSuite) || 'Automated Test Suite',
        targetUrl: (typeof targetUrl === 'string' && targetUrl) || (rawDsl && rawDsl.targetUrl) || '',
        status: 'RUNNING',
        generatedCode: code,
        resolvedSteps: Array.isArray(resolvedSteps) ? resolvedSteps : [],
        rawDsl: rawDsl || undefined
      });
      historyId = newRecord.id;
    } else if (historyId) {
      // Persist the exact code being run so history stays consistent with edits
      // made in the editable code box before running (Option B).
      await updateHistory(historyId, { status: 'RUNNING', generatedCode: code });
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

    // Expose the history record id so the client can adopt a newly-created
    // record (repeated-run case) for subsequent runs.
    res.json({ ...runResult, historyId });
  } catch (err: unknown) {
    const error = err as Error;
    res.status(500).json({
      success: false,
      error: error.message || 'Internal Server Error'
    });
  }
});
