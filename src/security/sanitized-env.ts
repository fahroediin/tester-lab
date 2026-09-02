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
