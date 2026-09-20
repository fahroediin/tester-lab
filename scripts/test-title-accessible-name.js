/*
 * Tombol icon-only dengan `title` (mis. <button title="Edit field ini"><svg></svg></button>)
 * harus bisa di-target. `title` adalah accessible-name fallback (spec ARIA), jadi
 * extractor memetakannya ke ariaLabel saat tak ada aria-label/teks. Dengan itu
 * scoring mencocokkannya dan resolver menghasilkan getByRole(name)/getByLabel,
 * bukan text= yang tak pernah cocok (teks ada di title, bukan konten).
 *
 * Run: node scripts/test-title-accessible-name.js
 */
'use strict';

const assert = require('assert');
const { chromium } = require('playwright');
const { extractCandidatesFromPage } = require('../dist/crawler/dom-candidate-extractor.js');
const { HeuristicMatcher } = require('../dist/matcher/heuristic-matcher.js');

let passed = 0;
function ok(name, cond) {
  assert.ok(cond, 'FAILED: ' + name);
  passed++;
  console.log('  ✓ ' + name);
}

const FIXTURE = `data:text/html,${encodeURIComponent(`
<!doctype html><html><body>
  <!-- Tombol icon-only: teks kosong, accessible name dari title -->
  <button title="Edit field ini"><svg aria-hidden="true" width="16" height="16"></svg></button>
  <!-- Tombol dengan teks: title tidak menimpa teks nyata -->
  <button title="tooltip lain">Simpan</button>
  <!-- Tombol dengan aria-label: aria-label menang atas title -->
  <button aria-label="Hapus baris" title="jangan pakai ini"><svg aria-hidden="true"></svg></button>
</body></html>
`)}`;

(async () => {
  console.log('\n[title-accname] title sebagai accessible name');
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  try {
    await page.goto(FIXTURE, { waitUntil: 'domcontentloaded' });
    const cands = await extractCandidatesFromPage(page);
    const buttons = cands.filter((c) => c.tagName === 'button');

    const editBtn = buttons.find((c) => c.ariaLabel === 'Edit field ini');
    ok('extractor: title mengisi ariaLabel saat tak ada teks/aria', !!editBtn);

    const simpan = buttons.find((c) => c.innerText === 'Simpan');
    ok('tombol berteks: innerText tetap "Simpan"', !!simpan);
    ok('tombol berteks: title TIDAK menimpa teks nyata (ariaLabel bukan tooltip)',
      !simpan || simpan.ariaLabel !== 'tooltip lain');

    const hapus = buttons.find((c) => c.ariaLabel === 'Hapus baris');
    ok('aria-label menang atas title', !!hapus);

    // Matcher: 'Edit field ini' harus match tombol icon-only, bukan skor 0.
    const matcher = new HeuristicMatcher();
    const resolved = matcher.matchStep(
      { step: 1, action: 'click', targetLabel: 'Edit field ini' },
      cands
    );
    ok('matcher: skor > 0 untuk target title-only', resolved.matchScore > 0);
    ok('resolver: BUKAN fallback text= locator',
      !(resolved.selectorType === 'locator' && String(resolved.selectorValue).startsWith('text=')));
    ok('resolver: getByRole/getByLabel dari title',
      resolved.selectorType === 'getByRole' || resolved.selectorType === 'getByLabel');

    console.log('\nAll title-accname tests passed: ' + passed);
  } finally {
    await browser.close();
  }
})().catch((err) => {
  console.error('\n[FAILED]', err.message);
  process.exit(1);
});
