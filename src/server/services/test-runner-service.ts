import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { getSanitizedEnv, findAllVideoFiles, findScreenshotFile, collectStepScreenshots } from '../../security/sanitized-env.js';
import { signVideoUrl } from '../lib/storage-url.js';
import { mergeVideos } from './video-merge.js';
import { supabase } from '../supabase-client.js';

const execFileAsync = promisify(execFile);

export interface ExecuteTestOptions {
  code: string;
  mode?: 'headless' | 'headed';
  language?: 'typescript' | 'javascript';
  userId: string;
  /**
   * Per-action pacing in ms. When set, overrides the mode-derived default.
   * Run Suite runs headless (no slowMo by default), which removes the timing
   * buffer that headed runs get and exposes async-load races between steps;
   * passing a small slowMo restores parity with the Scenario Builder.
   */
  slowMoMs?: number;
}

/**
 * Decide the Playwright slowMo (ms) for a run. An explicit, valid slowMoMs
 * wins; otherwise fall back to the legacy mode-derived value (headed 1000,
 * else 0). Negative or non-numeric slowMoMs is ignored. Pure; never throws.
 */
export function resolveSlowMo(opts: { mode?: string; slowMoMs?: unknown }): number {
  const raw = opts ? opts.slowMoMs : undefined;
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return raw < 0 ? 0 : raw;
  }
  return opts && opts.mode === 'headed' ? 1000 : 0;
}

export interface ExecuteTestResult {
  success: boolean;
  logs: string;
  /** Short-lived signed URL for immediate playback in the client (first tab). */
  videoUrl?: string;
  /** Durable bucket object path to persist in history (re-signed on read). */
  videoStoragePath?: string;
  /**
   * One signed URL + storage path per recorded tab, in order. A run that opens a
   * new tab records several; this carries all so the report shows the whole flow.
   */
  videos?: { url: string; storagePath: string }[];
  /**
   * True when videoUrl points at a single recording that already merges every
   * tab (ffmpeg). The client then shows one player instead of one-per-tab; the
   * per-tab entries in `videos` remain only as a fallback.
   */
  videoMerged?: boolean;
  /** Short-lived signed URL of the failure screenshot, for immediate display. */
  screenshotUrl?: string;
  /** Durable bucket object path of the failure screenshot (re-signed on read). */
  screenshotStoragePath?: string;
  /** Per-step evidence screenshots (US-19), signed URLs keyed by step number. */
  stepShots?: { step: number; url: string; storagePath: string }[];
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
  const testFileName = `manual_run${fileExt}`;
  const testFilePath = path.join(tempDir, testFileName);
  const configFilePath = path.join(tempDir, 'playwright.config.ts');

  const isHeaded = mode === 'headed';
  const slowMo = resolveSlowMo(options);
  const manualTimeout = process.env.PLAYWRIGHT_TIMEOUT ? parseInt(process.env.PLAYWRIGHT_TIMEOUT, 10) : 120000;

  // testDir/outputDir are RELATIVE and the runner is launched with cwd=tempDir.
  // Playwright 1.62+ fails to discover tests when testDir is an absolute path
  // like this temp dir ("No tests found"); a relative './' from the temp dir
  // works. See the run-from-tempDir cwd below.
  const playwrightConfig = `
import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: '.',
  // Only the generated spec is a test; without this Playwright also tries to
  // load playwright.config.ts as a test file ("test() called here").
  testMatch: '${testFileName}',
  outputDir: './results',
  timeout: ${manualTimeout},
  use: {
    headless: ${!isHeaded},
    video: 'on',
    screenshot: 'only-on-failure',
    launchOptions: {
      slowMo: ${slowMo}
    },
    viewport: { width: 1280, height: 720 },
  },
});
`;

  fs.writeFileSync(testFilePath, code, 'utf-8');
  fs.writeFileSync(configFilePath, playwrightConfig, 'utf-8');

  // Invoke the PROJECT's Playwright binary directly, not `npx`. With cwd set to
  // the temp dir (needed so the relative testDir './' resolves), `npx playwright`
  // would look for Playwright under the temp dir and may fetch a DIFFERENT
  // version, causing "Playwright Test did not expect test() to be called here"
  // (two @playwright/test versions). An absolute path to the installed binary
  // pins the project's version.
  const pwBin = path.join(
    process.cwd(),
    'node_modules',
    '.bin',
    process.platform === 'win32' ? 'playwright.cmd' : 'playwright'
  );
  // Pass the test file by its BASENAME (not an absolute path). Playwright treats
  // a positional arg as a regex over test paths; an absolute Windows path
  // (backslashes, drive colon) matches nothing -> "No tests found". A relative
  // basename, resolved from cwd=tempDir, matches correctly.
  const args = ['test', testFileName, `--config=playwright.config.ts`];
  if (isHeaded) {
    args.push('--headed');
  }

  let execCommand = pwBin;
  let execArgs = args;
  if (isHeaded && process.platform === 'linux' && !process.env.DISPLAY) {
    execCommand = 'xvfb-run';
    execArgs = ['-a', pwBin, ...args];
  }

  let logs = '';
  let success = false;
  let videoUrl: string | undefined;
  let videoStoragePath: string | undefined;
  let videoMerged = false;
  let screenshotUrl: string | undefined;
  let screenshotStoragePath: string | undefined;
  let stepShots: { step: number; url: string; storagePath: string }[] | undefined;

