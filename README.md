# Tester Lab: Non-LLM Automated Test Script Generator

**Sistem Generator Script Testing Otomatis Berbasis Rule & Heuristic DOM Matching (Deterministik, Tanpa LLM)**

`tester-lab` adalah engine otomatisasi pengujian *end-to-end* yang menghasilkan script test secara otomatis berdasarkan file skenario aturan bisnis (**JSON / YAML DSL**), tanpa bergantung pada Large Language Model (LLM). Engine ini secara bawaan mendukung berbagai framework industri terkemuka: **Playwright (TypeScript & JavaScript), Cypress, Selenium (Python), dan Robot Framework**.

---

## Mengapa Tanpa LLM?

1. **Deterministik & 100% Konsisten:** Hasil generasi script selalu identik untuk input bisnis yang sama. Tidak ada risiko halusinasi selector, kesalahan sintaks, atau perubahan perilaku acak.
2. **Kepatuhan Privasi & Keamanan Data (Zero Data Leakage):** Struktur DOM internal, atribut halaman, dan data rahasia tidak pernah dikirim ke API kecerdasan buatan pihak ketiga.
3. **Performa Tinggi (< 1 Detik):** Ekstraksi dan pencocokan heuristik berbasis memori lokal berjalan dalam hitungan milidetik, jauh lebih cepat dibanding latensi inferensi LLM.
4. **Biaya Operasional Nol (Zero Token/API Cost):** Tanpa langganan API berulang, tanpa kuota token bulanan.

---

## Fitur Utama

- **Deterministic 6-Tier Scoring Matrix:** Pencocokan label ke elemen DOM interaktif dengan bobot prioritas teruji (*Test ID -> Associated Label -> ARIA Role & Accessible Name -> InnerText -> Placeholder/Aria-Label -> Fuzzy Levenshtein*).
- **Multi-Framework Code Transpiler:** Transpilasi otomatis ke **Playwright (TS/JS)**, **Cypress**, **Selenium Python**, dan **Robot Framework** terformat rapi via Prettier AST.
- **Dry-Run & Self-Healing Engine:** Validasi headless langsung pasca-generasi dengan kemampuan *auto-healing* ke kandidat Rank-2 jika selector pertama gagal.
- **Web Workspace & Interactive Admin Portal:** UI modern responsif dengan Scenario Builder, Flow History + video playback, Feedback Reporting, API Key Management, dan Admin Control Center.
- **Enterprise-Grade Security:**
  - **API Key Masking & SHA-256 Hashing:** Penyimpanan hash kriptografis aman, raw key hanya ditampilkan sekali saat pembuatan, dan prefix di-mask (`tl_live_xxxx...yyyy`).
  - **Dual Authentication Middleware:** Mendukung JWT Bearer Token dan `X-API-Key` dengan Role-Based Access Control (Admin / User) & User Status Approval (`pending`, `approved`, `rejected`).
  - **AST/Regex Code Sanitizer:** Memblokir eksekusi kode berbahaya (`fs`, `child_process`, `eval`, `process.env`) sebelum dieksekusi.
  - **PostgreSQL Row Level Security (RLS):** Seluruh tabel database diamankan dan diisolasi dengan hak akses `TO service_role`.
- **Resource Concurrency Control:** In-memory queue manager untuk membatasi eksekusi paralel Playwright dan browser crawler guna mencegah *resource exhaustion*.
- **Flexible DSL Support:** Mendukung format file konfigurasi skenario **JSON** dan **YAML** dengan normalisasi otomatis.

---

## Arsitektur & Pipeline Sistem

