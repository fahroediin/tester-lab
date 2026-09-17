/*
 * AC-07.12 (US-07) — klik yang memicu navigasi ditunggu sampai halaman stabil.
 *
 * Root cause: generated code mengeksekusi click lalu langsung lanjut ke step
 * berikut. Untuk link yang memicu navigasi halaman penuh, step berikutnya
 * (mis. fill) berjalan sebelum halaman tujuan termuat, sehingga field tidak
 * ditemukan. Fix: setelah click, tunggu load state secara aman (di-catch,
 * tidak menggantung bila tak ada navigasi).
 *
 * Test ini memeriksa OUTPUT generator (bebas jaringan).
 * Run: node scripts/test-click-await-navigation.js
 */
'use strict';

const assert = require('assert');
const { CodeGenerator } = require('../dist/generator/code-generator.js');

let passed = 0;
function ok(name, cond) {
  assert.ok(cond, 'FAILED: ' + name);
  passed++;
  console.log('  ✓ ' + name);
}

const gen = new CodeGenerator();
const cfg = { testSuite: 'AC0712', targetUrl: 'https://example.com', viewport: { width: 1280, height: 720 } };

function clickStep(selectorType, selectorValue, roleName) {
  return {
    step: 1,
    action: 'click',
    targetLabel: selectorValue,
    description: 'click',
    selectorType,
    selectorValue,
    roleName,
    matchScore: 100
  };
}

(async () => {
  console.log('\n[AC-07.12] click awaits navigation to settle');

  // AC-07.12a: Playwright TS — after a click, code waits for the page to settle.
  // Checked via a GUARDED wait (.catch), which the initial goto's plain
  // waitForLoadState('networkidle') does not have — so this is specific to the
  // post-click wait, not a false positive on the goto.
  const ts = (await gen.generateScript({ ...cfg, framework: 'playwright', language: 'typescript' }, [
    clickStep('getByRole', 'link', 'Sign Up')
  ])).code;
  ok(
    'AC-07.12a (TS) post-click load-state wait exists and is guarded (catch)',
    /waitForLoadState\([^;]*\)\s*\.catch\(/.test(ts)
  );

  // AC-07.12b: the initial goto still uses a plain (unguarded) networkidle wait,
  // i.e. the fix added a NEW guarded wait rather than replacing the goto's.
  ok(
    'AC-07.12b (TS) initial goto load-state wait is preserved',
    /goto\([^)]*\);\s*await\s+page\.waitForLoadState\('networkidle'\);/.test(ts.replace(/\n/g, ' '))
  );

  // AC-07.12c: Playwright JS carries a guarded post-click load-state wait too.
  const js = (await gen.generateScript({ ...cfg, framework: 'playwright', language: 'javascript' }, [
    clickStep('getByText', 'Sign Up')
  ])).code;
  ok(
    'AC-07.12c (JS) post-click load-state wait exists and is guarded (catch)',
    /waitForLoadState\([^;]*\)\s*\.catch\(/.test(js)
  );

  console.log('\nAll AC-07.12 tests passed: ' + passed);
})().catch((err) => {
  console.error('\n[FAILED]', err.message);
  process.exit(1);
});
