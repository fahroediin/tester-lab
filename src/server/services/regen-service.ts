/**
 * Pure guards and input-shaping for regenerating a scenario's Playwright code
 * from its stored DSL, without touching the database. The regen script wraps
 * these; keeping them pure makes the decision logic testable.
 *
 * A scenario can be regenerated only when its `resolvedSteps` are stored (the
 * generator renders from them). `rawDsl` supplies framework / language /
 * targetUrl; sensible defaults fill in when a field is absent.
 */

/** Minimal shape of a stored history record needed to regenerate. */
export interface RegenRecord {
  testSuite?: string;
  resolvedSteps?: unknown;
  rawDsl?: Record<string, unknown> | null;
}

/** Whether a record can be regenerated, with a reason when it cannot. */
export function canRegenerate(record: RegenRecord | null | undefined): { ok: boolean; reason?: string } {
  if (!record) return { ok: false, reason: 'No record' };
  const steps = record.resolvedSteps;
  if (!Array.isArray(steps) || steps.length === 0) {
    return { ok: false, reason: 'No resolvedSteps stored; nothing to render from' };
  }
  return { ok: true };
}

/** Build the generator input (config + resolvedSteps) from a stored record. */
export function toGeneratorInput(record: RegenRecord): {
  config: { framework: string; language: string; targetUrl: string; testSuite: string };
  resolvedSteps: unknown[];
} {
  const raw = (record.rawDsl && typeof record.rawDsl === 'object' ? record.rawDsl : {}) as Record<string, unknown>;
  const framework = typeof raw.framework === 'string' && raw.framework ? raw.framework : 'playwright';
  const language = typeof raw.language === 'string' && raw.language ? raw.language : 'typescript';
  const targetUrl = typeof raw.targetUrl === 'string' ? raw.targetUrl : '';
  const testSuite = typeof record.testSuite === 'string' ? record.testSuite : '';
  const resolvedSteps = Array.isArray(record.resolvedSteps) ? record.resolvedSteps : [];
  return { config: { framework, language, targetUrl, testSuite }, resolvedSteps };
}
