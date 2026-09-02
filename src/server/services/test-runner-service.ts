import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { getSanitizedEnv, findVideoFile } from '../../security/sanitized-env.js';
import { signVideoUrl } from '../lib/storage-url.js';
import { supabase } from '../supabase-client.js';

const execFileAsync = promisify(execFile);

export interface ExecuteTestOptions {
  code: string;
  mode?: 'headless' | 'headed';
  language?: 'typescript' | 'javascript';
  userId: string;
}

export interface ExecuteTestResult {
  success: boolean;
  logs: string;
  /** Short-lived signed URL for immediate playback in the client. */
  videoUrl?: string;
  /** Durable bucket object path to persist in history (re-signed on read). */
  videoStoragePath?: string;
  durationMs: number;
}

/**
 * Executes a Playwright test script in a temporary isolated environment,
 * captures execution logs, and uploads any recorded video artifact to Supabase Storage.
 */
export async function executePlaywrightTest(options: ExecuteTestOptions): Promise<ExecuteTestResult> {
  const { code, mode = 'headless', language = 'typescript', userId } = options;
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

  const npxCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  const args = ['playwright', 'test', testFilePath, `--config=${configFilePath}`];
  if (isHeaded) {
    args.push('--headed');
  }

  let execCommand = npxCmd;
  let execArgs = args;
  if (isHeaded && process.platform === 'linux' && !process.env.DISPLAY) {
    execCommand = 'xvfb-run';
    execArgs = ['-a', npxCmd, ...args];
  }

  let logs = '';
  let success = false;
  let videoUrl: string | undefined;
  let videoStoragePath: string | undefined;

  try {
    const { stdout, stderr } = await execFileAsync(execCommand, execArgs, {
      cwd: process.cwd(),
      shell: process.platform === 'win32',
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

  // Check for video recording artifact and upload to Supabase Storage
  try {
    const foundVideo = findVideoFile(tempDir);
    if (foundVideo) {
      const sanitizedUserId = userId.replace(/[^a-zA-Z0-9_-]/g, '');
      const videoName = `run_${Date.now()}.webm`;
      const storagePath = `${sanitizedUserId}/${videoName}`;
      const fileBuffer = fs.readFileSync(foundVideo);

      const { error: uploadError } = await supabase.storage
        .from('test-videos')
        .upload(storagePath, fileBuffer, {
          contentType: 'video/webm',
          upsert: true
        });

      if (uploadError) {
        console.error('Failed to upload video recording to Supabase Storage:', uploadError);
      } else {
        // Persist the durable object path; hand the client a short-lived signed URL.
        videoStoragePath = storagePath;
        videoUrl = (await signVideoUrl(storagePath)) || undefined;
      }
    }
  } catch (videoErr: unknown) {
    console.warn('Video artifact extraction warning:', (videoErr as Error).message || videoErr);
  } finally {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  }

  const durationMs = Date.now() - startTime;

  return {
    success,
    logs: logs.trim(),
    videoUrl,
    videoStoragePath,
    durationMs
  };
}
