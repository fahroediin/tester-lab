/*
 * AC-07.13 (US-07) — hasDirectLabel hanya untuk asosiasi label yang SAH bagi
 * Playwright getByLabel.
 *
 * Root cause: extractor menandai hasDirectLabel=true begitu ada
 * `label[for="id"]`, tanpa memeriksa apakah `id` itu unik dan benar menunjuk ke
 * input INI. Pada markup cacat (id duplikat: satu <div> dan satu <input> berbagi
 * id="first_name"), `document.getElementById(id)` mengembalikan elemen PERTAMA
 * (si <div>), sehingga Playwright getByLabel(...).count() == 0. Tapi extractor
 * terlanjur set hasDirectLabel=true -> selector-resolver memilih getByLabel yang
 * tak match -> dry-run gagal.
 *
 * Fix: pada cabang label[for], hanya set hasDirectLabel=true bila id unik dan
 * label->for resolve ke elemen input ini (asosiasi getByLabel dijamin sah).
 * Asosiasi lain yang memang sah (wrapping <label>, aria-label/aria-labelledby)
 * tetap set hasDirectLabel=true.
 *
 * Test ini menjalankan extractor NYATA terhadap fixture DOM terkontrol (browser
 * headless, tanpa jaringan) — bukan mock.
 * Run: node scripts/test-label-association-soundness.js
 */
'use strict';

const assert = require('assert');
const { chromium } = require('playwright');
const { extractCandidatesFromPage } = require('../dist/crawler/dom-candidate-extractor.js');

let passed = 0;
function ok(name, cond) {
  assert.ok(cond, 'FAILED: ' + name);
  passed++;
  console.log('  ✓ ' + name);
}

// Fixture markup. Data URL keeps this network-free and deterministic.
const FIXTURE = `data:text/html,${encodeURIComponent(`
<!doctype html><html><body>
  <!-- Case A: label[for] with DUPLICATE id. getByLabel cannot resolve to the input
       because getElementById returns the <div> first. hasDirectLabel must be false. -->
  <form>
    <label for="first_name">First Name</label>
    <div id="first_name" class="wrapper">
      <input id="first_name" name="customer[first_name]" type="text">
    </div>
  </form>

  <!-- Case B: label[for] with UNIQUE id resolving to the input. Genuine
       association; getByLabel works; hasDirectLabel must be true. -->
  <form>
    <label for="last_name">Last Name</label>
    <input id="last_name" name="customer[last_name]" type="text">
  </form>

  <!-- Case C: wrapping <label> (no for). Genuine association for getByLabel;
       hasDirectLabel must be true. -->
  <form>
    <label>Email<input name="customer[email]" type="email"></label>
  </form>
</body></html>
`)}`;

(async () => {
  console.log('\n[AC-07.13] hasDirectLabel only for sound getByLabel associations');
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  try {
    await page.goto(FIXTURE, { waitUntil: 'domcontentloaded' });

    const cands = await extractCandidatesFromPage(page);
    const input = (name) => cands.find(c => c.tagName === 'input' && c.name === name);

    const first = input('customer[first_name]');
    const last = input('customer[last_name]');
    const email = input('customer[email]');

    ok('extractor found the first_name input', !!first);
    ok('extractor found the last_name input', !!last);
    ok('extractor found the email input', !!email);

    // Cross-check against Playwright's real getByLabel to keep the test honest:
    // whatever hasDirectLabel claims must agree with what getByLabel actually does.
    const firstByLabel = await page.getByLabel(/First Name/i).count();
    const lastByLabel = await page.getByLabel(/Last Name/i).count();
    const emailByLabel = await page.getByLabel(/Email/i).count();

    // Case A: the whole point of the bug. getByLabel finds 0 -> must NOT claim direct label.
    ok('AC-07.13a getByLabel(/First Name/) really finds 0 (duplicate id)', firstByLabel === 0);
    ok('AC-07.13a first_name.hasDirectLabel is false (unsound label[for])', first.hasDirectLabel === false);

    // Case B: unique id -> genuine association preserved.
    ok('AC-07.13b getByLabel(/Last Name/) finds 1', lastByLabel === 1);
    ok('AC-07.13b last_name.hasDirectLabel is true (sound label[for])', last.hasDirectLabel === true);

    // Case C: wrapping label -> genuine association preserved.
    ok('AC-07.13c getByLabel(/Email/) finds 1', emailByLabel === 1);
    ok('AC-07.13c email.hasDirectLabel is true (wrapping label)', email.hasDirectLabel === true);

    console.log('\nAll AC-07.13 tests passed: ' + passed);
  } finally {
    await browser.close();
  }
})().catch((err) => {
  console.error('\n[FAILED]', err.message);
  process.exit(1);
});
