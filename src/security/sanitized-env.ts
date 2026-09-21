/*
 * tester-lab - Non-LLM Automated Test Script Generator
 * Copyright (c) 2026 Imam Fahrudin
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU Affero General Public License v3.0.
 * See the LICENSE file in the project root for full license text.
 */
import fs from 'fs';
import path from 'path';

/**
 * Build a sanitized environment object for child processes.
 * Only includes variables required for Playwright to function.
 * ALL secrets (JWT_SECRET, ADMIN_PASSWORD, etc.) are stripped.
 */
export function getSanitizedEnv(): Record<string, string> {
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

/**
 * Helper to recursively search for generated .webm video files
 */
export function findVideoFile(dir: string): string | null {
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
 * The tab-creation index a Playwright video file name encodes. After a run,
 * Playwright names the first tab's recording `video.webm` and each later tab's
 * `video-1.webm`, `video-2.webm`, ... in creation order. So the numeric suffix
 * IS the tab order: `video.webm` is tab 0, `video-<n>.webm` is tab n. This is
 * reliable where file timestamps are not (they can tie or invert on Windows) and
 * where the in-run artifact path is not (Playwright renames it after the run).
 * A name that does not match returns a large index so it sorts last, stably.
 */
export function videoTabIndex(filePath: string): number {
  const base = path.basename(filePath);
  if (base === 'video.webm') return 0;
  const m = /^video-(\d+)\.webm$/.exec(base);
  if (m) return parseInt(m[1] as string, 10);
  return Number.MAX_SAFE_INTEGER;
}

/**
 * Collect every .webm in the run's output tree, in tab-creation order (first tab
 * first). Playwright records one video per page, so a run that opens a new tab
 * produces several; returning them in flow order lets the report show the whole
 * flow across tabs. Ordering is by the video's name-encoded tab index (see
 * videoTabIndex) rather than file timestamps, which are unreliable on Windows.
 * Never throws.
 */
export function findAllVideoFiles(dir: string | null | undefined): string[] {
  const found: string[] = [];
  const walk = (d: string): void => {
    if (!d || !fs.existsSync(d)) return;
    let entries: string[];
    try { entries = fs.readdirSync(d); } catch { return; }
    for (const file of entries) {
      const full = path.join(d, file);
      let stat;
      try { stat = fs.statSync(full); } catch { continue; }
      if (stat.isDirectory()) walk(full);
      else if (file.endsWith('.webm')) found.push(full);
    }
  };
  walk(dir || '');
  found.sort((a, b) => videoTabIndex(a) - videoTabIndex(b));
  return found;
}

/**
 * Recursively collect per-step evidence screenshots (US-19). The generated code
 * writes one `step_<N>.png` per step into the run's output dir. Returns them
 * sorted by step number (numeric, so step_10 sorts after step_2), each with its
 * absolute path. Ignores non-step pngs (e.g. Playwright's own test-failed-*.png)
 * and any other files. Never throws.
 */
export function collectStepScreenshots(dir: string | null | undefined): { step: number; path: string }[] {
  const out: { step: number; path: string }[] = [];
  const walk = (d: string): void => {
    if (!d || !fs.existsSync(d)) return;
    for (const file of fs.readdirSync(d)) {
      const full = path.join(d, file);
      let isDir = false;
      try { isDir = fs.statSync(full).isDirectory(); } catch { continue; }
      if (isDir) {
        walk(full);
      } else {
        const m = /^step_(\d+)\.png$/.exec(file);
        if (m) out.push({ step: parseInt(m[1] as string, 10), path: full });
      }
    }
  };
  if (typeof dir === 'string') walk(dir);
  out.sort((a, b) => a.step - b.step);
  return out;
}

/**
 * Helper to recursively search for a generated .png screenshot file (Playwright
 * writes one on failure into the run's results dir). Mirrors findVideoFile.
 */
export function findScreenshotFile(dir: string): string | null {
  if (!fs.existsSync(dir)) return null;
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      const res = findScreenshotFile(fullPath);
      if (res) return res;
    } else if (file.endsWith('.png')) {
      return fullPath;
    }
  }
  return null;
}
