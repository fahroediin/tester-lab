/*
 * Within scope untuk container form (bukan hanya tabel/list).
 *
 * DOM SPK: label + input(disabled) + tombol "Edit field ini" (title SAMA untuk
 * semua field) berada dalam satu <div> grup, BUKAN <tr>/<li>/[role=row]. Scope
 * lama (scopedRow) hanya kenal row, jadi "Click Edit within Tanggal Order"
 * gagal. Test ini menuntut runtime helper scopeFor(marker, buildTarget) memilih
 * container TERKECIL yang mengandung penanda DAN elemen target, lalu menyasar
 * target di dalamnya — tanpa merusak kasus tabel.
 *
 * Run: node scripts/test-scoped-within-form.js
 */
'use strict';

const assert = require('assert');
const { chromium } = require('playwright');
const { scopeFor } = require('../dist/server/services/scope-helper.js');

let passed = 0;
function ok(name, cond) {
  assert.ok(cond, 'FAILED: ' + name);
  passed++;
  console.log('  ✓ ' + name);
}

const FIXTURE = `data:text/html,${encodeURIComponent(`
<!doctype html><html><body>
  <!-- Setia ke DOM SPK: tombol title-only, SVG aria-hidden, accessible name = title -->
  <form>
    <div class="grp" data-f="order_date">
      <label>Tanggal Order</label>
      <input disabled name="order_date" type="date" value="2026-09-18">
      <button type="button" title="Edit field ini"><svg aria-hidden="true" width="16" height="16"></svg></button>
    </div>
    <div class="grp" data-f="customer">
      <label>Nama Pelanggan</label>
      <input disabled name="customer" type="text" value="PT LAMA">
      <button type="button" title="Edit field ini"><svg aria-hidden="true" width="16" height="16"></svg></button>
    </div>
    <div class="grp" data-f="material">
      <label>Nama Material</label>
      <input disabled name="material" type="text" value="BATU">
      <button type="button" title="Edit field ini"><svg aria-hidden="true" width="16" height="16"></svg></button>
    </div>
  </form>

  <!-- Kasus tabel: scope row lama harus tetap jalan -->
  <table><tbody>
    <tr><td>260918-0006</td><td><button title="Edit field ini"><svg aria-hidden="true"></svg></button></td></tr>
    <tr><td>260918-0007</td><td><button title="Edit field ini"><svg aria-hidden="true"></svg></button></td></tr>
  </tbody></table>
</body></html>
`)}`;

(async () => {
  console.log('\n[within-form] scopeFor container div + tabel');
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  try {
    await page.goto(FIXTURE, { waitUntil: 'domcontentloaded' });

    // Target di grup "Tanggal Order": tombol Edit yang BENAR (dekat order_date).
    const btn = scopeFor(page, 'Tanggal Order', (root) => root.getByRole('button', { name: /edit field ini/i }));
    ok('within form: tepat 1 tombol Edit ter-scope', (await btn.count()) === 1);
    // Klik lalu pastikan field order_date yang ter-enable (uji identitas grup).
    // Handler: klik tombol -> hapus disabled pada input di grup yang sama.
    await page.evaluate(() => {
      document.querySelectorAll('.grp button').forEach((b) => {
        b.addEventListener('click', () => {
          const input = b.parentElement.querySelector('input');
          if (input) input.removeAttribute('disabled');
        });
      });
    });
    await btn.click();
    const orderEnabled = await page.locator('input[name="order_date"]').isEnabled();
    const customerEnabled = await page.locator('input[name="customer"]').isEnabled();
    ok('grup benar ter-enable (order_date)', orderEnabled === true);
    ok('grup lain tetap disabled (customer)', customerEnabled === false);

    // Marker beda -> tombol beda.
    const btn2 = scopeFor(page, 'Nama Material', (root) => root.getByRole('button', { name: /edit field ini/i }));
    ok('within form marker lain: tepat 1 tombol', (await btn2.count()) === 1);

    // Kasus tabel: scope row lama tetap jalan.
    const rowBtn = scopeFor(page, '260918-0006', (root) => root.getByRole('button', { name: /edit field ini/i }));
    ok('within row (tabel) tetap: tepat 1 tombol', (await rowBtn.count()) === 1);

    // Penanda tak ada -> 0 (untuk pesan not-found AC-36.04).
    const none = scopeFor(page, 'Tidak Ada Field Ini', (root) => root.getByRole('button', { name: /edit field ini/i }));
    ok('penanda tak ada -> 0', (await none.count()) === 0);

    console.log('\nAll within-form tests passed: ' + passed);
  } finally {
    await browser.close();
  }
})().catch((err) => {
  console.error('\n[FAILED]', err.message);
  process.exit(1);
});