```
[ Business Rule DSL (JSON / YAML) ]
               │
               ▼
    1. Zod DSL Validator & Normalizer (src/validator/dsl-validator.ts)
               │
               ▼
    2. State-Transition DOM Extractor (src/crawler/dom-extractor.ts)
       - Headless Playwright Chromium Crawler
       - Ekstraksi elemen interaktif, accessibility tree, & bounding box
               │
               ▼
    3. Heuristic Scoring & Matcher Engine (src/matcher/heuristic-matcher.ts)
       - 6 Deterministik Heuristic Rules
       - Tag suitability filtering & coordinate disambiguation
               │
               ▼
    4. Selector Strategy Resolver (src/matcher/selector-resolver.ts)
       - getByTestId, getByLabel, getByRole, getByPlaceholder, getByText, locator
               │
               ▼
    5. Multi-Framework Code Generator (src/generator/code-generator.ts)
       - Handlebars Templates (Playwright TS/JS, Cypress, Selenium, Robot)
       - Format kode otomatis via Prettier
               │
               ▼
    6. Dry-Run & Self-Healing Engine (src/validator/dry-run-engine.ts)
       - Headless test execution validation
       - Auto-healing fallback ke Rank 2 candidate jika selector bermasalah
               │
               ▼
 [ Output Artifact: File Script Testing (.spec.ts / .cy.js / .py / .robot) ]
```

---

## Matriks Skoring Heuristik

Pencocokan elemen dilakukan menggunakan matriks bobot deterministik untuk memilih *locator strategy* paling stabil:

| Prioritas | Kriteria / Rule | Skor | Strategi Locator | Deskripsi & Stabilitas |
| :---: | :--- | :---: | :--- | :--- |
| **1** | **Direct Test ID Match** | **100** | `page.getByTestId(...)` | Match exact `data-testid`, `data-test`, `id-test`. Paling kebal perubahan UI. |
| **2** | **Associated Label Match** | **85 – 90** | `page.getByLabel(...)` | Match `<label for="...">` atau wrapper label langsung. Standar aksesibilitas tinggi. |
| **3** | **ARIA Role & Name Match** | **75 – 88** | `page.getByRole(...)` | Match semantik ARIA role (`button`, `textbox`, `combobox`) + accessible name. |
| **4** | **Visual Text / Value Match** | **60 – 85** | `page.getByText(...)` | Match teks visual yang terlihat di layar (`innerText`). |
| **5** | **Placeholder / Aria-Label** | **65 – 80** | `page.getByPlaceholder(...)` | Match atribut `placeholder` atau `aria-label` pada elemen input. |
| **6** | **Fuzzy Levenshtein Match** | **30 – 50** | `page.locator('text=...')` | Toleransi perbedaan ejaan ringan / dynamic prefix. |

---

## Prasyarat & Instalasi

### Prasyarat
- **Node.js**: `v18.x` atau `v20+` LTS
- **NPM**: `v9.x` atau `v10+`

### 1. Clone Repositori & Install Dependensi
```bash
git clone https://github.com/fahroediin/tester-lab.git
cd tester-lab
npm install
```

### 2. Install Browser Binary Playwright
```bash
npx playwright install chromium
```

### 3. Konfigurasi Environment (`.env`)
Salin template `.env.example` ke `.env`:
```bash
cp .env.example .env
```
Sesuaikan konfigurasi environment:
```env
PORT=3000
HOST=0.0.0.0

# Super Admin Account Bootstrap
ADMIN_USERNAME=admin
ADMIN_EMAIL=admin@testerlab.com
ADMIN_PASSWORD=AdminPassword123!

# JWT Secret
JWT_SECRET=tester-lab-jwt-secret-key-2026-secure

# Concurrency & Playwright Timeouts
PLAYWRIGHT_TIMEOUT=120000
MAX_CONCURRENT_TESTS=3
MAX_CONCURRENT_GENERATIONS=5

# Supabase Credentials (PostgreSQL & Storage)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# API Key Usage Reset Cycle (hari)
API_KEY_USAGE_RESET_DAYS=30
```

### 4. Build Project
```bash
npm run build
```

---

## Penggunaan CLI (`test-gen`)

Tester Lab menyediakan CLI mandiri untuk generasi cepat dari terminal:

### 1. Generasi Script dari File JSON atau YAML
```bash
# Menggunakan file JSON
node dist/cli/index.js generate --config ./examples/login-flow.json --out ./tests/login.spec.ts

# Menggunakan file YAML
node dist/cli/index.js generate --config ./tests/DEV_TERRAL.yaml --out ./tests/dev_terral.spec.ts
```

