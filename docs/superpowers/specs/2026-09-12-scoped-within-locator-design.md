# Design: Scoped Locator (`within`) — target elemen di dalam baris/kartu bertanda

Status: Disetujui untuk implementasi
Tanggal: 2026-09-12
Repo: tester-lab-oss (POC)
Rujukan BA: Doc_BA_Tester-Lab_1.xlsx — US-36, AC-36.01 s.d. AC-36.06

## Konteks & Masalah

Di halaman tabular (tabel/daftar), tiap baris sering punya kontrol yang identik
(tombol aksi, menu titik-tiga, link). Matcher Tester Lab memilih elemen dari
label/teks/role; saat ada banyak kandidat identik ia memakai disambiguasi
posisi (top-left), sehingga selalu mengenai baris pertama — bukan baris yang
dimaksud. Tidak ada cara menyatakan "elemen X di dalam baris yang memuat teks
Y".

US-36 menambah kemampuan itu: penanda scope yang mengunci elemen ke baris/kartu
berdasarkan teks penanda unik (mis. No. SPK), tahan terhadap perubahan urutan
baris.

## Keputusan: field & filosofi resolusi

### Field DSL

Penanda disimpan di `options.within` pada step (string). Tidak menambah aksi
baru; 10 aksi DSL tetap. `within` opsional dan berlaku untuk semua aksi yang
menargetkan elemen (click, fill, select, check, uncheck, upload, assert_*).

```
{ action: 'click', targetLabel: 'tombol aksi', options: { within: '260911-0003' } }
```

### Filosofi resolusi: RESOLUSI SAAT GENERATE (bukan saat matching)

Dua pilihan dipertimbangkan:

1. **Saat matching (heuristik penuh)** — DOM extractor menandai tiap kandidat
   dengan teks baris/ancestor-nya; matcher menyaring kandidat ke baris yang
   cocok lalu skor 6-tier. Konsisten dengan engine, tapi menyentuh extractor +
   matcher + scoring + dry-run, dan menautkan resolusi ke satu snapshot DOM
   (rapuh bila baris berubah antara generate dan run).

2. **Saat generate (locator relatif framework) — DIPILIH.** DSL `within: "Y"`
   diterjemahkan menjadi locator relatif yang dievaluasi framework **saat run**:
   Playwright `page.getByRole('row', { name: /Y/ }).<inner>`. Matcher tidak
   berubah; scoping terjadi di runtime.

Alasan memilih (2):
- **Memenuhi AC-36.03 (identitas bukan posisi) secara alami**: locator dievaluasi
  saat run, jadi baris dicari ulang tiap eksekusi. Baris bergeser tetap kena.
  Pendekatan (1) mengunci ke snapshot generate, justru melawan AC-36.03.
- **Lebih kecil & terisolasi**: sentuh generator/template + validator, bukan
  extractor/matcher/scoring.
- **Memetakan langsung ke primitive framework** yang memang dirancang untuk ini
  (`getByRole('row', {name})`, `filter({ hasText })`).

Konsekuensi yang diterima: elemen ber-`within` tidak melewati 6-tier scoring
untuk pemilihan baris (baris dipilih oleh framework saat run). Target di dalam
baris tetap memakai strategi selector normal (getByRole/getByText/dst), hanya
dibungkus scope baris.

## Arsitektur & Aliran

```
DSL step { action, targetLabel, options.within: "Y" }
   -> Validator: within opsional string; kosong/absen = perilaku lama
   -> Resolver: resolusi target seperti biasa (selectorType + selectorValue)
   -> Generator (template): bila within ada, bungkus locator target dengan
      scope baris:
        base = page.getByRole('row', { name: /Y/i })   (fallback ke
               page.locator('tr,li,[role=row]').filter({ hasText: 'Y' }))
        locator = base.<inner locator dari selectorType>
      bila within tidak ada -> locator seperti sekarang (tak berubah)
   -> maestro.interact(locator, action, ...) TIDAK berubah
```

### Penanganan runtime (di helper template `maestro`)

- **AC-36.04 tidak ditemukan**: bila scope baris menghasilkan 0 elemen, langkah
  gagal dengan pesan persis:
  `No row containing "Y" was found on the page.`
- **AC-36.05 tidak unik**: bila scope baris cocok >1 baris, langkah gagal dengan
  pesan persis:
  `Scope marker "Y" matched more than one row. Use a unique value such as an ID so the step targets exactly one row.`
  (Cukup deteksi >1; berhenti pada baris kedua.)
