# US-07 — Perbaikan generate/dry-run: AC-07.11, AC-07.12, AC-07.13

Status: AC-07.11, AC-07.12 & AC-07.13 selesai (test GREEN, verifikasi end-to-end).
Tanggal: 2026-09-17
Induk: **US-07 — Membuat Scenario dari DSL**
Area: Engine / Generator + Template Playwright
Tipe: Bug fix

> Penomoran: perbaikan ini menempel di US-07 (generate + dry-run). AC terakhir
> US-07 di `doc_ba/Doc_BA_Tester-Lab_1.xlsx` adalah AC-07.10, jadi AC baru mulai
> **AC-07.11**. (US-30 di file BA sudah dipakai untuk "Mengatur Sample Scenario";
> jangan dipakai untuk ini.)

---

## Latar: satu keluhan, tiga akar berbeda

Gejala awal: generate scenario "Create and Login" pada
`https://sauce-demo.myshopify.com/` gagal dengan "Generation Failed". Investigasi
sistematis mengungkap bahwa itu adalah **kegagalan dry-run**, bukan gagal
matching — dan di baliknya ada TIGA masalah berlapis yang baru terlihat satu per
satu setiap kali lapisan di atasnya diperbaiki:

1. **AC-07.11** — assert_visible memilih elemen tersembunyi (teks duplikat).
2. **AC-07.12** — klik tak menunggu navigasi, step berikut jalan di halaman lama.
3. **AC-07.13** — getByLabel gagal pada field yang labelnya tak terasosiasi sah /
   id duplikat.

Pemicu eksternal: situs target adalah demo Shopify publik dengan markup yang
berubah dan cacat (id duplikat, label tanpa `for`). Namun ketiga celah ini nyata
di engine dan akan berulang pada situs lain.

---

## AC-07.11 — assert_visible mengutamakan elemen yang terlihat  [SELESAI]

**GIVEN** saya QA Engineer AND ada step `assert_visible` menargetkan label yang
muncul pada dua elemen berteks/berlabel sama, satu terlihat dan satu tersembunyi,
**WHEN** saya menekan "Generate Script" lalu dry-run berjalan,
**THEN** assertion menyasar elemen yang **terlihat** dan tidak gagal palsu karena
kembaran tersembunyi. State: enhancement.

Root cause: generated code menegakkan `expect(locator.first()).toBeVisible()`.
`.first()` mengambil elemen pertama DOM (bisa hidden).

Fix (template Playwright):
- TS ([src/templates/playwright-ts.hbs](../src/templates/playwright-ts.hbs), helper `interact`):
  `assert_visible` menyaring `locator.filter({ visible: true })` dulu, fallback ke
  `.first()` bila tak ada yang visible.
- JS ([src/templates/playwright-js.hbs](../src/templates/playwright-js.hbs)):
  tiap cabang selector `assert_visible` memakai `.filter({ visible: true }).first()`.

Test: [scripts/test-assert-visible-priority.js](../scripts/test-assert-visible-priority.js) (4 assertion, GREEN).
Verifikasi end-to-end: Step 2 dry-run yang dulu gagal, kini **lolos**.

---

## AC-07.12 — klik menunggu navigasi sebelum step berikutnya  [SELESAI]

**GIVEN** saya QA Engineer AND sebuah step `click` menyasar link/tombol yang
memicu navigasi halaman penuh AND diikuti step lain (mis. `fill`),
**WHEN** dry-run berjalan,
**THEN** step berikutnya dijalankan setelah halaman tujuan termuat, bukan pada
halaman lama. State: enhancement.

Root cause: `click({ force: true })` tidak diikuti penungguan; step `fill`
berikutnya jalan saat browser masih di halaman sebelumnya.

Fix (template Playwright): setelah `click`, tambah penungguan **terjaga**:
`await page.waitForLoadState('domcontentloaded', { timeout: 3000 }).catch(() => {})`
— tidak menggantung bila klik tak memicu navigasi (TS helper `interact` + JS blok click).