### 2. Generasi dengan Verifikasi Otomatis (Dry-Run)
```bash
node dist/cli/index.js generate --config ./examples/login-flow.json --out ./tests/login.spec.ts --dry-run
```

### 3. Inspeksi Elemen DOM dari Target URL
```bash
node dist/cli/index.js inspect --url https://example.com/login
```

---

## Format DSL Input

### Contoh JSON DSL (`login-flow.json`):
```json
{
  "testSuite": "Login Authentication Flow",
  "targetUrl": "https://example.com/login",
  "framework": "playwright",
  "language": "typescript",
  "steps": [
    {
      "step": 1,
      "action": "fill",
      "targetLabel": "Email Address",
      "value": "user@example.com",
      "description": "Isi kolom email pengguna"
    },
    {
      "step": 2,
      "action": "fill",
      "targetLabel": "Password",
      "value": "SecurePass123!",
      "description": "Isi kata sandi"
    },
    {
      "step": 3,
      "action": "click",
      "targetLabel": "Sign In",
      "description": "Klik tombol sign in"
    },
    {
      "step": 4,
      "action": "assert_url",
      "expected": "/dashboard",
      "description": "Verifikasi URL beralih ke dashboard"
    }
  ]
}
```

### Contoh YAML DSL (`login-flow.yaml`):
```yaml
testSuite: Login Authentication Flow
targetUrl: https://example.com/login
framework: playwright
language: typescript
steps:
  - action: fill
    targetLabel: Email Address
    value: user@example.com
  - action: fill
    targetLabel: Password
    value: SecurePass123!
  - action: click
    targetLabel: Sign In
  - action: assert_url
    expected: /dashboard
```

---

## Menjalankan Backend Server & Web Portal

Jalankan server Express:
```bash
npm run start
```
Buka browser di `http://localhost:3000` untuk mengakses Web Workspace & Admin Console.

### Fitur Antarmuka Web:
- **Scenario Builder:** Pembuat skenario visual, import JSON/YAML, dan eksekusi generasi script satu klik.
- **Execution History:** Riwayat lengkap skenario yang digenerasi beserta log eksekusi dan pemutar rekaman video Playwright.
- **API Key Management:** Pembuatan dan pencabutan API key dengan ringkasan status hit (`generated`, `success`, `failed`).
- **Admin Control Panel:**
  - Persetujuan & penolakan pendaftaran pengguna (`pending`, `approved`, `rejected`).
  - Ringkasan aktivitas sistem & audit log.
  - Manajemen feedback dan unduhan lampiran pengguna.
  - Statistik agregat penggunaan API Key secara *real-time*.

---

## REST API Reference

| Endpoint | Method | Autentikasi | Deskripsi |
| :--- | :---: | :---: | :--- |
| `/api/v1/auth/register` | `POST` | Public | Mendaftarkan akun baru (status awal: `pending`). |
| `/api/v1/auth/login` | `POST` | Public | Login pengguna, mengembalikan JWT token. |
| `/api/v1/auth/me` | `GET` | JWT / API Key | Mengambil profil user yang sedang aktif. |
| `/api/v1/generate-script` | `POST` | JWT / API Key | Mengekstraksi DOM dan menghasilkan script testing. |
| `/api/v1/inspect-dom` | `POST` | JWT / API Key | Mengambil daftar elemen kandidat interaktif dari URL target. |
| `/api/v1/run-test` | `POST` | JWT / API Key | Mengeksekusi script Playwright dan mengunggah artifact video. |
| `/api/v1/api-keys` | `GET` | JWT Only | Mengambil daftar API Key pengguna beserta statistik hit. |
| `/api/v1/api-keys` | `POST` | JWT Only | Membuat API Key baru (mengembalikan raw key sekali saja). |
| `/api/v1/api-keys/:id` | `DELETE` | JWT Only | Mencabut (*revoke*) status aktif API Key. |
| `/api/v1/history` | `GET` | JWT / API Key | Mengambil riwayat pengujian pengguna. |
| `/api/v1/feedback` | `POST` | JWT / API Key | Mengirim feedback dan lampiran file. |
| `/api/v1/admin/users` | `GET` | Admin Only | Mengambil daftar seluruh pengguna dan status approval. |
| `/api/v1/admin/users/:id/approve` | `POST` | Admin Only | Menyetujui akun pendaftaran pengguna. |
| `/api/v1/admin/api-keys/stats` | `GET` | Admin Only | Statistik agregat request & hit seluruh API Key. |
| `/api/v1/admin/api-keys/logs` | `GET` | Admin Only | Log paginasi hit API Key di seluruh sistem. |

