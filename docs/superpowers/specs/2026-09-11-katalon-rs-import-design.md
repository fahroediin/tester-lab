# Design: Import Proyek Katalon (.zip) dengan Resolusi Object Repository (.rs)

Status: Disetujui untuk implementasi
Tanggal: 2026-09-11
Branch acuan: `feat/katalon-import-robust` (lanjutan)

## Konteks & Masalah

Importer `.groovy` saat ini (`public/js/app.js`, `handleImportFile` +
`parseGroovyToSteps`) menerima **satu file** `.groovy`. Untuk skrip Katalon
asli, elemen dirujuk lewat `findTestObject('path/to/object')` — hanya *nama
path* objek. Selector sebenarnya (XPath/CSS/id/placeholder) tersimpan di file
`.rs` (XML `<WebElementEntity>`) terpisah di dalam folder `Object Repository/`.

Akibatnya importer sekarang hanya bisa mengambil **nama objek**
(`cleanObjectName` → `username`), bukan selector yang bisa dijalankan. User yang
mau memigrasikan proyek Katalon existing tidak mendapat selector yang benar.

## Tujuan

User dapat meng-upload **satu file `.zip`** berisi proyek Katalon, memilih
**satu** test case, dan mendapat langkah-langkah di Scenario Builder dengan
**selector semantik yang di-resolve dari file `.rs`** — memanfaatkan 6-tier
matcher dan self-healing Tester Lab.

## Non-Tujuan (YAGNI)

- Tidak mengimpor banyak test case sekaligus (model tetap satu skenario).
- Tidak membaca `Keywords/`, `Profiles/`, `Test Suites/`, `.prj`.
- Tidak menyentuh generator / sisi output / template.
- Tidak mengubah backend, API, atau database.
- Tidak menerima folder-picker maupun multi-file manual (hanya `.zip`).

## Keputusan yang Sudah Diambil

| Keputusan | Pilihan |
|---|---|
| Cara input | Upload `.zip`, di-unzip di client (JSZip) |
| Banyak test case | Deteksi semua, user pilih **satu** |
| Peta selector | Terjemah ke properti semantik dari `.rs` |
| Urutan prioritas selector | placeholder → id → name → text → xpath |

## Arsitektur & Aliran Data

```
User upload .zip
  → handleImportFile mendeteksi .zip → handleKatalonZipImport(file)
  → JSZip.loadAsync → daftar entri
      • Test Cases/**/*.groovy   → daftar test case
      • Object Repository/**/*.rs → index: objectPath → xml string
  → jika >1 test case: Swal picker → user pilih SATU
  → parseGroovyToSteps(groovy, rsResolver)
      • extractTarget menemui findTestObject('path')
      • rsResolver(path) → parseRsSelector(xml) → selector semantik
      • bila gagal resolve → fallback nama objek + warning (perilaku existing)
  → renderSteps + summarizeImportWarnings (existing)
```

Semua perubahan berada di **frontend** (`public/js/app.js`, `public/index.html`).
Backend tidak tersentuh.

## Komponen Baru (pure functions — dapat di-test headless)

### 1. `parseRsSelector(xmlString) → {kind, value} | null`

Input: string XML `<WebElementEntity>` dari satu file `.rs`.
Output: objek selector semantik, atau `null` bila tak ada properti berguna.

Baca semua blok `<webElementProperties>` (name, value, isSelected). Pilih
menurut **urutan prioritas properti di bawah**, bukan menurut flag
`isSelected` Katalon. Ini disengaja: Katalon sering meng-`isSelected` properti
`xpath`, padahal `placeholder`/`id` lebih cocok dengan 6-tier matcher Tester
Lab. Jadi urutan prioritas properti menang; `isSelected` hanya dipakai sebagai
tie-breaker bila satu nama properti muncul lebih dari sekali. Properti dipakai
selama value-nya tidak kosong:

| Prioritas | Properti `.rs` | Selector Tester Lab |
|---|---|---|
| 1 | `placeholder` | `{kind:'getByPlaceholder', value: <placeholder>}` |
| 2 | `id` | `{kind:'css', value:'#'+<id>}` |
| 3 | `name` | `{kind:'css', value:'[name="'+<name>+'"]'}` |
| 4 | `text` / visible text | `{kind:'getByText', value: <text>}` |
| 5 | `xpath` | `{kind:'xpath', value: <xpath yang dinormalisasi>}` |
| — | tak ada | `null` |

Normalisasi XPath khas Katalon: `id("x")` → `//*[@id='x']`. Bila value xpath
sudah diawali `//` atau `/`, pakai apa adanya.

XML di-parse dengan `DOMParser` (tersedia di browser). Untuk test headless,
parser XML sederhana berbasis regex atas blok `<webElementProperties>` cukup —
lihat catatan Testing.

### 2. `buildRsIndex(entries) → Map<objectPath, xmlString>`

Input: daftar `{path, content}` dari zip yang berakhiran `.rs`.
Output: Map dengan key **object-path ternormalisasi**:
- buang prefix `Object Repository/`
- buang akhiran `.rs`
- pisahkan pakai `/`

Contoh: `Object Repository/Login Page/input_username.rs` → key
`Login Page/input_username`.

### 3. `makeRsResolver(rsIndex) → (findTestObjectPath) → {kind,value} | null`

Menerima path dari `findTestObject('...')`, cari di `rsIndex` (cocokkan
persis; bila tidak ketemu, coba cocokkan berbasis suffix segmen terakhir),
lalu `parseRsSelector(xml)`. Return `null` bila tak ketemu / gagal.

### 4. `handleKatalonZipImport(file)` (orchestrator, menyentuh DOM/JSZip)

