/*
 * tester-lab - Suite-level run report (POC).
 * Turns a RunSuiteResult into a Suite -> Scenario -> Step report document and
 * renders it to standalone HTML. No user stories or acceptance criteria: the
 * POC reports what each scenario did, not coverage of any criterion.
 */
import type { RunSuiteResult, ScenarioResult, StepDetail } from './run-suite-service.js';

export interface SuiteReportStep {
  step: number;
  description: string;
  status: StepDetail['status'];
  screenshotUrl?: string;
}

export interface SuiteReportScenario {
  id: string;
  name: string;
  status: ScenarioResult['status'];
  reason?: string;
  error?: string;
  screenshotUrl?: string;
  stepShots?: { step: number; url: string }[];
  steps: SuiteReportStep[];
}

export interface SuiteReportTotals {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
}

export interface SuiteReport {
  suiteName: string;
  targetUrl?: string;
  jobStatus: RunSuiteResult['jobStatus'];
  generatedAt: string;
  totals: SuiteReportTotals;
  scenarios: SuiteReportScenario[];
}

interface BuildOptions {
  suiteName: string;
  targetUrl?: string;
  generatedAt?: string;
}

function totalsFrom(results: ScenarioResult[]): SuiteReportTotals {
  return {
    total: results.length,
    passed: results.filter((r) => r.status === 'SUCCESS').length,
    failed: results.filter((r) => r.status === 'FAILED').length,
    skipped: results.filter((r) => r.status === 'SKIPPED').length
  };
}

export function buildSuiteReport(run: RunSuiteResult, options: BuildOptions): SuiteReport {
  const results = Array.isArray(run.results) ? run.results : [];
  return {
    suiteName: options.suiteName,
    targetUrl: options.targetUrl,
    jobStatus: run.jobStatus,
    generatedAt: options.generatedAt || new Date().toISOString(),
    totals: totalsFrom(results),
    scenarios: results.map((r) => {
      const shotByStep = new Map((r.stepShots || []).map((s) => [s.step, s.url]));
      return {
        id: r.id,
        name: r.name,
        status: r.status,
        reason: r.reason,
        error: r.error,
        screenshotUrl: r.screenshotUrl,
        stepShots: r.stepShots,
        steps: (r.steps || []).map((s) => ({
          step: s.step,
          description: s.description,
          status: s.status,
          screenshotUrl: shotByStep.get(s.step)
        }))
      };
    })
  };
}

export type EmbeddedImages = Map<string, string>;

function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function scenarioPill(status: SuiteReportScenario['status']): string {
  if (status === 'SUCCESS') return 'p-pass';
  if (status === 'FAILED') return 'p-fail';
  return 'p-skip';
}

function stepPill(status: SuiteReportStep['status']): string {
  if (status === 'OK') return 'p-pass';
  if (status === 'FAILED') return 'p-fail';
  return 'p-skip';
}

function evidenceCell(url: string | undefined, images: EmbeddedImages): string {
  if (!url) return '<span class="note">&mdash;</span>';
  const embedded = images.get(url);
  if (embedded) return `<img class="shot" src="${embedded}" alt="evidence">`;
  return '<span class="note">Screenshot omitted to keep this export within its size limit</span>';
}

function stepRows(scenario: SuiteReportScenario, images: EmbeddedImages): string {
  const steps = scenario.steps;
  if (steps.length === 0) {
    return '<tr><td colspan="4" class="note">No per-step detail was recorded for this scenario.</td></tr>';
  }
  return steps
    .map((s) => {
      const label = s.status === 'OK' ? 'Pass' : s.status === 'FAILED' ? 'Fail' : 'Pending';
      return `<tr>
        <td class="mono">${s.step}</td>
        <td>${esc(s.description || '&mdash;')}</td>
        <td><span class="pill ${stepPill(s.status)}">${label}</span></td>
        <td class="ev">${evidenceCell(s.screenshotUrl, images)}</td>
      </tr>`;
    })
    .join('');
}

