/*
 * AC-07.11 (US-07) — assert_visible pada teks duplikat memilih elemen terlihat.
 *
 * Root cause: generated Playwright code menegakkan expect(locator.first())
 * .toBeVisible(). Saat sebuah teks muncul di dua elemen (satu visible, satu
 * hidden), locator getByText cocok ke keduanya dan .first() mengambil elemen
 * pertama di DOM — bisa yang hidden — sehingga dry-run gagal palsu.
 *
 * Fix: untuk assert_visible, saring locator ke elemen visible dulu
 * (filter({ visible: true })) sebelum toBeVisible.
 *
 * Test ini memeriksa OUTPUT generator (bebas jaringan).
 * Run: node scripts/test-assert-visible-priority.js
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

function stepAssertVisible(selectorType, selectorValue, roleName) {
  return {
    step: 1,
    action: 'assert_visible',
    targetLabel: selectorValue,
    description: 'assert visible',
    selectorType,
    selectorValue,
    roleName,
    matchScore: 100
  };
}

(async () => {
  console.log('\n[AC-07.11] assert_visible filters to a visible element');

  const cfg = { testSuite: 'AC0711', targetUrl: 'https://example.com', viewport: { width: 1280, height: 720 } };

  // AC-07.11a: Playwright TS, getByText -> must filter to visible before asserting.
  const ts = (await gen.generateScript({ ...cfg, framework: 'playwright', language: 'typescript' }, [
    stepAssertVisible('getByText', 'Create Account')
  ])).code;
  ok(
    'AC-07.11a (TS) assert_visible via getByText filters visible before toBeVisible',
    /filter\(\s*\{\s*visible:\s*true\s*\}\s*\)/.test(ts)
  );

  // AC-07.11b: Playwright JS variant carries the same guard.
  const js = (await gen.generateScript({ ...cfg, framework: 'playwright', language: 'javascript' }, [
    stepAssertVisible('getByText', 'Create Account')
  ])).code;
  ok(
    'AC-07.11b (JS) assert_visible via getByText filters visible before toBeVisible',
    /filter\(\s*\{\s*visible:\s*true\s*\}\s*\)/.test(js)
  );

  // AC-07.11c: non-assert action (click via getByText) must NOT get the visible
  // filter. Checked on the JS template, whose branches are per-action (the TS
  // template's interact() helper always defines the filter for its assert branch,
  // so the string legitimately appears in every TS script regardless of action).
  const clickJs = (await gen.generateScript({ ...cfg, framework: 'playwright', language: 'javascript' }, [
    { step: 1, action: 'click', targetLabel: 'Create Account', description: '', selectorType: 'getByText', selectorValue: 'Create Account', matchScore: 100 }
  ])).code;
  ok(
    'AC-07.11c (JS) click via getByText is unchanged (no visible filter)',
    !/filter\(\s*\{\s*visible:\s*true\s*\}\s*\)/.test(clickJs)
  );

  // AC-07.11d: generated TS still contains the toBeVisible assertion (behaviour intact).
  ok(
    'AC-07.11d (TS) still asserts toBeVisible',
    ts.includes('toBeVisible')
  );

  console.log('\nAll AC-07.11 tests passed: ' + passed);
})().catch((err) => {
  console.error('\n[FAILED]', err.message);
  process.exit(1);
});