---

## Struktur Direktori

```text
tester-lab/
├── public/                     # Frontend Web Portal (HTML, CSS, Vanilla JS)
│   ├── css/style.css           # Modern Glassmorphic Design System
│   ├── js/app.js               # Web UI Logic & REST API Client
│   └── index.html              # Workspace Single Page Application
├── src/
│   ├── cli/
│   │   └── index.ts            # CLI Interface (Commander.js + js-yaml)
│   ├── crawler/
│   │   ├── dom-candidate-extractor.ts  # Script ekstraksi DOM in-browser
│   │   └── dom-extractor.ts            # Headless Playwright Chromium Crawler
│   ├── generator/
│   │   └── code-generator.ts   # Handlebars Multi-Framework Transpiler
│   ├── matcher/
│   │   ├── heuristic-matcher.ts # Orchestrator pencocokan multi-step
│   │   ├── scoring-engine.ts    # 6-Tier Deterministic Scoring Engine
│   │   └── selector-resolver.ts # Playwright locator strategy mapping
│   ├── server/
│   │   ├── lib/
│   │   │   └── sanitized-env.ts # Subprocess environment sanitizer
│   │   ├── routes/              # Express REST API Route Handlers (< 250 baris)
│   │   │   ├── admin-routes.ts
│   │   │   ├── api-key-routes.ts
│   │   │   ├── auth-routes.ts
│   │   │   ├── config-routes.ts
│   │   │   ├── feedback-routes.ts
│   │   │   ├── history-routes.ts
│   │   └── test-routes.ts
│   │   ├── services/
│   │   │   └── test-runner-service.ts # Playwright test execution & video handler
│   │   ├── activity-log-store.ts
│   │   ├── api-key-store.ts     # API Key Store (SHA-256 hash & masked prefix)
│   │   ├── api-key-usage-helpers.ts # In-memory buffer fallback & helper
│   │   ├── api-key-usage-store.ts   # Database API Key usage metrics
│   │   ├── auth-middleware.ts   # Dual JWT & API Key authentication
│   │   ├── auth-store.ts        # Database user store adapter
│   │   ├── code-sanitizer.ts    # AST/Regex test script security guard
│   │   ├── config-store.ts
│   │   ├── flow-history-store.ts
│   │   ├── index.ts             # Express Server Bootstrap
│   │   ├── queue-manager.ts     # Concurrency queue limiter
│   │   └── supabase-client.ts   # Supabase client singleton
│   ├── templates/               # Handlebars Code Generation Templates
│   │   ├── cypress.hbs
│   │   ├── playwright-js.hbs
│   │   ├── playwright-ts.hbs
│   │   ├── robotframework.hbs
│   │   └── selenium-py.hbs
│   ├── types/
│   │   └── index.ts             # Shared Domain Types & Interfaces
│   ├── validator/
│   │   ├── dry-run-engine.ts    # Headless test verification & self-healing
│   │   └── dsl-validator.ts     # Zod DSL validation & normalizer
│   └── index.ts                 # Library programmatic API export
├── supabase/
│   └── schema.sql               # Database schema, table definitions, & RLS
├── CODING_STANDARD.md           # Standar Pengkodean & Arsitektur Resmi
├── package.json
└── tsconfig.json
```

---

## Lisensi

ISC License.

---

**Tester Lab Team** — *Crafted for reliable, deterministic, and blazing-fast test automation.*
