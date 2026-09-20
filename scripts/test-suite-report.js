/*
 * Report level Suite (POC, tanpa US/AC) — port dari rotomate.
 * Test untuk buildSuiteReport(): RunSuiteResult -> SuiteReport (Suite->Scenario->Step).
 * Run: node scripts/test-suite-report.js
 */
'use strict';

const assert = require('assert');
const { buildSuiteReport, renderSuiteReportHtml } = require('../dist/server/services/suite-report-service.js');

let passed = 0;
function ok(name, cond) {
  assert.ok(cond, 'FAILED: ' + name);
  passed++;
  console.log('  ✓ ' + name);
}

(function () {
  console.log('\n[suite-report] buildSuiteReport');

  const runResult = {
    runBatchId: 'batch-1',
    jobStatus: 'PARTIAL',
    results: [
      {
        id: 's1', name: 'Login berhasil', status: 'SUCCESS',
        screenshotUrl: 'https://x/ok.png',
        stepShots: [{ step: 1, url: 'https://x/s1.png' }],
        steps: [
          { step: 1, description: 'fill Email', status: 'OK' },
          { step: 2, description: 'click Login', status: 'OK' }
        ]
      },
      {
        id: 's2', name: 'Login gagal', status: 'FAILED',
        error: 'Timeout on Submit',
        steps: [
          { step: 1, description: 'fill Email', status: 'OK' },
          { step: 2, description: 'click Submit', status: 'FAILED' }
        ]
      },
      {
        id: 's3', name: 'Tanpa script', status: 'SKIPPED', reason: 'No script for this scenario'
      }
    ]
  };

  const report = buildSuiteReport(runResult, { suiteName: 'Auth Suite', targetUrl: 'https://app/login' });

  // Struktur dasar
  ok('report punya suiteName', report.suiteName === 'Auth Suite');
  ok('report punya jobStatus dari run', report.jobStatus === 'PARTIAL');
  ok('report punya generatedAt (ISO string)', typeof report.generatedAt === 'string' && report.generatedAt.length > 0);
  ok('report punya targetUrl', report.targetUrl === 'https://app/login');

  // Totals
  ok('totals.total = 3', report.totals.total === 3);
  ok('totals.passed = 1', report.totals.passed === 1);
  ok('totals.failed = 1', report.totals.failed === 1);
  ok('totals.skipped = 1', report.totals.skipped === 1);

  // Scenario -> Step (TANPA US/AC)
  ok('3 scenario', report.scenarios.length === 3);
  ok('scenario tidak punya field story/criterion (bebas US/AC)',
    report.scenarios.every((s) => !('story' in s) && !('criterion' in s) && !('coverage' in s)));
  const s1 = report.scenarios[0];
  ok('scenario SUCCESS bawa steps', Array.isArray(s1.steps) && s1.steps.length === 2);
  ok('scenario SUCCESS bawa screenshotUrl', s1.screenshotUrl === 'https://x/ok.png');
  const s2 = report.scenarios[1];
  ok('scenario FAILED bawa error', s2.error === 'Timeout on Submit');
  ok('step FAILED tercermin', s2.steps.some((st) => st.status === 'FAILED'));
  const s3 = report.scenarios[2];
  ok('scenario SKIPPED bawa reason', s3.reason === 'No script for this scenario');

  // --- renderSuiteReportHtml ---
  console.log('\n[suite-report] renderSuiteReportHtml');
  const images = new Map([['https://x/ok.png', 'data:image/png;base64,AAAA']]);
  const html = renderSuiteReportHtml(report, images);
  ok('HTML dokumen lengkap', html.startsWith('<!doctype html>') && html.includes('</html>'));
  ok('HTML memuat nama suite', html.includes('Auth Suite'));
  ok('HTML menampilkan totals', html.includes('>3<') && html.includes('Total'));
  ok('HTML tanpa istilah US/AC', !/acceptance criteria|user story|coverage|criterion/i.test(html));
  ok('HTML meng-embed screenshot yang tersedia', html.includes('data:image/png;base64,AAAA'));
  ok('HTML meng-escape agar aman', !/<script>/.test(html));
  ok('HTML tampilkan error scenario FAILED', html.includes('Timeout on Submit'));

  console.log('\nAll suite-report tests passed: ' + passed);
})();