- **AC-36.03 posisi berubah**: tidak perlu penanganan khusus; locator relatif
  dievaluasi saat run sehingga otomatis mengikuti posisi baru.
- **AC-36.06 within kosong**: generator menghasilkan locator biasa tanpa scope.

## AC -> perilaku (traceability)

| AC | Perilaku yang diimplementasi |
|---|---|
| AC-36.01 | Generator membungkus target dengan scope baris ber-teks within |
| AC-36.02 | Dua langkah berurutan; langkah kedua target biasa (item menu) |
| AC-36.03 | Locator relatif dievaluasi saat run (identitas, bukan posisi) |
| AC-36.04 | Runtime helper: 0 baris -> gagal + pesan "No row containing ..." |
| AC-36.05 | Runtime helper: >1 baris -> gagal + pesan "matched more than one row ..." |
| AC-36.06 | within kosong/absen -> locator biasa, tanpa scope |

## Perubahan

### Tipe & Validasi
1. `src/types/index.ts`: `StepOptions.within?: string`.
2. `src/validator/dsl-validator.ts`: `within` opsional string; normalisasi trim;
   string kosong diperlakukan sebagai tidak ada scope.

### Generator (fungsi pure yang dapat diuji headless)
3. `src/generator/` : fungsi murni `buildScopedLocatorExpr(selectorExpr, within)`
   yang mengembalikan ekspresi locator string:
   - within kosong -> kembalikan `selectorExpr` apa adanya.
   - within ada -> kembalikan ekspresi bungkus baris + inner. Ini yang paling
     penting diuji (banyak cabang: escape kutip, regex-escape teks within).
4. Template `playwright-ts.hbs` (dan `-js`): saat step punya `within`, render
   locator terscope memakai helper runtime baru `maestro.scopedRow(within)`
   yang mengembalikan Locator baris tunggal atau melempar error dengan pesan
   AC-36.04/05.

### Runtime helper (template)
5. `maestro.scopedRow(withinText)` di template: cari baris via
   `getByRole('row', {name})` lalu fallback `locator('tr,li,[role=row]').filter({hasText})`;
   hitung, lempar pesan yang sesuai bila 0 atau >1.

### Cakupan framework (POC)
6. Implementasi penuh untuk **Playwright TS/JS** (framework yang dieksekusi
   server). Framework lain (Cypress, Selenium, Robot, Katalon): untuk POC,
   `within` boleh diabaikan dengan komentar peringatan di output, ATAU
   diterjemahkan best-effort. Keputusan detail per-framework dibuat saat
   implementasi; prioritas Playwright.

### UI
7. `public/index.html` + `public/js/app.js`: field opsional "Within (baris
   bertanda)" pada editor step, tersimpan ke `options.within`. Kosong = perilaku
   lama.

## Rencana Testing (TDD)

Logika pure diuji headless (pola suite yang ada):
- `buildScopedLocatorExpr`:
  - within kosong/absen -> selectorExpr tak berubah (AC-36.06).
  - within ada -> ekspresi memuat scope baris + inner (AC-36.01).
  - teks within dengan kutip/karakter regex -> ter-escape aman.
- Validator: `within` opsional; string kosong dinormalisasi jadi tak ada;
  within valid diteruskan.
- Generator end-to-end (fixture step ber-within) -> kode memuat pola
  `getByRole('row'` + target, dan langkah tanpa within tetap seperti sebelumnya
  (regresi).

Bagian runtime (`scopedRow` melempar pesan AC-36.04/05, perilaku posisi
berubah AC-36.03) tidak dapat diuji tanpa browser + halaman nyata; diverifikasi
manual dengan halaman tabel contoh (satu penanda unik, satu tak ada, satu tak
unik).

Regresi: seluruh suite yang ada tetap hijau; langkah tanpa `within` menghasilkan
kode identik dengan sebelum perubahan.

## Batasan POC (eksplisit)

- Resolusi saat generate; elemen ber-within tidak lewat 6-tier scoring untuk
  pemilihan baris.
- Prioritas eksekusi Playwright; framework lain best-effort/diabaikan.
- Tidak ada perubahan pada extractor/matcher/scoring.

## Urutan Implementasi

1. `buildScopedLocatorExpr` + tes (TDD).
2. `StepOptions.within` + validator + tes.
3. Template Playwright TS/JS: render locator terscope + helper `scopedRow`.
4. Generator end-to-end test (dengan/ tanpa within, cek regresi).
5. UI field `within` di Scenario Builder.
6. Verifikasi manual dengan halaman tabel contoh + full test hijau.