function scenarioBlock(scenario: SuiteReportScenario, images: EmbeddedImages): string {
  const failure = scenario.error
    ? `<div class="err"><div class="t">Failure</div><pre>${esc(scenario.error)}</pre></div>`
    : '';
  const skip = scenario.status === 'SKIPPED' && scenario.reason
    ? `<div class="note">Skipped: ${esc(scenario.reason)}</div>`
    : '';
  const anyStepShot = scenario.steps.some((s) => s.screenshotUrl);
  // Show the scenario-level snapshot only when steps carry none of their own,
  // so the report does not repeat the same picture.
  const shot = scenario.status !== 'SKIPPED' && !anyStepShot
    ? `<div class="evidence">${evidenceCell(scenario.screenshotUrl, images)}</div>`
    : '';
  return `<section class="scenario">
    <div class="scenario-head">
      <span class="pill ${scenarioPill(scenario.status)}">${esc(scenario.status)}</span>
      <h3>${esc(scenario.name)}</h3>
    </div>
    ${skip}${failure}
    <table class="steps">
      <thead><tr><th>#</th><th>Step</th><th>Status</th><th>Evidence</th></tr></thead>
      <tbody>${stepRows(scenario, images)}</tbody>
    </table>
    ${shot}
  </section>`;
}

export function renderSuiteReportHtml(report: SuiteReport, images: EmbeddedImages = new Map()): string {
  const t = report.totals;
  const scenarios = report.scenarios.map((s) => scenarioBlock(s, images)).join('');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Suite Report &mdash; ${esc(report.suiteName)}</title>
<style>
  :root { --pass:#1a7f37; --fail:#cf222e; --skip:#6e7781; --ink:#1f2328; --muted:#656d76; --line:#d0d7de; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, Segoe UI, Roboto, sans-serif; color: var(--ink); margin: 0; padding: 32px; }
  h1 { font-size: 22px; margin: 0 0 4px; }
  .sub { color: var(--muted); font-size: 13px; margin-bottom: 20px; }
  .totals { display: flex; gap: 12px; margin-bottom: 24px; flex-wrap: wrap; }
  .tile { border: 1px solid var(--line); border-radius: 8px; padding: 10px 16px; min-width: 84px; }
  .tile .n { font-size: 20px; font-weight: 600; }
  .tile .l { font-size: 11px; color: var(--muted); text-transform: uppercase; letter-spacing: .04em; }
  .pill { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 11px; font-weight: 600; color: #fff; }
  .p-pass { background: var(--pass); } .p-fail { background: var(--fail); } .p-skip { background: var(--skip); }
  .scenario { border: 1px solid var(--line); border-radius: 8px; padding: 16px; margin-bottom: 16px; break-inside: avoid; }
  .scenario-head { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
  .scenario-head h3 { font-size: 15px; margin: 0; }
  table.steps { width: 100%; border-collapse: collapse; font-size: 13px; margin: 8px 0; }
  table.steps th, table.steps td { text-align: left; padding: 6px 8px; border-bottom: 1px solid var(--line); }
  table.steps th { color: var(--muted); font-weight: 500; font-size: 11px; text-transform: uppercase; }
  .mono { font-family: ui-monospace, Menlo, monospace; }
  .note { color: var(--muted); font-size: 12px; }
  .err { background: #fff8f8; border: 1px solid #ffcfcf; border-radius: 6px; padding: 8px 10px; margin: 8px 0; }
  .err .t { color: var(--fail); font-weight: 600; font-size: 12px; margin-bottom: 4px; }
  .err pre { margin: 0; white-space: pre-wrap; font-size: 12px; }
  .evidence { margin-top: 8px; }
  .shot { max-width: 100%; border: 1px solid var(--line); border-radius: 6px; }
  td.ev { width: 200px; }
  td.ev .shot { max-width: 180px; cursor: zoom-in; }
</style>
</head>
<body>
  <h1>Suite Report &mdash; ${esc(report.suiteName)}</h1>
  <div class="sub">
    Status <span class="pill ${scenarioPill(report.jobStatus === 'PASSED' ? 'SUCCESS' : report.jobStatus === 'FAILED' ? 'FAILED' : 'SKIPPED')}">${esc(report.jobStatus)}</span>
    &nbsp;&middot;&nbsp; ${esc(report.generatedAt)}${report.targetUrl ? ` &middot; ${esc(report.targetUrl)}` : ''}
  </div>
  <div class="totals">
    <div class="tile"><div class="n">${t.total}</div><div class="l">Total</div></div>
    <div class="tile"><div class="n">${t.passed}</div><div class="l">Passed</div></div>
    <div class="tile"><div class="n">${t.failed}</div><div class="l">Failed</div></div>
    <div class="tile"><div class="n">${t.skipped}</div><div class="l">Skipped</div></div>
  </div>
  ${scenarios}
</body>
</html>`;
}
