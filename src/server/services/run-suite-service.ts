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
import { getScenarioOrderMap } from '../suite-store.js';
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

/**
 * Order scenarios by a saved per-name order map (US-15 re-order). Scenarios
 * whose name is in the map come first, sorted by the map value; scenarios not
 * in the map keep their original relative order and go to the end (AC-15.22).
 * Order-only: does not change scenario independence. Never throws.
 */
export function orderScenariosByMap<T extends { testSuite: string }>(
  scenarios: T[],
  orderMap: Record<string, number> | null | undefined
): T[] {
  if (!Array.isArray(scenarios)) return [];
  const map = orderMap && typeof orderMap === 'object' ? orderMap : {};
  const inMap: T[] = [];
  const rest: T[] = [];
  for (const s of scenarios) {
    if (s && Object.prototype.hasOwnProperty.call(map, s.testSuite)) inMap.push(s);
    else rest.push(s);
  }
  inMap.sort((a, b) => (map[a.testSuite] ?? 0) - (map[b.testSuite] ?? 0));
  return inMap.concat(rest);
}

/**
 * Move an item within an array from one index to another, returning a new
 * array. Out-of-range indices are a no-op. Length is preserved. Pure.
 */
export function moveItem<T>(items: T[], fromIndex: number, toIndex: number): T[] {
  if (!Array.isArray(items)) return [];
  const out = items.slice();
  if (fromIndex < 0 || fromIndex >= out.length || toIndex < 0 || toIndex >= out.length) return out;
  const moved = out.splice(fromIndex, 1)[0] as T;
  out.splice(toIndex, 0, moved);
  return out;
}

/** One step's line in a scenario's step-by-step detail. */
export interface StepDetail {
  step: number;
  description: string;
  status: 'OK' | 'FAILED' | 'PENDING';
}

/**
 * Build a step-by-step list from a scenario's generated code and its run log.
 * Descriptions come from the "// Step N: ..." comments in the code. A step's
 * status is decided from two markers the generated code emits:
 * - "__STEP_START__ N" printed BEFORE the step's action, and
 * - "__STEP_DONE__ N"  printed AFTER the action succeeds.
 * So: START + DONE -> OK; START without DONE -> FAILED (the step that threw);
 * neither -> PENDING (never reached). This is what stops a failed step from
 * showing as OK just because its START marker was already printed.
 *
 * Backward compatibility: scenarios generated before __STEP_DONE__ existed
 * have only START markers. When the log contains NO __STEP_DONE__ at all, fall
 * back to the old rule (START means OK) so those runs still read sensibly.
 * Pure; never throws.
 */
export function parseStepList(generatedCode: string | null | undefined, logs: string | null | undefined): StepDetail[] {
  if (!generatedCode || typeof generatedCode !== 'string') return [];
  const code = generatedCode;
  const log = typeof logs === 'string' ? logs : '';

  // Legacy logs (pre-__STEP_DONE__) can't distinguish OK from FAILED; keep the
  // old behavior for them rather than marking every started step as failed.
  const hasDoneMarkers = /__STEP_DONE__\s+\d+\b/.test(log);

  const steps: StepDetail[] = [];
  const seen = new Set<number>();
  const re = /\/\/\s*Step\s+(\d+)\s*:\s*(.*)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(code)) !== null) {
    const n = parseInt(m[1] ?? '', 10);
    if (Number.isNaN(n) || seen.has(n)) continue;
    seen.add(n);
    const started = new RegExp('__STEP_START__\\s+' + n + '\\b').test(log);
    const done = new RegExp('__STEP_DONE__\\s+' + n + '\\b').test(log);

    let status: StepDetail['status'];
    if (!started) {
      status = 'PENDING';
    } else if (hasDoneMarkers) {
      status = done ? 'OK' : 'FAILED';
    } else {
      status = 'OK'; // legacy: start-only log, best we can say
    }
    steps.push({ step: n, description: (m[2] ?? '').trim(), status });
  }
  steps.sort((a, b) => a.step - b.step);
  return steps;
}

/** A progress event streamed to the client while a suite runs (US-16). */
export type ProgressEvent =
  | { type: 'start'; total: number; scenarios: { id: string; name: string }[] }
  | { type: 'scenario_start'; index: number; id: string; name: string }
  | { type: 'scenario_done'; index: number; result: ScenarioResult };

/**
 * Build the "start" progress event from the ordered scenario list: how many
 * will run and their names in execution order, so the client can render the
 * whole checklist before anything executes (US-16, intent AC-16.01). Carries
 * only id + name. Never throws.
 */
export function makeStartEvent(
  scenarios: { id: string; testSuite: string }[] | null | undefined
): { type: 'start'; total: number; scenarios: { id: string; name: string }[] } {
  const list = Array.isArray(scenarios) ? scenarios : [];
  const mapped = list.map((s) => ({ id: s.id, name: s.testSuite }));
  return { type: 'start', total: mapped.length, scenarios: mapped };
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
  /** Short-lived signed URL of the failure screenshot, if one was captured (AC-19.03). */
  screenshotUrl?: string;
  /** Step-by-step detail (description + status) for the scenario's run. */
  steps?: StepDetail[];
}

