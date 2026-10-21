/*
 * tester-lab - Non-LLM Automated Test Script Generator
 * Copyright (c) 2026 Imam Fahrudin
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU Affero General Public License v3.0.
 * See the LICENSE file in the project root for full license text.
 */
/**
 * Health status computation for the /healthz endpoint.
 *
 * An external uptime monitor (e.g. Monita) needs more than "the page loads": it
 * should know when a critical dependency is down even while the HTTP server is
 * still up. /healthz checks those dependencies (database, queue) and returns
 * 200 when all pass or 503 when any fails, so the monitor opens an incident on
 * a real problem, not just on a crash.
 *
 * computeHealthStatus() is the PURE decision — given per-check results, it
 * returns the overall status, the HTTP code, and which checks failed. The route
 * performs the actual I/O and feeds results here. Never throws.
 */

export interface HealthCheck {
  ok?: boolean;
  error?: string;
  [key: string]: unknown;
}

export interface HealthChecks {
  [name: string]: HealthCheck;
}

export interface HealthResult {
  status: 'ok' | 'error';
  httpStatus: 200 | 503;
  failing: string[];
}

/**
 * Compute overall health from per-component checks. A check counts as failing
 * when its `ok` is not strictly true (missing/false/undefined → failing). Pure.
 */
export function computeHealthStatus(checks: HealthChecks | null | undefined): HealthResult {
  const c = checks && typeof checks === 'object' ? checks : {};
  const failing: string[] = [];
  for (const name of Object.keys(c)) {
    const check = c[name];
    if (!check || check.ok !== true) failing.push(name);
  }
  const healthy = failing.length === 0;
  return {
    status: healthy ? 'ok' : 'error',
    httpStatus: healthy ? 200 : 503,
    failing
  };
}