1. `JSZip.loadAsync(file)`.
2. Kumpulkan entri `Test Cases/**/*.groovy` dan `Object Repository/**/*.rs`.
3. Bila tidak ada `Test Cases/` sama sekali → snackbar error "Bukan proyek
   Katalon yang valid (folder Test Cases tidak ditemukan)."; berhenti.
4. `buildRsIndex` atas semua `.rs`.
5. Bila test case > 1 → Swal picker (daftar nama file/path relatif) → user
   pilih satu. Bila == 1 → langsung pakai.
6. Baca isi `.groovy` terpilih, panggil
   `parseGroovyToSteps(groovy, makeRsResolver(rsIndex))`.
7. Set `steps`, `renderSteps(true)`, isi testSuite/targetUrl seperti jalur
   `.groovy` sekarang, tampilkan `summarizeImportWarnings`.

## Perubahan pada Fungsi Existing (backward-compatible)

- `extractTarget(expr, rsResolver?)` — parameter opsional. Saat menemui
  `findTestObject('path')`: bila `rsResolver` ada **dan** mengembalikan
  selector, gunakan selector itu (set `targetLabel`/tipe sesuai `kind`); bila
  tidak, jatuh ke perilaku sekarang (`cleanObjectName`). Tanpa argumen →
  identik dengan sekarang.
- `parseGroovyToSteps(code, rsResolver?)` — teruskan `rsResolver` ke
  `extractTarget`. Default `undefined` → seluruh 69 assertion existing tetap
  hijau (tanpa resolver, perilaku tak berubah).
- `handleImportFile` — tambah cabang `fileName.endsWith('.zip')` yang memanggil
  `handleKatalonZipImport`.
- `public/index.html` — `accept` pada `#importFileInput` tambah `.zip`; tambah
  `<script src="https://cdnjs.cloudflare.com/ajax/libs/jszip/<versi>/jszip.min.js">`
  mengikuti pola CDN `js-yaml` yang sudah ada.

## Bagaimana selector `.rs` masuk ke step

Step Tester Lab mengenal `targetLabel` + tipe selector (getByPlaceholder,
css, getByText, xpath, dst — sama seperti yang dipakai `parseGroovyToSteps`
saat ini untuk dialek Tester Lab). `parseRsSelector` mengembalikan `kind` yang
langsung dipetakan ke bentuk itu, sehingga step hasil resolve identik
strukturnya dengan step import biasa.

## Error Handling

| Kondisi | Perilaku |
|---|---|
| Zip tanpa `Test Cases/` | Snackbar error, berhenti |
| `.rs` yang dirujuk tak ada di zip | Step dibuat dengan nama objek + warning (jalur existing) |
| `.rs` korup / tak ter-parse | `parseRsSelector` → null → fallback aman + warning |
| `findTestObject` tanpa resolver (import 1 file .groovy lama) | Perilaku sekarang, tak berubah |

## Rencana Testing (TDD)

Semua fungsi pure di-test di `scripts/test-katalon.js` memakai pola
`vm.runInNewContext` yang sudah ada (regex ekstrak fungsi dari `app.js`, eval
di sandbox). Blok tes baru:

- **[8] parseRsSelector** — fixture XML `.rs` nyata (dari CURA
  `input_username.rs`): placeholder ada → getByPlaceholder; hanya id → css `#`;
  hanya name → `[name=...]`; hanya xpath `id("x")` → `//*[@id='x']`; kosong →
  null. Assert prioritas: bila placeholder & id sama-sama ada, placeholder
  menang.
- **[9] buildRsIndex** — daftar entri → key ternormalisasi benar (prefix &
  `.rs` terbuang, nested path utuh).
- **[10] resolver end-to-end** — script berisi
  `findTestObject('Login Page/input_username')` + index berisi `.rs`-nya →
  `parseGroovyToSteps(code, resolver)` menghasilkan step dengan selector dari
  `.rs`, bukan nama objek.
- **Regresi** — seluruh blok [1]–[7] (69 assertion) tetap hijau; panggilan
  `parseGroovyToSteps(code)` tanpa resolver identik dengan sebelumnya.

Catatan parser XML untuk test headless: `DOMParser` tak tersedia di Node vm.
`parseRsSelector` menerima XML sebagai string dan mengekstrak
`<webElementProperties>` via regex tolerant (tanpa dependency), sehingga logika
yang sama jalan di browser maupun di test. (Bila kelak perlu DOMParser di
browser, itu penyempurnaan terpisah — regex sudah cukup untuk format `.rs`.)

Bagian yang menyentuh JSZip/DOM/Swal (`handleKatalonZipImport`, cabang di
`handleImportFile`, `index.html`) tidak di-test headless; dijaga tipis dan
hanya memanggil fungsi pure yang sudah teruji. Verifikasi manual: upload zip
proyek Katalon contoh, pastikan picker muncul dan step ter-resolve.

## File yang Disentuh

- `public/js/app.js` — 4 fungsi baru + 2 fungsi existing diberi parameter
  opsional + 1 cabang di `handleImportFile`.
- `public/index.html` — `accept` + `<script>` JSZip.
- `scripts/test-katalon.js` — blok tes [8]–[10].

## Urutan Implementasi (TDD)

1. RED+GREEN `parseRsSelector` (blok [8]).
2. RED+GREEN `buildRsIndex` (blok [9]).
3. RED+GREEN resolver + `extractTarget`/`parseGroovyToSteps` param opsional
   (blok [10]); pastikan [1]–[7] tetap hijau.
4. Wiring non-testable: `handleKatalonZipImport`, cabang `.zip`, `index.html`,
   JSZip CDN.
5. Verifikasi manual dengan zip contoh + `npm test` penuh hijau.
