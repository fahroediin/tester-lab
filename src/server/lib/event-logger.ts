/*
 * tester-lab - Non-LLM Automated Test Script Generator
 * Copyright (c) 2026 Imam Fahrudin
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU Affero General Public License v3.0.
 * See the LICENSE file in the project root for full license text.
 */
/**
 * Structured event logger for POC observability.
 *
 * Writes one grep-able line per meaningful action to stdout (captured by PM2
 * into the server log file), with a stable `key=value` shape so operators can:
 *   - see all activity:   pm2 logs | grep '\[EVENT\]'
 *   - see only failures:  pm2 logs | grep 'result=error'
 *   - trace one user:     pm2 logs | grep 'user=qa_budi'
 *
 * Deliberately NOT written to Supabase: keeps the POC's database/egress quota
 * free (the costliest resource) while still giving full operational visibility
 * on the VM. formatEvent() is pure (no I/O) so it is unit-testable; logEvent()
 * is the thin stdout writer.
 */

export interface EventFields {
  /** What happened, snake_case (e.g. recorder_open, import, code_edit). */
  action?: string;
  /** Who did it (username), or 'anonymous' when unknown. */
  user?: string;
  /** Outcome: 'ok' (default) or 'error'. */
  result?: 'ok' | 'error';
  /** Any extra context (target url, format, step count, error message, ...). */
  [key: string]: string | number | boolean | undefined | null;
}

/** Collapse whitespace/newlines so a value never breaks the one-line format. */
function sanitizeValue(v: string | number | boolean): string {
  return String(v).replace(/\s+/g, ' ').trim();
}

/**
 * Build a single structured log line. Pure; never throws.
 * Shape: `[EVENT] <iso> action=<a> user=<u> result=<r> <extra k=v ...>`
 */
export function formatEvent(fields: EventFields): string {
  const f = fields || {};
  const ts = new Date().toISOString();
  const action = sanitizeValue(f.action || 'unknown');
  const user = sanitizeValue(f.user || 'anonymous');
  const result = sanitizeValue(f.result || 'ok');

  const reserved = new Set(['action', 'user', 'result']);
  const extras: string[] = [];
  for (const key of Object.keys(f)) {
    if (reserved.has(key)) continue;
    const val = f[key];
    if (val === undefined || val === null) continue; // skip empty, no "key=undefined"
    extras.push(`${key}=${sanitizeValue(val)}`);
  }

  const base = `[EVENT] ${ts} action=${action} user=${user} result=${result}`;
  return extras.length ? `${base} ${extras.join(' ')}` : base;
}

/** Write a structured event to stdout (-> PM2 log). Never throws. */
export function logEvent(fields: EventFields): void {
  try {
    console.log(formatEvent(fields));
  } catch {
    /* logging must never break a request */
  }
}
