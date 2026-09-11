/**
 * Run Suite service (POC).
 *
 * Runs every scenario in a suite sequentially in one batch (Model B: keep going
 * after a failure). Job status is COMPUTED from per-scenario results rather than
 * stored as a Run entity — see docs/superpowers/specs/2026-09-12-run-suite-poc-design.md.
 *
 * Cancel (AC-15.15-18) and real-time status are deliberately out of POC scope.
 */

import { randomUUID } from 'crypto';
import { getRunnableScenariosBySuite } from '../flow-history-store.js';
import { executePlaywrightTest } from './test-runner-service.js';
import { checkRunnerSupport } from '../../security/runner-guard.js';

/** Per-scenario execution outcome within a suite run. */
export type ScenarioRunStatus = 'SUCCESS' | 'FAILED' | 'SKIPPED';

/** Aggregate status of a whole suite run. */
export type JobStatus = 'PASSED' | 'PARTIAL' | 'FAILED' | 'SKIPPED';

/**
 * Compute the aggregate job status from per-scenario results (AC-15.03/07/11).
 *
 * SKIPPED scenarios (no runnable script, AC-15.09/10) do not decide the job
 * status; only scenarios that actually ran count:
 * - all ran SUCCESS        -> PASSED
 * - mix of SUCCESS/FAILED  -> PARTIAL
 * - all ran FAILED         -> FAILED
 * - nothing ran (empty, or all SKIPPED) -> SKIPPED
 */
export function computeJobStatus(results: ScenarioRunStatus[]): JobStatus {
  const ran = (results || []).filter((s) => s === 'SUCCESS' || s === 'FAILED');
  if (ran.length === 0) return 'SKIPPED';

  const anyFailed = ran.some((s) => s === 'FAILED');
  const anyPassed = ran.some((s) => s === 'SUCCESS');

  if (anyPassed && anyFailed) return 'PARTIAL';
  if (anyPassed) return 'PASSED';
  return 'FAILED';
}

/** Minimal shape of a scenario history record needed to run a suite. */
export interface SuiteScenario {
  id: string;
  testSuite: string;
  timestamp: string;
  generatedCode: string;
  language?: string;
  framework?: string;
}

/**
 * Collapse suite history records to one per scenario name (`testSuite`), keeping
 * the latest by timestamp. The POC has no unique Scenario entity, so a scenario
 * generated several times appears as several records; running the suite should
 * run each scenario once, at its most recent version.
 *
 * Result order follows the first appearance of each name so sequential
 * execution (Model B) is predictable.
 */
export function dedupeLatestByName<T extends { testSuite: string; timestamp: string }>(records: T[]): T[] {
  if (!Array.isArray(records)) return [];
  const latest = new Map<string, T>();
  const order: string[] = [];
  for (const r of records) {
    if (!r || typeof r.testSuite !== 'string') continue;
    const key = r.testSuite;
    const existing = latest.get(key);
    if (!existing) {
      order.push(key);
      latest.set(key, r);
    } else if (String(r.timestamp) > String(existing.timestamp)) {
      latest.set(key, r);
    }
  }
  return order.map((k) => latest.get(k) as T);
}

/**
 * Pull a concise, reliable error snippet out of raw Playwright logs for the
 * failure modal. Prefers the block starting at the first "Error:" line; falls
 * back to the tail of the log when no explicit marker is present. Length-capped
 * so the modal payload stays small. Never throws.
 */
export function extractErrorSnippet(logs: string | null | undefined): string {
  const CAP = 1200;
  if (!logs || typeof logs !== 'string') return '';
  const text = logs.replace(/\r\n/g, '\n').trim();
  if (!text) return '';

  const lines = text.split('\n');
  const errIdx = lines.findIndex((l) => /(^|\s)(Error|TimeoutError|AssertionError|expect\()/i.test(l));

  let snippet: string;
  if (errIdx !== -1) {
    // From the error line, take a handful of following context lines.
    snippet = lines.slice(errIdx, errIdx + 8).join('\n').trim();
  } else {
    // No explicit marker: the tail usually holds the failure summary.
    snippet = lines.slice(-8).join('\n').trim();
  }
  if (snippet.length > CAP) snippet = snippet.slice(0, CAP - 3).trimEnd() + '...';
  return snippet;
}

/** One scenario's result within a suite run. */
export interface ScenarioResult {
  id: string;
  name: string;
  status: ScenarioRunStatus;
  /** Why a scenario was SKIPPED (no script, unsupported runner). */
  reason?: string;
  /** Concise error snippet for a FAILED scenario, from the runner logs. */
  error?: string;
}

/** Outcome of running a whole suite (POC): a batch id, the aggregate status, and per-scenario results. */
export interface RunSuiteResult {
  runBatchId: string;
  jobStatus: JobStatus;
  results: ScenarioResult[];
}

/**
 * Run every scenario in a suite sequentially in one batch (Model B).
 *
 * - Empty suite is the caller's guard (AC-15.08); here an empty scenario list
 *   yields jobStatus SKIPPED with no results.
 * - A scenario with no runnable code -> SKIPPED (AC-15.09/10).
 * - A scenario whose runner is unsupported on the server -> SKIPPED with reason.
 * - Otherwise execute; SUCCESS/FAILED. Never stops early on failure (AC-15.06).
 *
 * Persisting each result as a history record with the shared runBatchId is done
 * by the caller (route), which owns the history-store write shape.
 */
export async function runSuiteForSuite(userId: string, suiteId: string): Promise<RunSuiteResult> {
  const runBatchId = randomUUID();
  const raw = await getRunnableScenariosBySuite(userId, suiteId);
  const scenarios = dedupeLatestByName(raw);

  const results: ScenarioResult[] = [];
  for (const s of scenarios) {
    if (!s.generatedCode || !s.generatedCode.trim()) {
      results.push({ id: s.id, name: s.testSuite, status: 'SKIPPED', reason: 'No script for this scenario' });
      continue;
    }
    const guard = checkRunnerSupport({ framework: s.framework, language: s.language, code: s.generatedCode });
    if (!guard.allowed) {
      results.push({ id: s.id, name: s.testSuite, status: 'SKIPPED', reason: guard.reason });
      continue;
    }
    try {
      const exec = await executePlaywrightTest({
        code: s.generatedCode,
        mode: 'headless',
        language: (s.language === 'javascript' ? 'javascript' : 'typescript'),
        userId
      });
      results.push({
        id: s.id,
        name: s.testSuite,
        status: exec.success ? 'SUCCESS' : 'FAILED',
        error: exec.success ? undefined : extractErrorSnippet(exec.logs)
      });
    } catch (err) {
      results.push({ id: s.id, name: s.testSuite, status: 'FAILED', reason: err instanceof Error ? err.message : String(err) });
    }
  }

  return { runBatchId, jobStatus: computeJobStatus(results.map((r) => r.status)), results };
}