Test: [scripts/test-click-await-navigation.js](../scripts/test-click-await-navigation.js) (3 assertion, GREEN).
Verifikasi end-to-end: setelah fix, snapshot dry-run menunjukkan halaman register
**benar termuat** (heading "Create Account", field "First Name" hadir).

---

## AC-07.13 — Field tetap ter-locate saat label rusak atau id ganda  [SELESAI]

**GIVEN** saya QA Engineer AND ada field input yang punya `<label for="X">` tetapi
`id="X"` duplikat (dipakai elemen non-input lebih dulu di DOM), sehingga Playwright
`getByLabel` tak bisa mencocokkannya, **WHEN** saya generate script lalu dry-run
berjalan, **THEN** generated code memakai selector andal (`[name=...]`/CSS unik),
bukan `getByLabel` yang gagal me-locate. State: enhancement.

Masalah (dibuktikan langsung via Playwright pada `/account/register` sauce-demo):
- `getByLabel(/First Name/i)` -> count 0 (tidak ketemu)
- `locator('#first_name')` -> count 2 (ambigu: `<div id="first_name">` + `<input id="first_name">`)
- Selector andal yang sebenarnya: `input[name="customer[first_name]"]`

Root cause: `dom-candidate-extractor` menandai `hasDirectLabel=true` begitu ada
`label[for="id"]`, tanpa memeriksa apakah `id` unik dan `for` benar resolve ke
input INI. Karena `id="first_name"` duplikat, `getElementById("first_name")`
mengembalikan `<div>` (elemen pertama di DOM), bukan input — sama persis dengan
cara Playwright `getByLabel` me-resolve `for`, sehingga count 0. Namun
`hasDirectLabel=true` terlanjur membuat
[src/matcher/selector-resolver.ts](../src/matcher/selector-resolver.ts) (baris ~45)
memilih `getByLabel`. Ada **ketidakcocokan antara deteksi label extractor dan
perilaku getByLabel Playwright**.

Fix (extractor, bukan resolver — hanya extractor yang punya akses DOM untuk
mendeteksi id duplikat): pada cabang `label[for]` di
[src/crawler/dom-candidate-extractor.ts](../src/crawler/dom-candidate-extractor.ts),
`hasDirectLabel=true` hanya di-set bila `id` unik (`querySelectorAll('[id=X]')
.length === 1`) DAN `getElementById(id) === htmlEl`. `labelText` tetap disimpan
untuk scoring. Asosiasi sah lain (wrapping `<label>`, `aria-label`/
`aria-labelledby`) tak berubah. Resolver tak perlu diubah: dengan
`hasDirectLabel=false`, fall-through-nya sudah memilih `input[name=...]`.

Test: [scripts/test-label-association-soundness.js](../scripts/test-label-association-soundness.js)
(9 assertion, GREEN; red-green terverifikasi — revert fix -> RED, restore -> GREEN).
Fixture DOM terkontrol mereproduksi id-duplikat, dan tiap klaim `hasDirectLabel`
di-cross-check dengan `page.getByLabel(...).count()` yang sesungguhnya.
Verifikasi end-to-end pada halaman nyata: `first_name` kini
`hasDirectLabel=false`, resolver menghasilkan `input[name="customer[first_name]"]`,
selector itu match tepat 1 elemen di halaman.

Regresi: test-code-generator (167), test-suites (166), test-katalon (119),
security-checks (62), AC-07.11 (4), AC-07.12 (3) semua tetap GREEN.

---

## Di luar cakupan

- Tidak mengubah scoring-engine maupun matcher (AC-07.11/12 lewat template;
  AC-07.13 lewat extractor).
- Tidak mengubah timeout dry-run 2000ms.
- AC-07.13 tidak mengubah `selector-resolver` maupun `labelText` (dipakai scoring);
  hanya memperketat kapan `hasDirectLabel` di-set di extractor.
