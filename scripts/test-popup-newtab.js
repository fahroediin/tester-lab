/*
 * Klik yang membuka tab/window baru (mis. tombol "Reprint" -> halaman print via
 * window.open / target=_blank) harus ditangani: generated script beralih ke tab
 * baru sehingga step berikutnya berjalan di sana, dan proses tidak menggantung
 * (penyebab error "runner service ... is not valid JSON").
 *
 * Test ini memeriksa OUTPUT generator (bebas jaringan).
 * Run: node scripts/test-popup-newtab.js
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
const cfg = { testSuite: 'Popup', targetUrl: 'https://example.com', viewport: { width: 1280, height: 720 } };

(async () => {
  console.log('\n[popup] generated code adopts a new tab after click');

  const ts = (await gen.generateScript({ ...cfg, framework: 'playwright', language: 'typescript' }, [
    { step: 1, action: 'click', targetLabel: 'Reprint', selectorType: 'getByText', selectorValue: 'Reprint', matchScore: 100 },
    { step: 2, action: 'assert_visible', targetLabel: 'Voucher', selectorType: 'getByText', selectorValue: 'Voucher', matchScore: 100 }
  ])).code;

  // Ada page aktif yang bisa berpindah, bukan hanya parameter page tetap.
  ok('TS: mendeklarasikan activePage', /let\s+activePage\s*=/.test(ts));
  // Step membangun locator dari activePage (bukan page langsung).
  ok('TS: step memakai activePage untuk locator', /activePage\.(getByText|getByRole|getByLabel|locator|getByPlaceholder|getByTestId)/.test(ts));
  // Setelah click, deteksi popup lewat context event.
  ok('TS: deteksi popup setelah click', /waitForEvent\(\s*['"]page['"]/.test(ts));

  // JS variant juga.
  const js = (await gen.generateScript({ ...cfg, framework: 'playwright', language: 'javascript' }, [
    { step: 1, action: 'click', targetLabel: 'Reprint', selectorType: 'getByText', selectorValue: 'Reprint', matchScore: 100 }
  ])).code;
  ok('JS: mendeklarasikan activePage', /let\s+activePage\s*=/.test(js));
  ok('JS: deteksi popup setelah click', /waitForEvent\(\s*['"]page['"]/.test(js));

  console.log('\nAll popup tests passed: ' + passed);
})().catch((err) => {
  console.error('\n[FAILED]', err.message);
  process.exit(1);
});
