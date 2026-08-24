import express, { Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';
import { TestScriptGenerator } from '../index.js';
import { DOMExtractor } from '../crawler/domExtractor.js';

const execAsync = promisify(exec);

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());

// Serve static files from public directory
app.use(express.static(path.join(process.cwd(), 'public')));
app.use(express.static(path.join(process.cwd(), 'dist', 'public')));

const generator = new TestScriptGenerator();
const extractor = new DOMExtractor();

/**
 * Root Route: Serve Interactive HTML Web UI
 */
app.get('/', (req: Request, res: Response) => {
  let indexPath = path.join(process.cwd(), 'public', 'index.html');
  res.sendFile(indexPath);
});

/**
 * POST /api/v1/generate-script
 * Generate test script from JSON DSL payload
 */
app.post('/api/v1/generate-script', async (req: Request, res: Response) => {
  try {
    const { dsl, dryRun, outPath } = req.body;

    if (!dsl) {
      return res.status(400).json({
        success: false,
        error: 'Missing required field: dsl'
      });
    }

    const result = await generator.generate(dsl, {
      dryRun: !!dryRun,
      outPath
    });

    if (!result.success) {
      return res.status(422).json({
        success: false,
        errors: result.warnings
      });
    }

    return res.json({
      success: true,
      code: result.code,
      resolvedSteps: result.resolvedSteps,
      warnings: result.warnings,
      logs: result.logs,
      dryRunPassed: result.dryRunPassed,
      dryRunError: result.dryRunError
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: err.message || 'Internal Server Error'
    });
  }
});

/**
 * POST /api/v1/inspect-dom
 * Extract interactive candidate DOM elements from target URL
 */
app.post('/api/v1/inspect-dom', async (req: Request, res: Response) => {
  try {
    const { url, viewport } = req.body;

    if (!url) {
      return res.status(400).json({
        success: false,
        error: 'Missing required field: url'
      });
    }

    const candidates = await extractor.extractCandidates(url, { viewport });

    return res.json({
      success: true,
      url,
      candidateCount: candidates.length,
      candidates
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: err.message || 'Internal Server Error'
    });
  }
});

/**
 * Helper to recursively search for generated .webm video files
 */
function findVideoFile(dir: string): string | null {
  if (!fs.existsSync(dir)) return null;
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      const res = findVideoFile(fullPath);
      if (res) return res;
    } else if (file.endsWith('.webm')) {
      return fullPath;
    }
  }
  return null;
}

/**
 * POST /api/v1/run-test
 * Directly execute generated Playwright test code (Headless or Headed) with Video Recording
 */
app.post('/api/v1/run-test', async (req: Request, res: Response) => {
  try {
    const { code, mode = 'headless', language = 'typescript' } = req.body;

    if (!code || typeof code !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Missing required field: code'
      });
    }

    const startTime = Date.now();
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'playwright-ui-run-'));
    const fileExt = language === 'javascript' ? '.spec.js' : '.spec.ts';
    const testFilePath = path.join(tempDir, `manual_run${fileExt}`);
    const configFilePath = path.join(tempDir, 'playwright.config.ts');

    const isHeaded = mode === 'headed';

    const playwrightConfig = `
import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: '${tempDir.replace(/\\/g, '/')}',
  outputDir: '${tempDir.replace(/\\/g, '/')}/results',
  timeout: 60000,
  use: {
    headless: ${!isHeaded},
    video: '${isHeaded ? 'on' : 'off'}',
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
          ...process.env,
          NODE_PATH: path.join(process.cwd(), 'node_modules')
        }
      });
      logs = stdout || stderr || '[PASS] Test execution completed successfully.';
      success = true;
    } catch (err: any) {
      logs = (err.stdout || '') + '\n' + (err.stderr || '') + '\n' + (err.message || '');
      success = false;
    }

    // Check for video recording artifact if headed or recorded
    try {
      const foundVideo = findVideoFile(tempDir);
      if (foundVideo) {
        const videosDir = path.join(process.cwd(), 'public', 'videos');
        if (!fs.existsSync(videosDir)) {
          fs.mkdirSync(videosDir, { recursive: true });
        }
        const videoName = `run_${Date.now()}.webm`;
        const destPath = path.join(videosDir, videoName);
        fs.copyFileSync(foundVideo, destPath);
        videoUrl = `/videos/${videoName}`;
      }
    } catch (videoErr) {
      console.warn('Video artifact extraction warning:', videoErr);
    } finally {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {}
    }

    const durationMs = Date.now() - startTime;
    return res.json({
      success,
      logs: logs.trim(),
      videoUrl,
      durationMs
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: err.message || 'Internal Server Error'
    });
  }
});

app.get('/health', (req: Request, res: Response) => {
  res.json({ status: 'OK', message: 'Test Generator API Service active' });
});

app.listen(port, () => {
  console.log(`Test Generator REST API & Web UI running at http://localhost:${port}`);
});
