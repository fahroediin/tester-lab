/*
 * tester-lab - Merge per-tab run recordings into one video.
 * A run that opens a new tab records one .webm per tab. This concatenates them
 * (in order) into a single recording so the evidence plays the whole flow.
 * Uses ffmpeg when available; returns null on any failure so the caller can fall
 * back to showing the separate recordings.
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

/** ffmpeg's concat demuxer reads a list file of `file '<path>'` lines. */
export function buildConcatListContent(paths: string[]): string {
  return paths
    .map((p) => `file '${p.replace(/\\/g, '/').replace(/'/g, "'\\''")}'`)
    .join('\n');
}

/**
 * Concatenate `videoPaths` (already in play order) into one .webm in `outDir`.
 * Returns the merged file path, or null when there is nothing to merge (0 or 1
 * input) or ffmpeg is unavailable/fails — the caller then keeps the separate
 * recordings.
 */
export async function mergeVideos(videoPaths: string[], outDir: string): Promise<string | null> {
  if (!Array.isArray(videoPaths) || videoPaths.length < 2) return null;

  const listPath = path.join(outDir, `concat_${Date.now()}.txt`);
  const outPath = path.join(outDir, `merged_${Date.now()}.webm`);
  try {
    fs.writeFileSync(listPath, buildConcatListContent(videoPaths), 'utf-8');
  } catch {
    return null;
  }

  try {
    // Stream-copy first (fast, no re-encode) since Playwright recordings share a
    // codec and size. -y overwrites, -safe 0 allows absolute paths in the list.
    await execFileAsync('ffmpeg', ['-y', '-f', 'concat', '-safe', '0', '-i', listPath, '-c', 'copy', outPath], {
      timeout: 60000
    });
  } catch {
    // Copy can reject if inputs are not perfectly uniform; re-encode as a fallback.
    try {
      await execFileAsync('ffmpeg', ['-y', '-f', 'concat', '-safe', '0', '-i', listPath, '-c:v', 'libvpx', '-b:v', '1M', outPath], {
        timeout: 120000
      });
    } catch {
      try { fs.unlinkSync(listPath); } catch { /* best-effort */ }
      return null;
    }
  }

  try { fs.unlinkSync(listPath); } catch { /* best-effort */ }
  return fs.existsSync(outPath) ? outPath : null;
}
