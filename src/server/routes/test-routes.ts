import fs from 'fs';
import os from 'os';
import path from 'path';
import { Router, Request, Response } from 'express';
import { exec } from 'child_process';
import { promisify } from 'util';
import { authenticateJWT, requireApprovedUser } from '../auth-middleware.js';
import type { AuthenticatedRequest } from '../auth-middleware.js';
import { addLog } from '../activity-log-store.js';
import { sanitizeCode } from '../code-sanitizer.js';
import { globalTestRunnerQueue } from '../queue-manager.js';
import { getSanitizedEnv, findVideoFile } from '../lib/sanitized-env.js';
import { addHistory, updateHistory } from '../flow-history-store.js';
import { TestScriptGenerator } from '../../index.js';
import { DOMExtractor } from '../../crawler/dom-extractor.js';

const execAsync = promisify(exec);
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

    const result = await generator.generate(dsl, {
      dryRun: !!dryRun,
      outPath
    });

    if (!result.success) {
      addLog({
        userId: req.user!.id,
        username: req.user!.username,
        action: 'Generate Script Failed',
        details: 'Failed due to validation or generation errors'
      });
      res.status(422).json({
        success: false,
        errors: result.warnings
      });
      return;
    }

    addLog({
      userId: req.user!.id,
      username: req.user!.username,
      action: 'Generate Script',
      details: `Generated script for target URL: ${dsl.targetUrl}`
    });

    const historyRecord = addHistory({
      userId: req.user!.id,
      username: req.user!.username,
      testSuite: dsl.testSuite || 'Unknown Test Suite',
      targetUrl: dsl.targetUrl || '',
      status: 'GENERATED',
      generatedCode: result.code,
      resolvedSteps: result.resolvedSteps
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
      addLog({
        userId: req.user!.id,
        username: req.user!.username,
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
      updateHistory(historyId, { status: 'RUNNING' });
    }

    // Enqueue task into Concurrency Manager
    const runResult = await globalTestRunnerQueue.enqueue(async () => {
      const startTime = Date.now();
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'playwright-ui-run-'));
      const fileExt = language === 'javascript' ? '.spec.js' : '.spec.ts';
      const testFilePath = path.join(tempDir, `manual_run${fileExt}`);
      const configFilePath = path.join(tempDir, 'playwright.config.ts');

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

      fs.writeFileSync(testFilePath, code, 'utf-8');
      fs.writeFileSync(configFilePath, playwrightConfig, 'utf-8');

      let command = `npx playwright test "${testFilePath.replace(/\\/g, '/')}" --config="${configFilePath.replace(/\\/g, '/')}"`;
      if (isHeaded) {
        command += ' --headed';
        if (process.platform === 'linux' && !process.env.DISPLAY) {
          command = `xvfb-run -a ${command}`;
        }
      }

      let logs = '';
      let success = false;
      let videoUrl: string | undefined;

      try {
        const { stdout, stderr } = await execAsync(command, {
          cwd: process.cwd(),
          env: {
            ...getSanitizedEnv(),
            NODE_PATH: path.join(process.cwd(), 'node_modules')
          }
        });
        logs = stdout || stderr || '[PASS] Test execution completed successfully.';
        success = true;
      } catch (err: unknown) {
        const error = err as { stdout?: string; stderr?: string; message?: string };
        logs = (error.stdout || '') + '\n' + (error.stderr || '') + '\n' + (error.message || '');
        success = false;
      }

      // Check for video recording artifact if headed or recorded
      try {
        const foundVideo = findVideoFile(tempDir);
        if (foundVideo) {
          const sanitizedUserId = userId.replace(/[^a-zA-Z0-9_-]/g, '');
          const videosDir = path.join(process.cwd(), 'public', 'videos', sanitizedUserId);
          if (!fs.existsSync(videosDir)) {
            fs.mkdirSync(videosDir, { recursive: true });
          }
          const videoName = `run_${Date.now()}.webm`;
          const destPath = path.join(videosDir, videoName);
          fs.copyFileSync(foundVideo, destPath);
          videoUrl = `/videos/${sanitizedUserId}/${videoName}`;
        }
      } catch (videoErr) {
        console.warn('Video artifact extraction warning:', videoErr);
      } finally {
        try {
          fs.rmSync(tempDir, { recursive: true, force: true });
        } catch {}
      }

      const durationMs = Date.now() - startTime;
      
      addLog({
        userId: req.user!.id,
        username: req.user!.username,
        action: 'Run Test',
        details: `Ran script in ${mode} mode (Status: ${success ? 'Success' : 'Failed'}, Duration: ${durationMs}ms)`
      });

      if (historyId) {
        updateHistory(historyId, {
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
  } catch (err: unknown) {
    const error = err as Error;
    res.status(500).json({
      success: false,
      error: error.message || 'Internal Server Error'
    });
  }
});
