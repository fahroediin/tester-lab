# Tester Lab: Non-LLM Automated Test Script Generator

**Sistem Generator Script Testing Otomatis Berbasis Rule & Heuristic DOM Matching (Deterministik, Tanpa LLM)**

`tester-lab` adalah engine otomatisasi yang menghasilkan *end-to-end test script* (seperti Playwright TypeScript / JavaScript) secara otomatis berdasarkan file skenario aturan bisnis (**JSON DSL**), tanpa bergantung pada Large Language Model (LLM).

---

## Mengapa Tanpa LLM?

1. **Deterministik & Dapat Diprediksi (100% Consistent):** Hasil generasi script selalu konsisten untuk input bisnis yang sama. Tidak ada risiko halusinasi selector atau sintaks kode.
2. **Kepatuhan Privasi & Keamanan Data (Zero Data Leakage):** Struktur DOM internal, atribut halaman web, dan data sensitif tidak dikirim ke API pihak ketiga.
3. **Performa Tinggi (< 1 Detik):** Ekstraksi & pencocokan heuristik berbasis memori lokal berjalan dalam hitungan milidetik, jauh lebih cepat dibanding latensi inferensi LLM.
4. **Biaya Operasional Nol (Zero API Cost):** Tanpa langganan API berulang, tanpa kuota token.

---

## Fitur Unggulan Terbaru

1. **Robust Action Helper untuk Form Dinamis (OutSystems Support)**
   Jika sebuah halaman memiliki form kompleks (seperti pada platform OutSystems) di mana elemen input tidak terhubung langsung secara semantik dengan labelnya, engine secara otomatis akan mendeteksi skenario fallback ini. Code generator kemudian akan menyuntikkan *helper function* khusus (`action()`) yang mencari elemen berdasarkan hubungan hierarkis (ancestor div) dengan teks label visualnya, menjamin eksekusi Playwright yang *robust* terhadap elemen UI yang dinamis.

2. **Web UI: Import JSON Flow**
   Sekarang Anda dapat mengimpor file alur pengujian JSON yang kompleks (misalnya `examples/newloan-flow.json`) secara instan ke dalam **Scenario Builder** pada antarmuka Web UI. Konfigurasi langkah pengujian akan otomatis dimuat dan siap untuk di-generate ulang!

---

## Arsitektur & Alur Kerja Sistem

```text
  [Input Layer: File Business Rule JSON / DSL]
                       │
                       ▼
  [Module 1: DSL Validator (Zod Schema)]
                       │
                       ▼
  [Module 2: Interactive DOM Crawler & Extractor (Playwright)]
   - Buka URL Target via Headless Browser
   - Ekstrak Interactive DOM, Accessibility Tree, & State Transitions
                       │
                       ▼
  [Module 3: Heuristic & Scoring Matcher Engine]
   - Match targetLabel vs DOM candidates via Deterministik Scoring Matrix
   - Rank candidates & resolve ambiguity via visual bounding box
                       │
                       ▼
  [Module 4: Code Transpiler & Generator Engine (Handlebars + Prettier)]
   - Injeksi resolved steps ke template Playwright (.spec.ts / .spec.js)
   - Format kode otomatis menggunakan Prettier API
                       │
                       ▼
  [Module 5: Dry-Run & Self-Healing Engine]
   - Eksekusi headless otomatis pasca-generasi
   - Auto-healing fallback ke Rank 2 candidate jika selector bermasalah
                       │
                       ▼
   [Output Artifact: File Script Testing (.spec.ts / .spec.js)]
```

---

## Matriks Bobot Skoring Heuristik

Pencocokan elemen dilakukan menggunakan matriks bobot deterministik untuk menentukan selector terbaik (*locator strategy*):

| Match Criteria / Rule | Skor Bobot | Locator Strategy Terpilih | Description & Stability |
| :--- | :---: | :--- | :--- |
| **Rule 1: Direct Test ID Match** | **100** | `page.getByTestId(...)` | Match exact `data-testid`, `data-qa`, `data-cy`. Kebal perubahan UI. |
| **Rule 2: Associated Label Match** | **85 - 90** | `page.getByLabel(...)` | Match exact/partial `<label for="...">` terhubung. Standar aksesibilitas tinggi. |
| **Rule 3: Accessibility Role & Name Match** | **75 - 80** | `page.getByRole(...)` | Match ARIA Role (`button`, `textbox`, `checkbox`) & ARIA Name/innerText. |
| **Rule 4: Placeholder / Aria-Label Match** | **70** | `page.getByPlaceholder(...)` | Match atribut `placeholder` atau `aria-label`. |
| **Rule 5: InnerText / Visual Text Match** | **60 - 65** | `page.getByText(...)` | Match teks visual yang terlihat di layar (`innerText`). |
| **Rule 6: Fuzzy Levenshtein Distance Match** | **30 - 50** | `page.locator('text=...')` | Toleransi perbedaan ejaan (misal: `"User Name"` vs `"Username"`). |

---

## Prasyarat & Instalasi

### Prasyarat
- **Node.js**: `v18.x` atau `v20+` LTS
- **NPM**: `v9.x` atau `v10+`

### Instalasi Dependensi
```bash
# Clone repositori dan install dependensi
npm install

# Install browser binary Playwright Chromium
npx playwright install chromium
```

### Build Project
```bash
npm run build
```