/** Outcome of running a whole suite (POC): a batch id, the aggregate status, and per-scenario results. */
export interface RunSuiteResult {
  runBatchId: string;
  jobStatus: JobStatus;
  results: ScenarioResult[];
}

/** Minimal executor result shape needed to classify a scenario run. */
export interface ScenarioExecResult {
  success: boolean;
  logs?: string | null;
  /** Signed URL of a failure screenshot, when the runner captured one. */
  screenshotUrl?: string;
}

/** How to actually run one scenario. Injected so the loop is testable. */
export type ScenarioExecutor = (scenario: SuiteScenario) => Promise<ScenarioExecResult>;

/**
 * Run the given (already ordered) scenarios sequentially, emitting a progress
 * event before and after each one (US-16, intent AC-16.01). The executor is
 * injected so this orchestration can be tested without Supabase or Playwright.
 *
 * Classification is unchanged from the batch behavior (Model B):
 * - No runnable code -> SKIPPED (AC-15.09/10), executor not called.
 * - Unsupported runner -> SKIPPED with reason, executor not called.
 * - Otherwise execute; SUCCESS/FAILED. Never stops early on failure (AC-15.06).
 *
 * `onProgress` is optional: non-streaming callers get identical results without
 * providing one. Never throws for a single scenario failure — it is captured.
 */
export async function runScenariosWithProgress(
  scenarios: SuiteScenario[],
  execute: ScenarioExecutor,
  onProgress?: (ev: ProgressEvent) => void
): Promise<{ jobStatus: JobStatus; results: ScenarioResult[] }> {
  const list = Array.isArray(scenarios) ? scenarios : [];
  const results: ScenarioResult[] = [];

  for (let i = 0; i < list.length; i++) {
    const s = list[i] as SuiteScenario;
    const index = i + 1; // 1-based position for the "X of N" display
    if (onProgress) onProgress({ type: 'scenario_start', index, id: s.id, name: s.testSuite });

    let result: ScenarioResult;
    if (!s.generatedCode || !s.generatedCode.trim()) {
      result = { id: s.id, name: s.testSuite, status: 'SKIPPED', reason: 'No script for this scenario' };
    } else {
      const guard = checkRunnerSupport({ framework: s.framework, language: s.language, code: s.generatedCode });
      if (!guard.allowed) {
        result = { id: s.id, name: s.testSuite, status: 'SKIPPED', reason: guard.reason };
      } else {
        try {
          const exec = await execute(s);
          result = {
            id: s.id,
            name: s.testSuite,
            status: exec.success ? 'SUCCESS' : 'FAILED',
            error: exec.success ? undefined : extractErrorSnippet(exec.logs),
            screenshotUrl: exec.success ? undefined : exec.screenshotUrl,
            steps: parseStepList(s.generatedCode, exec.logs)
          };
        } catch (err) {
          result = { id: s.id, name: s.testSuite, status: 'FAILED', reason: err instanceof Error ? err.message : String(err) };
        }
      }
    }

    results.push(result);
    if (onProgress) onProgress({ type: 'scenario_done', index, result });
  }

  return { jobStatus: computeJobStatus(results.map((r) => r.status)), results };
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
 * Progress: pass `onProgress` to receive a `start` event plus per-scenario
 * `scenario_start`/`scenario_done` events as the run advances (US-16). Callers
 * that omit it get the same result with no streaming.
 *
 * Persisting each result as a history record with the shared runBatchId is done
 * by the caller (route), which owns the history-store write shape.
 */
export async function runSuiteForSuite(
  userId: string,
  suiteId: string,
  onProgress?: (ev: ProgressEvent) => void
): Promise<RunSuiteResult> {
  const runBatchId = randomUUID();
  const raw = await getRunnableScenariosBySuite(userId, suiteId);
  // Honor the user-defined execution order (US-15); unordered scenarios trail.
  const orderMap = await getScenarioOrderMap(suiteId);
  const scenarios = orderScenariosByMap(dedupeLatestByName(raw), orderMap);

  if (onProgress) onProgress(makeStartEvent(scenarios));

  const { jobStatus, results } = await runScenariosWithProgress(
    scenarios,
    (s) => executePlaywrightTest({
      code: s.generatedCode,
      mode: 'headless',
      language: (s.language === 'javascript' ? 'javascript' : 'typescript'),
      userId,
      // Headless suite runs get no headed slowMo buffer, which exposes async
      // load races between steps (a scenario that passes in the Scenario
      // Builder then fails here). A small per-action pace restores parity.
      slowMoMs: 300
    }),
    onProgress
  );

  return { runBatchId, jobStatus, results };
}