  try {
    const { stdout, stderr } = await execFileAsync(execCommand, execArgs, {
      // Run FROM the temp dir so the relative testDir './' resolves to it.
      cwd: tempDir,
      shell: process.platform === 'win32',
      env: {
        ...getSanitizedEnv(),
        // NODE_PATH stays absolute so @playwright/test resolves from the
        // project's node_modules even though cwd is the temp dir.
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

  // Check for video recordings and upload to Supabase Storage. Playwright records
  // one .webm per tab; a run that opens a new tab has several. Merge them into one
  // recording of the whole flow when possible (ffmpeg), and keep the per-tab
  // recordings as a fallback for viewers/servers where merging is unavailable.
  const videos: { url: string; storagePath: string }[] = [];
  try {
    // Videos come back in tab-creation order (first tab first): Playwright names
    // them video.webm, video-1.webm, ... and findAllVideoFiles sorts by that
    // name-encoded index. This is reliable where timestamps are not.
    const found = findAllVideoFiles(tempDir);
    const sanitizedUserId = userId.replace(/[^a-zA-Z0-9_-]/g, '');

    const uploadWebm = async (localPath: string, suffix: string): Promise<{ url: string; storagePath: string } | null> => {
      const storagePath = `${sanitizedUserId}/run_${Date.now()}_${suffix}.webm`;
      const fileBuffer = fs.readFileSync(localPath);
      const { error: uploadError } = await supabase.storage
        .from('test-videos')
        .upload(storagePath, fileBuffer, { contentType: 'video/webm', upsert: true });
      if (uploadError) {
        console.error('Failed to upload video recording to Supabase Storage:', uploadError);
        return null;
      }
      const url = (await signVideoUrl(storagePath)) || undefined;
      return url ? { url, storagePath } : null;
    };

    for (let i = 0; i < found.length; i++) {
      const v = await uploadWebm(found[i] as string, String(i));
      if (v) videos.push(v);
    }

    // A single combined recording plays the whole flow. On failure, the per-tab
    // recordings above remain the evidence.
    const merged = found.length > 1 ? await mergeVideos(found, tempDir) : null;
    if (merged) {
      const mv = await uploadWebm(merged, 'merged');
      if (mv) { videoStoragePath = mv.storagePath; videoUrl = mv.url; videoMerged = true; }
    }
    // Backward compat / fallback: point the single-video fields at the first tab
    // when no merged recording is available.
    if (!videoUrl && videos[0]) {
      videoStoragePath = videos[0].storagePath;
      videoUrl = videos[0].url;
    }
  } catch (videoErr: unknown) {
    console.warn('Video artifact extraction warning:', (videoErr as Error).message || videoErr);
  }

  // Upload per-step evidence screenshots (US-19): step_<N>.png in step order.
  // Same bucket as video so they re-sign identically. Best-effort per file.
  try {
    const sanitizedUserId = userId.replace(/[^a-zA-Z0-9_-]/g, '');
    const runStamp = Date.now();
    const shots = collectStepScreenshots(tempDir);
    const uploaded: { step: number; url: string; storagePath: string }[] = [];
    for (const shot of shots) {
      const storagePath = `${sanitizedUserId}/run_${runStamp}_step_${shot.step}.png`;
      const fileBuffer = fs.readFileSync(shot.path);
      const { error: upErr } = await supabase.storage
        .from('test-videos')
        .upload(storagePath, fileBuffer, { contentType: 'image/png', upsert: true });
      if (upErr) {
        console.error(`Failed to upload step ${shot.step} screenshot:`, upErr);
        continue;
      }
      const url = (await signVideoUrl(storagePath)) || undefined;
      if (url) uploaded.push({ step: shot.step, url, storagePath });
    }
    if (uploaded.length > 0) {
      stepShots = uploaded;
      // Backward-compat single url: the last step's shot (the failing step on a
      // failure, or the final state on success). Falls back below if absent.
      const last = uploaded[uploaded.length - 1];
      if (last) { screenshotUrl = last.url; screenshotStoragePath = last.storagePath; }
    }

    // Fallback for scenarios generated before per-step evidence existed, or with
    // no step shots: use Playwright's on-failure / success snapshot (one png).
    if (!screenshotUrl) {
      const foundShot = findScreenshotFile(tempDir);
      if (foundShot) {
        const storagePath = `${sanitizedUserId}/run_${runStamp}.png`;
        const fileBuffer = fs.readFileSync(foundShot);
        const { error: upErr } = await supabase.storage
          .from('test-videos')
          .upload(storagePath, fileBuffer, { contentType: 'image/png', upsert: true });
        if (upErr) {
          console.error('Failed to upload failure screenshot to Supabase Storage:', upErr);
        } else {
          screenshotStoragePath = storagePath;
          screenshotUrl = (await signVideoUrl(storagePath)) || undefined;
        }
      }
    }
  } catch (shotErr: unknown) {
    console.warn('Screenshot artifact extraction warning:', (shotErr as Error).message || shotErr);
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
    videos: videos.length ? videos : undefined,
    videoMerged,
    screenshotUrl,
    screenshotStoragePath,
    stepShots,
    durationMs
  };
}