---

## Format File DSL Input (`login-flow.json`)

Pengguna mendefinisikan alur pengujian dalam format JSON sederhana:

```json
{
  "testSuite": "Login Authentication Test",
  "targetUrl": "http://localhost:4000/login",
  "framework": "playwright",
  "language": "typescript",
  "steps": [
    {
      "step": 1,
      "action": "fill",
      "targetLabel": "Email / Username",
      "value": "user@example.com",
      "description": "Isi kolom login pengguna"
    },
    {
      "step": 2,
      "action": "fill",
      "targetLabel": "Kata Sandi",
      "value": "P@ssword123",
      "description": "Isi password pengguna"
    },
    {
      "step": 3,
      "action": "click",
      "targetLabel": "Masuk Ke Akun",
      "description": "Klik tombol login"
    },
    {
      "step": 4,
      "action": "assert_url",
      "expected": "/dashboard",
      "description": "Verifikasi URL beralih ke dashboard"
    },
    {
      "step": 5,
      "action": "assert_text",
      "targetLabel": "Header Dashboard",
      "expected": "Selamat Datang Kembali",
      "description": "Verifikasi teks salam pembuka muncul"
    }
  ]
}
```

---

## Penggunaan CLI (Command Line Interface)

### 1. Generasi Test Script dengan Verifikasi Dry-Run
```bash
node dist/cli/index.js generate --config ./examples/login-flow.json --out ./tests/login.spec.ts --dry-run
```

**Output Log CLI:**
```text
[Crawler] Navigating to http://localhost:4000/login & inspecting state transition DOM elements...
[Crawler] Completed extraction & heuristic matching for 5 steps.
[Generator] Emitting code string via Handlebars & Prettier...
[Dry-Run] Executing generated script in headless mode for verification...

================ GENERATION SUMMARY ================
[PASS] Step 1 (fill): Matched 'Email / Username' via getByTestId('email-input') with score 95
[PASS] Step 2 (fill): Matched 'Kata Sandi' via getByTestId('password-input') with score 95
[PASS] Step 3 (click): Matched 'Masuk Ke Akun' via getByTestId('btn-login') with score 85
[PASS] Step 4 (assert_url): Matched '/dashboard' via url('dashboard') with score 100
[PASS] Step 5 (assert_text): Matched 'Header Dashboard' via getByTestId('dashboard-header') with score 100
[Output] Script saved to file: ./tests/login.spec.ts

================ DRY-RUN RESULT ================
Dry-Run Verification Passed!
```

### 2. Inspeksi Elemen DOM dari URL Target
```bash
node dist/cli/index.js inspect --url http://localhost:4000/login
```

---

## Penggunaan REST API Service

Anda juga dapat menjalankan generator ini sebagai layanan web (REST API):

```bash
# Jalankan REST API Server
npm run start
```
Server akan berjalan di `http://localhost:3000`.

### Endpoints:
1. **`POST /api/v1/generate-script`**
   - **Payload:**
     ```json
     {
       "dsl": { ... DSLConfig JSON ... },
       "dryRun": true,
       "outPath": "./tests/api_generated.spec.ts"
     }
     ```
   - **Response:** Returns `code`, `resolvedSteps`, `warnings`, `logs`, dan `dryRunPassed`.

2. **`POST /api/v1/inspect-dom`**
   - **Payload:** `{ "url": "http://localhost:4000/login" }`
   - **Response:** Returns daftar seluruh kandidat elemen interaktif pada halaman web.

---

## Menjalankan Demo App & Test Verification

```bash
# 1. Jalankan demo web app lokal (Port 4000)
npm run demo

# 2. Generasi script & eksekusi dry-run (Terminal terpisah)
node dist/cli/index.js generate --config ./examples/login-flow.json --out ./tests/login.spec.ts --dry-run

# 3. Jalankan script hasil generasi langsung dengan Playwright
npx playwright test tests/login.spec.ts
```

---

## Struktur Direktori Proyek

```text
tester-lab/
├── dist/                      # Output kompilasi JavaScript
├── examples/                  # Contoh file DSL & demo web server
│   ├── demo-server.ts
│   └── login-flow.json
├── src/
│   ├── cli/                   # Interface Command Line (Commander.js)
│   │   └── index.ts
│   ├── crawler/               # State-Transition DOM Extractor Engine
│   │   └── domExtractor.ts
│   ├── generator/             # Code Transpiler (Handlebars + Prettier)
│   │   └── codeGenerator.ts
│   ├── matcher/               # Heuristic & Scoring Matcher Engine
│   │   └── heuristicMatcher.ts
│   ├── server/                # Express REST API Service
│   │   └── index.ts
│   ├── templates/             # Template Handlebars (.hbs)
│   │   ├── playwright-js.hbs
│   │   └── playwright-ts.hbs
│   ├── types/                 # TypeScript Interfaces & Types
│   │   └── index.ts
│   ├── validator/             # DSL Zod Schema & Dry-Run Engine
│   │   ├── dslValidator.ts
│   │   └── dryRunEngine.ts
│   └── index.ts               # Main Entry Point & Pipeline Orchestrator
├── tests/                     # Output file .spec.ts hasil generasi
├── Implementation-plan.md     # Dokumen spesifikasi perancangan
├── package.json
└── tsconfig.json
```

---

## Lisensi

ISC License.
