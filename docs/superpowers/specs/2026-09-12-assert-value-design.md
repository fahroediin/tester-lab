# Design: assert_value — verifikasi nilai (value) sebuah field

Status: Disetujui untuk implementasi
Tanggal: 2026-09-12
Repo: tester-lab-oss (POC)
Rujukan BA: Doc_BA_Tester-Lab_1.xlsx — US-07, AC-07.05 s.d. AC-07.10

## Konteks & Masalah

Assertion yang ada (`assert_url`, `assert_text`, `assert_visible`) semuanya
berbasis teks node / URL / visibilitas. Nilai yang tersimpan di atribut
`value` sebuah `<input>` (mis. field terisi otomatis, hasil perhitungan)
tidak terlihat oleh `getByText`/`toContainText` — Playwright hanya membaca
teks node, bukan `value`. Akibatnya "validasi field berisi X" tidak bisa
dilakukan; percobaan lewat assert_text/assert_visible dapat skor 0 dan gagal
walau nilai jelas ada di layar (kasus nyata: `<input readonly value="Rp 800.000">`).

Tambah aksi DSL `assert_value`: verifikasi sebuah field memuat nilai tertentu,
dengan **contains match**, membaca `value` walau field disabled/readonly.

## Keputusan

| Keputusan | Pilihan |
|---|---|
| Bentuk | Aksi DSL baru `assert_value` (aksi ke-11) |
| Match | Contains (value MEMUAT nilai diharapkan), case-insensitive |
| Primitive | Playwright `toHaveValue(new RegExp(escaped, 'i'))` |
| Field disabled/readonly | Tetap dibaca (toHaveValue tak butuh elemen enabled) |
| Penemuan field | Via matcher yang ada (label/aria-label/testId/role) |
| Framework | Playwright TS/JS; lain best-effort/diabaikan (POC) |

## AC -> perilaku (traceability)

| AC | Perilaku |
|---|---|
| AC-07.05 | Generate: field target -> script `toHaveValue` contains |
| AC-07.06 | Run: value memuat nilai -> langkah lolos |
| AC-07.07 | Run: field disabled/readonly -> value tetap terbaca, lolos |
| AC-07.08 | Run: value tak memuat -> gagal, pesan verbatim |
| AC-07.09 | Run: field tak ditemukan -> gagal, pesan verbatim |
| AC-07.10 | Run: cocok sebagian (contains) -> lolos |

## Pesan runtime (verbatim, AC-07.08/09)

- Mismatch (AC-07.08):
  `Field "<label>" value "<actual>" does not contain the expected "<expected>".`
- Not found (AC-07.09):
  `No field labeled "<label>" was found on the page.`

`<actual>` diisi value field yang terbaca; `<label>` = teks target yang
dipakai user; `<expected>` = nilai yang diharapkan.

## Arsitektur & Aliran

```
DSL step { action: 'assert_value', targetLabel: 'Total', expected: '1.500' }
  -> Validator: assert_value butuh (targetLabel/selector) DAN expected; else invalid
  -> Matcher: assert_value lewat jalur pencarian elemen biasa (seperti assert_text)
     -> field ditemukan via 6-tier (getByLabel/aria-label/testId/role/placeholder)
  -> Generator (template): render sesuai selectorType, teruskan expected ke
     maestro.interact(locator, 'assert_value', undefined, expected)
  -> maestro.interact cabang 'assert_value':
       count = await locator.count()
       if (count === 0) throw `No field labeled "<label>" ...`
       actual = await locator.first().inputValue()   // membaca value, incl. disabled/readonly
       if (!new RegExp(escape(expected),'i').test(actual))
          throw `Field "<label>" value "<actual>" does not contain the expected "<expected>".`
```

Catatan teknis: `locator.inputValue()` di Playwright membaca `value` sebuah
input/textarea/select termasuk yang `disabled`/`readonly` — sesuai AC-07.07.
`toHaveValue` juga bisa, tapi memakai `inputValue()` + regex test memberi kita
kontrol atas pesan error yang verbatim (AC-07.08 butuh menyertakan actual).

## Perubahan

### Tipe & Validasi
1. `dsl-validator.ts`: tambah `'assert_value'` ke `DSLActionSchema`; aturan
   validasi: butuh target (targetLabel) dan `expected` (nilai diharapkan).
2. `types/index.ts`: `DSLAction` menyertakan `assert_value` (jika union eksplisit).

### Matcher
3. `heuristic-matcher.ts`: `assert_value` diperlakukan seperti assert_text —
   cari field dari targetLabel via 6-tier; `expected` dibawa ke ResolvedStep.
   (Tidak perlu special-case seperti assert_url; field adalah elemen nyata.)

### Generator (template)
4. `maestro.interact` (playwright-ts.hbs & -js.hbs): tambah tipe aksi
   `'assert_value'` + cabang yang membaca `inputValue()` dan melempar pesan
   AC-07.08/09. Simpan `<label>` (teks target) untuk pesan.
5. Blok `{{#if (eq action "assert_value")}}` di template: render per selectorType
   (getByLabel/getByTestId/getByRole/getByPlaceholder/locator), meneruskan
   expected, mirror struktur blok assert_text.

### UI
6. `app.js` + Scenario Builder: tambah opsi "Assert Value" di dropdown action;
   field target + field "Expected Value". (Tahap terpisah, seperti tahap UI
   fitur lain.)

## Rencana Testing (TDD)

Karena inti assert_value adalah string yang di-generate + logika runtime,
yang bisa diuji headless:
- Generator end-to-end (pola test-code-generator.js): step assert_value ->
  kode memuat `assert_value` + `inputValue()`/`toHaveValue`, expected ter-escape
  aman, dan struktur per selectorType benar. TS + JS.
- Validator: assert_value tanpa expected -> invalid; dengan target+expected ->
  valid.
- Fungsi pure escape nilai (jika diekstrak) untuk regex contains.

Bagian runtime (membaca inputValue field disabled, pesan AC-07.08/09 saat run,
contains match) tidak dapat diuji tanpa browser + halaman nyata; diverifikasi
manual dengan halaman yang punya field readonly berisi nilai berformat
(mis. "Rp 1.500").

Regresi: seluruh suite tetap hijau; aksi lain tak berubah.

## Batasan POC

- Playwright TS/JS penuh; framework lain best-effort/diabaikan.
- Contains match saja (opsi exact tidak dibuat sekarang; keputusan user).
- Field non-input (mis. teks node) di luar cakupan assert_value — itu ranah
  assert_text.

## Urutan Implementasi

1. Validator: assert_value + aturan (TDD).
2. Matcher: assert_value cari field (reuse jalur assert_text).
3. Template TS/JS: cabang maestro.interact + blok render + pesan verbatim.
4. Generator end-to-end test (TS+JS, dengan/tanpa expected, regresi).
5. UI action "Assert Value" + field Expected.
6. Verifikasi manual + full test hijau.
