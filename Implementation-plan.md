# Rencana Implementasi: Sistem Generator Script Testing Otomatis Tanpa LLM (Rule & Heuristic Based)

## 1. Ringkasan Eksekutif & Filosofi Desain

Sistem ini dirancang untuk menghasilkan *automation test script* (seperti Playwright, Cypress, atau Selenium) secara otomatis berdasarkan **Business Rules / Flow Input** yang ditentukan oleh pengguna, tanpa bergantung pada Large Language Model (LLM). 

### Mengapa Tanpa LLM?
1. **Deterministik & Dapat Diprediksi:** Hasil generasi *script* konsisten 100% untuk input bisnis yang sama, tanpa risiko halusinasi.
2. **Kepatuhan Privasi & Keamanan (Zero Data Leakage):** Kode, struktur DOM internal, dan data bisnis tidak dikirim ke API pihak ketiga.
3. **Kecepatan & Performa Tinggi:** Proses pencocokan heuristik berbasis memori lokal berjalan dalam milidetik, jauh lebih cepat daripada latensi inferensi LLM.
4. **Biaya Operasional Nol (Zero API Cost):** Tidak ada biaya token atau langganan API berulang.

---

## 2. Arsitektur Sistem & Alur Kerja

Sistem mengadopsi prinsip **Model-Based Testing (MBT)** yang dikombinasikan dengan **Heuristic Web DOM Crawler**.

[User Input: DSL / Business Rule JSON]
│
▼
[1. Target Navigation]
│
▼
[2. Headless DOM Extractor] ────► Extract Interactive Elements & A11y Tree
│
▼
[3. Heuristic Selector Matcher] ◄── Match Label / Intent with DOM Elements
│
▼
[4. Code Generator Engine] ───► Apply Target Framework Templates
│
▼
[5. Dry-Run & Validation Loop] ──► Generate Verified .spec.js / .spec.ts


---

## 3. Spesifikasi Komponen Utama

### 3.1. Domain-Specific Language (DSL) / Business Rule Format
Format sederhana berbasis JSON/YAML yang digunakan oleh *Business Analyst* atau *QA Manual* untuk mendefinisikan skenario pengujian tanpa menulis kode.

#### Contoh Skema JSON DSL (`login-flow.json`):
```json
{
  "testSuite": "Login Authentication Test",
  "targetUrl": "[https://app.example.com/login](https://app.example.com/login)",
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
3.2. Headless DOM Extractor & Crawler Engine
Engine ini memanfaatkan Playwright/Puppeteer dalam mode headless untuk menavigasi ke halaman web target dan mengumpulkan metadata elemen interaktif.

Informasi Elemen yang Diekstrak:
Atribut Identifikasi Utama: id, name, data-testid, data-test, data-qa, role, aria-label, placeholder.

Karakteristik Teks & Visual: innerText, textContent, label terikat (<label for="...">), elemen saudara (siblings), dan elemen induk (parent elements).

Struktur Relasional: Posisi elemen dalam hierarki DOM, apakah berada di dalam <form>, <iframe>, atau Shadow DOM.

3.3. Algoritma Heuristic Selector Matcher
Guna menentukan selector CSS/XPath mana yang paling tepat tanpa bantuan AI, digunakan algoritma skoring berbasis bobot deterministik.

Matriks Bobot Skoring (Scoring Matrix):
Jenis Atribut / Match Criteria	Skor Bobot	Alasan & Kualitas Selector
data-testid / data-qa exact match	100	Sangat stabil, kebal perubahan desain UI
Atribut id unik yang konstan	90	Sangat spesifik dan cepat diproses
Keterkaitan <label for="element_id"> exact match	85	Sangat baik untuk accessibility dan standar form
placeholder atau aria-label exact match	75	Baik untuk input field modern
Exact innerText match pada tombol/link	70	Tepat untuk aksi click
Fuzzy Matching Teks (Levenshtein Distance > 80%)	50	Toleransi variasi kecil teks (misal: "Username" vs "User Name")
Sibling Text / Proximity Search	30	Fallback jika elemen terbungkus div tanpa id/label
Formula Penentuan Selector Terkuat:
Prioritaskan page.getByTestId(...) jika skor = 100.

Gunakan page.getByLabel(...) atau page.getByRole(...) jika skor 75–90.

Gunakan page.locator(...) dengan CSS selector spesifik sebagai fallback.

3.4. Code Generator Engine (Template Engine)
Mengubah pasangan Aksi-Selector yang terpetakan menjadi file script otomatisasi nyata menggunakan Template Engine (misalnya Handlebars.js atau Jinja2).

Struktur Template Playwright TypeScript (playwright.hbs):
TypeScript
import { test, expect } from '@playwright/test';

test('{{testSuite}}', async ({ page }) => {
  // Navigasi awal
  await page.goto('{{targetUrl}}');

  {{#each resolvedSteps}}
  // Step {{step}}: {{description}}
  {{#if (eq action "fill")}}
  await page.{{selectorType}}('{{selectorValue}}').fill('{{value}}');
  {{/if}}

  {{#if (eq action "click")}}
  await page.{{selectorType}}('{{selectorValue}}').click();
  {{/if}}

  {{#if (eq action "assert_url")}}
  await expect(page).toHaveURL(/.*{{expected}}/);
  {{/if}}

  {{#if (eq action "assert_text")}}
  await expect(page.{{selectorType}}('{{selectorValue}}')).toContainText('{{expected}}');
  {{/if}}

  {{/each}}
});
4. Tahapan Rencana Implementasi (Implementation Roadmap)
Fase	Durasi	Milestone / Target Output	Detail Tugas
Fase 1	Minggu 1–2	Standardisasi JSON/YAML Schema DSL	
- Definisikan skema input aturan bisnis.


- Buat parser & validator skema berbasis JSON Schema / Zod.

Fase 2	Minggu 3–4	Crawler & DOM Extractor Engine	
- Modul Node.js + Playwright untuk crawl & inspect DOM.


- Ekstraksi atribut, Accessibility Tree, dan Shadow DOM parser.

Fase 3	Minggu 5–6	Heuristic Matcher Core	
- Implementasi algoritma skoring & fuzzy text matching (Levenshtein).


- Engine pembuat CSS/XPath/Role Locators otomatis.

Fase 4	Minggu 7–8	Multi-Framework Code Generator	
- Buat template Handlebars untuk Playwright JS/TS dan Cypress.


- Integrasi penanganan async/await dan kerangka assertion.

Fase 5	Minggu 9–10	Dry-Run Validation & Self-Healing	
- Eksekusi headless otomatis pasca-generasi untuk memastikan script runnable.


- Log warning jika selector ambigu atau skor matching rendah.

Fase 6	Minggu 11–12	Dashboard UI / CLI Tool & CI/CD Integrasi	
- UI web sederhana (React) atau CLI tool (npm run generate-test).


- Integrasi export ke GitHub Actions / GitLab CI.

5. Contoh Kode Implementasi Referensi (Node.js)
Berikut adalah contoh modul sederhana pencocokan elemen (Heuristic Matcher) menggunakan Node.js dan Playwright:

JavaScript
// heuristicMatcher.js
const { chromium } = require('playwright');
const levenshtein = require('fast-levenshtein');

async function matchElementAndGenerateScript(dslConfig) {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(dslConfig.targetUrl);

  const resolvedSteps = [];

  for (const step of dslConfig.steps) {
    if (step.action === 'assert_url') {
      resolvedSteps.push({ ...step });
      continue;
    }

    // Ambil semua elemen interaktif dari halaman
    const candidates = await page.evaluate(() => {
      const elements = Array.from(document.querySelectorAll('input, button, a, select, textarea, [role]'));
      return elements.map((el, idx) => {
        // Cari label terikat
        let labelText = '';
        if (el.id) {
          const labelEl = document.querySelector(`label[for="${el.id}"]`);
          if (labelEl) labelText = labelEl.innerText;
        }

        return {
          index: idx,
          tagName: el.tagName.toLowerCase(),
          id: el.id || '',
          name: el.getAttribute('name') || '',
          placeholder: el.getAttribute('placeholder') || '',
          testId: el.getAttribute('data-testid') || el.getAttribute('data-test') || '',
          ariaLabel: el.getAttribute('aria-label') || '',
          innerText: el.innerText || '',
          labelText: labelText,
          type: el.getAttribute('type') || ''
        };
      });
    });

    // Hitung skor untuk setiap calon elemen
    let bestMatch = null;
    let highestScore = -1;

    for (const cand of candidates) {
      let score = 0;
      const target = step.targetLabel.toLowerCase();

      if (cand.testId && cand.testId.toLowerCase() === target) score += 100;
      if (cand.labelText && cand.labelText.toLowerCase().includes(target)) score += 85;
      if (cand.placeholder && cand.placeholder.toLowerCase().includes(target)) score += 75;
      if (cand.ariaLabel && cand.ariaLabel.toLowerCase().includes(target)) score += 75;
      if (cand.innerText && cand.innerText.toLowerCase().includes(target)) score += 70;
      if (cand.id && cand.id.toLowerCase().includes(target)) score += 60;

      // Fuzzy score jika belum match sempurna
      if (score === 0 && cand.innerText) {
        const dist = levenshtein.get(target, cand.innerText.toLowerCase());
        const maxLen = Math.max(target.length, cand.innerText.length);
        const similarity = 1 - dist / maxLen;
        if (similarity > 0.6) score += Math.floor(similarity * 50);
      }

      if (score > highestScore) {
        highestScore = score;
        bestMatch = cand;
      }
    }

    // Tentukan locator berdasarkan bestMatch
    let selectorType = 'locator';
    let selectorValue = '';

    if (bestMatch && highestScore >= 100) {
      selectorType = 'getByTestId';
      selectorValue = bestMatch.testId;
    } else if (bestMatch && bestMatch.labelText && highestScore >= 80) {
      selectorType = 'getByLabel';
      selectorValue = bestMatch.labelText.trim();
    } else if (bestMatch && bestMatch.innerText && highestScore >= 60) {
      selectorType = 'getByRole';
      selectorValue = bestMatch.tagName === 'button' ? `button', { name: '${bestMatch.innerText.trim()}' }` : `'${bestMatch.innerText.trim()}'`;
    } else if (bestMatch && bestMatch.id) {
      selectorType = 'locator';
      selectorValue = `#${bestMatch.id}`;
    } else if (bestMatch && bestMatch.name) {
      selectorType = 'locator';
      selectorValue = `[name="${bestMatch.name}"]`;
    } else {
      console.warn(`[Warning] Match score rendah (${highestScore}) untuk step: ${step.targetLabel}`);
      selectorType = 'locator';
      selectorValue = `text="${step.targetLabel}"`;
    }

    resolvedSteps.push({
      ...step,
      selectorType,
      selectorValue,
      matchScore: highestScore
    });
  }

  await browser.close();
  return resolvedSteps;
}
6. Analisis Perbandingan: Non-LLM vs LLM Engine
Parameter	Non-LLM Heuristic Engine	LLM / Vision-Based Generator
Akurasi Selector	Deterministik (Konsisten 100%)	Probabilistik (Bisa fluktuatif/halusinasi)
Kecepatan Generasi	Sangat Cepat (< 2 detik / halaman)	Sedang (5–15 detik per prompt/halaman)
Biaya Skalabilitas	Nirkost (Gratis)	Berbanding lurus dengan jumlah panggilan API token
Penanganan Dynamic UI	Membutuhkan rule kustom untuk Shadow DOM/IFrame	Mampu memahami context layout secara konseptual
Kepatuhan Privasi	100% On-Premise / Local	Perlu pengiriman screenshot/HTML ke cloud API
7. Strategi Mitigasi Risiko
Perubahan Class/Style Dinamis (misal: Tailwind, CSS Modules):

Solusi: Hindari penggunaan class name dinamis seperti .css-1x8z9qa. Prioritaskan getByRole, getByLabel, data-testid, atau atribut standar ARIA.

Halaman Berbasis Single Page Application (SPA) & Dynamic Loading:

Solusi: Sisipkan waitForLoadState('networkidle') atau pengamatan otomatis (auto-wait) dari Playwright sebelum melakukan inspeksi DOM.

Form Kompleks dengan Multi-Frame/IFrame:

Solusi: Tambahkan atribut iframeSelector opsional pada DSL jika target berada dalam frame terpisah.
"""

file_name = "rencana_implementasi_test_generator_non_llm.md"
with open(file_name, "w", encoding="utf-8") as f:
f.write(md_content)

print(f"File created successfully: {file_name}")


```text?code_stdout&code_event_index=1
File created successfully: rencana_implementasi_test_generator_non_llm.md

Berikut adalah file Markdown (.md) yang berisi dokumen rencana implementasi lengkap untuk sistem Automated Test Script Generator Tanpa LLM (Based on Business Rule & Heuristic DOM Matching).

MD icon
rencana_implementasi_test_generator_non_llm
 MD 
Open
Ringkasan Isi Dokumen (.md):
Ringkasan Eksekutif & Filosofi Desain: Penjelasan keunggulan pendekatan deterministik non-LLM (kecepatan, kepatuhan privasi, nol biaya API, dan hasil yang konsisten).

Arsitektur Sistem: Diagram alur kerja dari input DSL pengguna, headless crawler, heuristic selector matcher, hingga code generator engine.

Spesifikasi Komponen Utama:

DSL / Business Rule Format: Struktur JSON untuk mendefinisikan skenario aksi (fill, click, assert_url, assert_text).

Headless DOM Extractor: Strategi ekstraksi atribut interaktif, label terikat, dan accessibility tree.

Heuristic Selector Matcher: Matriks bobot skoring (misal: data-testid = 100, label = 85, placeholder = 75, Levenshtein fuzzy match = 50).

Code Generator Engine: Penggunaan template Handlebars untuk menghasilkan script Playwright TypeScript/JavaScript.

Tahapan Rencana Implementasi (Roadmap): Pembagian 6 fase kerja dalam rentang waktu 12 minggu.

Contoh Kode Implementasi Referensi: Node.js script runnable untuk melakukan inspeksi DOM dan pencocokan heuristik.

Analisis Perbandingan & Strategi Mitigasi Risiko: Komparasi mendalam antara Heuristic Engine vs LLM Engine serta penanganan UI dinamis (Tailwind, SPA, iframe).

buatkan implementation plan untuk segi perancangan dan apa saja yang perlu disiapkan, tidak perlu dibuatkan plan durasi dan lama pekerjaan

+-----------------------------------------------------------------------+
|                            INPUT LAYER                                |
|                     File DSL / Rule JSON User                         |
+-----------------------------------------------------------------------+
│
▼
+-----------------------------------------------------------------------+
|                      MODULE 1: DSL VALIDATOR                          |
|            Validasi skema JSON & pemetaan langkah kerja               |
+-----------------------------------------------------------------------+
│
▼
+-----------------------------------------------------------------------+
|                   MODULE 2: DOM CRAWLER & EXTRACTOR                   |
| - Buka URL Target via Headless Browser                                |
| - Extrak Interactive DOM, A11y Tree, dan Bounding Boxes              |
+-----------------------------------------------------------------------+
│
▼
+-----------------------------------------------------------------------+
|                 MODULE 3: HEURISTIC MATCHING ENGINE                   |
| - Evaluasi targetLabel terhadap calon elemen DOM                      |
| - Hitung Bobot Skor (Matching Matrix)                                 |
| - Pilih Locator Terkuat (data-testid > label > role > id > css)        |
+-----------------------------------------------------------------------+
│
▼
+-----------------------------------------------------------------------+
|                   MODULE 4: CODE EMITTER / GENERATOR                  |
| - Injeksi hasil matching ke Template Handlebars                       |
| - Format kode dengan Prettier API                                     |
+-----------------------------------------------------------------------+
│
▼
+-----------------------------------------------------------------------+
|                   MODULE 5: DRY-RUN & VALIDATOR                       |
| - Jalankan script hasil generasi secara headless                      |
| - Hasilkan Laporan Verifikasi (Pass/Fail + Ambiguity Warning)         |
+-----------------------------------------------------------------------+
│
▼
+-----------------------------------------------------------------------+
|                           OUTPUT ARTIFACT                             |
|                File Script Testing (.spec.ts / .spec.js)              |
+-----------------------------------------------------------------------+


---

## 3. Spesifikasi Perancangan Detail Modul

### 3.1. Perancangan Module 1: DSL Schema Design
Desain struktur data input yang harus ditaati oleh pengguna.

#### Komponen Skema DSL:
1. **Metadata Header:** `testSuiteName`, `targetUrl`, `frameworkTarget` (playwright/cypress), `viewport`.
2. **Steps Array:**
   * `stepId`: Nomor urut langkah.
   * `action`: Jenis interaksi (`fill`, `click`, `select`, `check`, `assert_text`, `assert_url`, `wait`).
   * `targetLabel`: Teks/deskripsi elemen yang diincar oleh pengguna (misal: "Button Login" atau "Input Password").
   * `value` *(opsional)*: Data input yang akan diisikan.
   * `options` *(opsional)*: Parameter khusus seperti `timeout`, `force`, atau `iframeSelector`.

---

### 3.2. Perancangan Module 2: DOM Extractor & Inspection Strategy
Modul yang mengekstrak elemen-elemen dari halaman web aktual.

#### Strategi Ekstraksi:
* **Filter Elemen Interaktif:** Mengambil semua elemen `<input>`, `<button>`, `<a>`, `<select>`, `<textarea>`, serta elemen dengan `role="button"`, `role="checkbox"`, `tabindex`, atau listener `onclick`.
* **Penyandian Karakteristik Elemen (Element Metadata Contract):**
  Setiap elemen yang diekstrak dikonversi ke dalam objek struktur data internal:
  ```typescript
  interface DOMElementCandidate {
    tagName: string;
    id: string;
    name: string;
    testId: string;           // data-testid, data-test, data-qa
    placeholder: string;
    ariaLabel: string;
    innerText: string;
    associatedLabelText: string; // Teks dari <label for="id">
    role: string;
    isVisible: boolean;
    isInIframe: boolean;
    iframeSelector?: string;
  }
3.3. Perancangan Module 3: Heuristic & Scoring Matcher Engine
Inti dari kecerdasan sistem tanpa LLM, menggunakan matriks pembobotan (scoring algorithm).

Algoritma Matriks Skoring:
Rule 1: Direct Test ID Match (Skor: 100)

Elemen memiliki data-testid atau data-qa yang persis sama dengan targetLabel.

Rule 2: Associated Label Match (Skor: 85 - 90)

Teks dari elemen <label> yang terhubung cocok dengan targetLabel.

Rule 3: Accessibility Role & Name Match (Skor: 75 - 80)

Kombinasi ARIA Role & ARIA Name cocok (misal: getByRole('button', { name: 'Submit' })).

Rule 4: Placeholder / Aria-Label Match (Skor: 70)

Match pada atribut placeholder atau aria-label.

Rule 5: InnerText / Visual Text Match (Skor: 60 - 65)

Match pada teks yang terlihat di layar (innerText).

Rule 6: Fuzzy Distance Match (Skor: 30 - 50)

Penggunaan algoritma Levenshtein jika terdapat sedikit perbedaan ejakan (misal: "User Name" vs "Username").

Ambiguity Resolution:
Jika terdapat 2 atau lebih elemen dengan skor tertinggi yang sama, sistem akan:

Menambahkan kriteria konteks hierarki (misal: elemen di dalam <form> yang sedang aktif).

Memilih elemen yang berada paling atas-kiri secara visual (bounding box coordinate).

Menandai warning Ambiguous Element Detected pada log laporan.

3.4. Perancangan Module 4: Transpiler & Code Generator Engine
Modul untuk mengubah hasil matching menjadi clean code.

Strategi Template Mapping (Contoh Playwright TS):
action = fill & selectorType = getByLabel ➔ await page.getByLabel('{{value}}').fill('{{inputValue}}');

action = click & selectorType = getByRole ➔ await page.getByRole('{{role}}', { name: '{{name}}' }).click();

action = assert_text ➔ await expect(page.locator('{{selector}}')).toContainText('{{expectedText}}');

Code Formatting Integration:
Setelah kode string berhasil disusun dari template, jalankan prettier.format(rawCode, { parser: "typescript" }) sebelum disimpan ke file fisik.

3.5. Perancangan Module 5: Dry-Run & Self-Healing Engine
Proses validasi sebelum script diserahkan ke pengguna.

Dry-Run Execution:

Script yang baru diproduksi langsung dieksekusi oleh Playwright Runner secara terisolasi (headless mode).

Verification Check:

Jika eksekusi berhasil 100% ➔ Status: VERIFIED.

Jika terjadi TimeoutError atau ElementNotFound ➔ System memicu Fallback Strategy.

Fallback Strategy (Self-Healing Rule):

Ambil candidate selector dengan skor tertinggi kedua (Rank 2) dari Heuristic Matcher, lalu lakukan perbaikan otomatis (auto-patch) pada script.

4. Perancangan Antarmuka & Integrasi (Interfaces & Integration)
Sistem dapat diakses melalui dua moda antarmuka:

4.1. Mode CLI (Command Line Interface)
Didesain untuk integrasi pengembang & CI/CD.

Bash
# Perintah pembuatan script
npx test-gen generate --config ./flows/login-scenario.json --out ./tests/login.spec.ts --dry-run
4.2. Mode REST API (Service Interface)
Didesain jika ingin dihubungkan dengan Web Dashboard / Internal Portal.

POST /api/v1/generate-script: Menerima payload JSON DSL dan mengembalikan string kode beserta log matching.

POST /api/v1/inspect-dom: Menerima URL target dan mengembalikan daftar elemen interaktif yang ditemukan.

5. Perancangan Keamanan & Handling Edge Cases
5.1. Penanganan UI Dinamis & Framework Modern
Tailwind / Dynamic CSS Classes: Sistem melarang penggunaan class name acak (seperti .css-1n641x) sebagai selector utama. Selector diwajibkan berbasis Accessibility Role, Text, atau Attribute ID.

Single Page Application (SPA) Loading: Injeksi await page.waitForLoadState('networkidle') pada setiap perubahan halaman atau pengiriman form.

IFrame Support: Pembedahan DOM crawler harus masuk ke dalam konteks page.frames() jika elemen berada di dalam cross-origin atau same-origin iframe.

5.2. Keamanan & Sanitasi Input Data
Sanitasi String (Prevention Code Injection): Semua string input dari DSL (seperti value atau targetLabel) di-escape sebelum diinjeksi ke dalam template JavaScript/TypeScript untuk mencegah eksekusi kode berbahaya (Code Injection attack).
"""

file_name = "rencana_perancangan_dan_persiapan_test_generator.md"
with open(file_name, "w", encoding="utf-8") as f:
f.write(md_content)

print(f"File created successfully: {file_name}")


```text?code_stdout&code_event_index=1
File created successfully: rencana_perancangan_dan_persiapan_test_generator.md

Berikut adalah dokumen perancangan teknis (architecture design) dan daftar persiapan yang dibutuhkan untuk membangun Sistem Generator Script Testing Otomatis Berbasis Rule & Heuristic DOM Matching (Non-LLM).

Dokumen ini telah disimpan ke dalam file fisik 
MD icon
rencana_perancangan_dan_persiapan_test_generator
 MD 
Open
.

Dokumen Perancangan & Persiapan Sistem Generator Script Testing (Non-LLM)
1. Daftar Persiapan & Prasyarat (Prerequisites & Preparations)
Sebelum tahap perancangan dan pengodean dimulai, terdapat 3 aspek utama yang wajib disiapkan:

1.1. Persiapan Stack Teknologi (Tech Stack)
Runtime Environment: Node.js (v18+ LTS atau v20+ LTS) dengan TypeScript untuk kepastian type-safety.

Automation & Crawler Engine: Playwright (Direkomendasikan karena dukungan native terhadap Auto-waiting, Accessibility Tree inspection, Shadow DOM, dan multi-browser).

Template Engine: Handlebars.js atau EJS untuk translasi variabel hasil pencocokan menjadi kode script testing.

Schema Validation: Zod atau Ajv (JSON Schema) untuk validasi integritas struktur file DSL input.

String Matching Library: fast-levenshtein atau string-similarity untuk kalkulasi jarak string (fuzzy matching).

Code Formatter: Prettier (Node API) untuk memastikan output file .spec.ts terformat rapi secara otomatis.

1.2. Persiapan Infrastruktur & Akses Lingkungan
Akses ke Target Application Under Test (AUT):

URL Staging / Testing Environment yang stabil dan dapat diakses oleh runner crawler.

Penanganan Bypass CAPTCHA / Bot Detection pada lingkungan testing agar crawler headless tidak terblokir.

Data Test & Akun Pengujian:

Kredensial akun uji (test credentials) yang siap pakai untuk skenario otentikasi.

Mocking data / database seed yang konsisten.

Environment Storage & Repository:

Repositori Git untuk version control.

Penyimpanan lokal/S3 jika hasil ekstraksi DOM atau artifact script ingin disimpan terpusat.

1.3. Persiapan Kebutuhan Tim & Kompetensi
QA Automation Engineer: Pemahaman tentang selector CSS, XPath, Playwright/Cypress API, serta struktur DOM/Accessibility Tree.

Software Architect / Backend Engineer: Pemahaman tentang pola perancangan Template Engine, parsing AST (Abstract Syntax Tree), dan algoritma heuristik/scoring.

2. Perancangan Arsitektur Sistem (System Architecture Design)
Sistem dirancang dengan pendekatan Modular Pipeline untuk memisahkan tanggung jawab antara parsing input, inspection DOM, scoring, hingga code emission.

 +-----------------------------------------------------------------------+
 |                            INPUT LAYER                                |
 |                     File DSL / Rule JSON User                         |
 +-----------------------------------------------------------------------+
                                     │
                                     ▼
 +-----------------------------------------------------------------------+
 |                      MODULE 1: DSL VALIDATOR                          |
 |            Validasi skema JSON & pemetaan langkah kerja               |
 +-----------------------------------------------------------------------+
                                     │
                                     ▼
 +-----------------------------------------------------------------------+
 |                   MODULE 2: DOM CRAWLER & EXTRACTOR                   |
 | - Buka URL Target via Headless Browser                                |
 | - Ekstrak Interactive DOM, A11y Tree, dan Bounding Boxes              |
 +-----------------------------------------------------------------------+
                                     │
                                     ▼
 +-----------------------------------------------------------------------+
 |                 MODULE 3: HEURISTIC MATCHING ENGINE                   |
 | - Evaluasi targetLabel terhadap calon elemen DOM                      |
 | - Hitung Bobot Skor (Matching Matrix)                                 |
 | - Pilih Locator Terkuat (data-testid > label > role > id > css)        |
 +-----------------------------------------------------------------------+
                                     │
                                     ▼
 +-----------------------------------------------------------------------+
 |                   MODULE 4: CODE EMITTER / GENERATOR                  |
 | - Injeksi hasil matching ke Template Handlebars                       |
 | - Format kode dengan Prettier API                                     |
 +-----------------------------------------------------------------------+
                                     │
                                     ▼
 +-----------------------------------------------------------------------+
 |                   MODULE 5: DRY-RUN & VALIDATOR                       |
 | - Jalankan script hasil generasi secara headless                      |
 | - Hasilkan Laporan Verifikasi (Pass/Fail + Ambiguity Warning)         |
 +-----------------------------------------------------------------------+
                                     │
                                     ▼
 +-----------------------------------------------------------------------+
 |                           OUTPUT ARTIFACT                             |
 |                File Script Testing (.spec.ts / .spec.js)              |
 +-----------------------------------------------------------------------+
3. Spesifikasi Perancangan Detail Modul
3.1. Perancangan Module 1: DSL Schema Design
Desain struktur data input yang harus ditaati oleh pengguna.

Komponen Skema DSL:
Metadata Header: testSuiteName, targetUrl, frameworkTarget (playwright/cypress), viewport.

Steps Array:

stepId: Nomor urut langkah.

action: Jenis interaksi (fill, click, select, check, assert_text, assert_url, wait).

targetLabel: Teks/deskripsi elemen yang diincar oleh pengguna (misal: "Button Login" atau "Input Password").

value (opsional): Data input yang akan diisikan.

options (opsional): Parameter khusus seperti timeout, force, atau iframeSelector.

3.2. Perancangan Module 2: DOM Extractor & Inspection Strategy
Modul yang mengekstrak elemen-elemen dari halaman web aktual.

Strategi Ekstraksi:
Filter Elemen Interaktif: Mengambil semua elemen <input>, <button>, <a>, <select>, <textarea>, serta elemen dengan role="button", role="checkbox", tabindex, atau listener onclick.

Penyandian Karakteristik Elemen (Element Metadata Contract):
Setiap elemen yang diekstrak dikonversi ke dalam objek struktur data internal:

TypeScript
interface DOMElementCandidate {
  tagName: string;
  id: string;
  name: string;
  testId: string;           // data-testid, data-test, data-qa
  placeholder: string;
  ariaLabel: string;
  innerText: string;
  associatedLabelText: string; // Teks dari <label for="id">
  role: string;
  isVisible: boolean;
  isInIframe: boolean;
  iframeSelector?: string;
}
3.3. Perancangan Module 3: Heuristic & Scoring Matcher Engine
Inti dari kecerdasan sistem tanpa LLM, menggunakan matriks pembobotan (scoring algorithm).

Algoritma Matriks Skoring:
Rule 1: Direct Test ID Match (Skor: 100)

Elemen memiliki data-testid atau data-qa yang persis sama dengan targetLabel.

Rule 2: Associated Label Match (Skor: 85 - 90)

Teks dari elemen <label> yang terhubung cocok dengan targetLabel.

Rule 3: Accessibility Role & Name Match (Skor: 75 - 80)

Kombinasi ARIA Role & ARIA Name cocok (misal: getByRole('button', { name: 'Submit' })).

Rule 4: Placeholder / Aria-Label Match (Skor: 70)

Match pada atribut placeholder atau aria-label.

Rule 5: InnerText / Visual Text Match (Skor: 60 - 65)

Match pada teks yang terlihat di layar (innerText).

Rule 6: Fuzzy Distance Match (Skor: 30 - 50)

Penggunaan algoritma Levenshtein jika terdapat sedikit perbedaan ejakan (misal: "User Name" vs "Username").

Ambiguity Resolution:
Jika terdapat 2 atau lebih elemen dengan skor tertinggi yang sama, sistem akan:

Menambahkan kriteria konteks hierarki (misal: elemen di dalam <form> yang sedang aktif).

Memilih elemen yang berada paling atas-kiri secara visual (bounding box coordinate).

Menandai warning Ambiguous Element Detected pada log laporan.

3.4. Perancangan Module 4: Transpiler & Code Generator Engine
Modul untuk mengubah hasil matching menjadi clean code.

Strategi Template Mapping (Contoh Playwright TS):
action = fill & selectorType = getByLabel ➔ await page.getByLabel('{{value}}').fill('{{inputValue}}');

action = click & selectorType = getByRole ➔ await page.getByRole('{{role}}', { name: '{{name}}' }).click();

action = assert_text ➔ await expect(page.locator('{{selector}}')).toContainText('{{expectedText}}');

Code Formatting Integration:
Setelah kode string berhasil disusun dari template, jalankan prettier.format(rawCode, { parser: "typescript" }) sebelum disimpan ke file fisik.

3.5. Perancangan Module 5: Dry-Run & Self-Healing Engine
Proses validasi sebelum script diserahkan ke pengguna.

Dry-Run Execution:

Script yang baru diproduksi langsung dieksekusi oleh Playwright Runner secara terisolasi (headless mode).

Verification Check:

Jika eksekusi berhasil 100% ➔ Status: VERIFIED.

Jika terjadi TimeoutError atau ElementNotFound ➔ System memicu Fallback Strategy.

Fallback Strategy (Self-Healing Rule):

Ambil candidate selector dengan skor tertinggi kedua (Rank 2) dari Heuristic Matcher, lalu lakukan perbaikan otomatis (auto-patch) pada script.

4. Perancangan Antarmuka & Integrasi (Interfaces & Integration)
Sistem dapat diakses melalui dua moda antarmuka:

4.1. Mode CLI (Command Line Interface)
Didesain untuk integrasi pengembang & CI/CD.

Bash
# Perintah pembuatan script
npx test-gen generate --config ./flows/login-scenario.json --out ./tests/login.spec.ts --dry-run
4.2. Mode REST API (Service Interface)
Didesain jika ingin dihubungkan dengan Web Dashboard / Internal Portal.

POST /api/v1/generate-script: Menerima payload JSON DSL dan mengembalikan string kode beserta log matching.

POST /api/v1/inspect-dom: Menerima URL target dan mengembalikan daftar elemen interaktif yang ditemukan.

5. Perancangan Keamanan & Handling Edge Cases
5.1. Penanganan UI Dinamis & Framework Modern
Tailwind / Dynamic CSS Classes: Sistem melarang penggunaan class name acak (seperti .css-1n641x) sebagai selector utama. Selector diwajibkan berbasis Accessibility Role, Text, atau Attribute ID.

Single Page Application (SPA) Loading: Injeksi await page.waitForLoadState('networkidle') pada setiap perubahan halaman atau pengiriman form.

IFrame Support: Pembedahan DOM crawler masuk ke dalam konteks page.frames() jika elemen berada di dalam iframe.

5.2. Keamanan & Sanitasi Input Data
Sanitasi String (Prevention Code Injection): Semua string input dari DSL (seperti value atau targetLabel) di-escape sebelum diinjeksi ke dalam template JavaScript/TypeScript untuk mencegah eksekusi kode berbahaya (Code Injection attack).




Gemini is AI and can make mistakes.

# Dokumen Perancangan & Persiapan Sistem Generator Script Testing (Non-LLM)

Dokumen ini berisi spesifikasi perancangan teknis (architecture design) serta daftar prasyarat dan persiapan yang dibutuhkan untuk membangun **Sistem Generator Script Testing Otomatis Berbasis Rule & Heuristic DOM Matching**.

---

## 1. Daftar Persiapan & Prasyarat (Prerequisites & Preparations)

Sebelum tahap perancangan dan pengodean dimulai, terdapat beberapa aspek utama yang wajib disiapkan:

### 1.1. Persiapan Stack Teknologi (Tech Stack)
* **Runtime Environment:** Node.js (v18 LTS atau v20 LTS) dengan **TypeScript** untuk kepastian *type-safety*.
* **Automation & Crawler Engine:** **Playwright** (Direkomendasikan karena dukungan native terhadap *Auto-waiting*, *Accessibility Tree inspection*, *Shadow DOM*, dan multi-browser).
* **Template Engine:** **Handlebars.js** atau **EJS** untuk translasi variabel hasil pencocokan menjadi kode script testing.
* **Schema Validation:** **Zod** atau **Ajv (JSON Schema)** untuk validasi integritas struktur file DSL input.
* **String Matching & Heuristic Library:** `fast-levenshtein` atau `natural` untuk kalkulasi jarak string (*fuzzy matching*).
* **Code Formatter:** **Prettier** (Node API) untuk memastikan output file `.spec.ts` terformat dengan rapi secara otomatis.

### 1.2. Persiapan Infrastruktur & Akses Lingkungan
* **Akses ke Target Application Under Test (AUT):** 
  * URL Staging / Testing Environment yang stabil dan dapat diakses oleh runner crawler.
  * *Bypass* CAPTCHA / Bot Detection pada lingkungan testing agar crawler headless tidak terblokir.
* **Data Test & Akun Pengujian:**
  * Kredensial akun uji (*test credentials*) yang siap pakai untuk skenario otentikasi.
  * Mocking data / database seed yang konsisten.
* **Environment Storage & Repository:**
  * Repositori Git untuk *version control*.
  * Penyimpanan lokal/S3 jika hasil ekstraksi DOM atau artifact script ingin disimpan terpusat.

### 1.3. Persiapan Kompetensi Tim
* **QA Automation Engineer:** Pemahaman mendalam tentang selector CSS, XPath, Playwright/Cypress API, serta struktur DOM/Accessibility Tree.
* **Software Architect / Backend Engineer:** Pemahaman tentang pola perancangan *Template Engine*, parsing AST (Abstract Syntax Tree), dan algoritma *heuristik/scoring*.

---

## 2. Perancangan Arsitektur Sistem (System Architecture Design)

Sistem dirancang dengan pendekatan **Modular Pipeline** untuk memisahkan tanggung jawab antara *parsing input*, *inspection DOM*, *scoring*, hingga *code emission*.

```
 +-----------------------------------------------------------------------+
 |                            INPUT LAYER                                |
 |                     File DSL / Rule JSON User                         |
 +-----------------------------------------------------------------------+
                                     │
                                     ▼
 +-----------------------------------------------------------------------+
 |                      MODULE 1: DSL VALIDATOR                          |
 |            Validasi skema JSON & pemetaan langkah kerja               |
 +-----------------------------------------------------------------------+
                                     │
                                     ▼
 +-----------------------------------------------------------------------+
 |                   MODULE 2: DOM CRAWLER & EXTRACTOR                   |
 | - Buka URL Target via Headless Browser                                |
 | - Extrak Interactive DOM, A11y Tree, dan Bounding Boxes              |
 +-----------------------------------------------------------------------+
                                     │
                                     ▼
 +-----------------------------------------------------------------------+
 |                 MODULE 3: HEURISTIC MATCHING ENGINE                   |
 | - Evaluasi targetLabel terhadap calon elemen DOM                      |
 | - Hitung Bobot Skor (Matching Matrix)                                 |
 | - Pilih Locator Terkuat (data-testid > label > role > id > css)        |
 +-----------------------------------------------------------------------+
                                     │
                                     ▼
 +-----------------------------------------------------------------------+
 |                   MODULE 4: CODE EMITTER / GENERATOR                  |
 | - Injeksi hasil matching ke Template Handlebars                       |
 | - Format kode dengan Prettier API                                     |
 +-----------------------------------------------------------------------+
                                     │
                                     ▼
 +-----------------------------------------------------------------------+
 |                   MODULE 5: DRY-RUN & VALIDATOR                       |
 | - Jalankan script hasil generasi secara headless                      |
 | - Hasilkan Laporan Verifikasi (Pass/Fail + Ambiguity Warning)         |
 +-----------------------------------------------------------------------+
                                     │
                                     ▼
 +-----------------------------------------------------------------------+
 |                           OUTPUT ARTIFACT                             |
 |                File Script Testing (.spec.ts / .spec.js)              |
 +-----------------------------------------------------------------------+
```

---

## 3. Spesifikasi Perancangan Detail Modul

### 3.1. Perancangan Module 1: DSL Schema Design
Desain struktur data input yang harus ditaati oleh pengguna.

#### Komponen Skema DSL:
1. **Metadata Header:** `testSuiteName`, `targetUrl`, `frameworkTarget` (playwright/cypress), `viewport`.
2. **Steps Array:**
   * `stepId`: Nomor urut langkah.
   * `action`: Jenis interaksi (`fill`, `click`, `select`, `check`, `assert_text`, `assert_url`, `wait`).
   * `targetLabel`: Teks/deskripsi elemen yang diincar oleh pengguna (misal: "Button Login" atau "Input Password").
   * `value` *(opsional)*: Data input yang akan diisikan.
   * `options` *(opsional)*: Parameter khusus seperti `timeout`, `force`, atau `iframeSelector`.

---

### 3.2. Perancangan Module 2: DOM Extractor & Inspection Strategy
Modul yang mengekstrak elemen-elemen dari halaman web aktual.

#### Strategi Ekstraksi:
* **Filter Elemen Interaktif:** Mengambil semua elemen `<input>`, `<button>`, `<a>`, `<select>`, `<textarea>`, serta elemen dengan `role="button"`, `role="checkbox"`, `tabindex`, atau listener `onclick`.
* **Penyandian Karakteristik Elemen (Element Metadata Contract):**
  Setiap elemen yang diekstrak dikonversi ke dalam objek struktur data internal:
  ```typescript
  interface DOMElementCandidate {
    tagName: string;
    id: string;
    name: string;
    testId: string;           // data-testid, data-test, data-qa
    placeholder: string;
    ariaLabel: string;
    innerText: string;
    associatedLabelText: string; // Teks dari <label for="id">
    role: string;
    isVisible: boolean;
    isInIframe: boolean;
    iframeSelector?: string;
  }
  ```

---

### 3.3. Perancangan Module 3: Heuristic & Scoring Matcher Engine
Inti dari kecerdasan sistem tanpa LLM, menggunakan matriks pembobotan (*scoring algorithm*).

#### Algoritma Matriks Skoring:
1. **Rule 1: Direct Test ID Match (Skor: 100)**
   * Elemen memiliki `data-testid` atau `data-qa` yang persis sama dengan `targetLabel`.
2. **Rule 2: Associated Label Match (Skor: 85 - 90)**
   * Teks dari elemen `<label>` yang terhubung cocok dengan `targetLabel`.
3. **Rule 3: Accessibility Role & Name Match (Skor: 75 - 80)**
   * Kombinasi ARIA Role & ARIA Name cocok (misal: `getByRole('button', { name: 'Submit' })`).
4. **Rule 4: Placeholder / Aria-Label Match (Skor: 70)**
   * Match pada atribut `placeholder` atau `aria-label`.
5. **Rule 5: InnerText / Visual Text Match (Skor: 60 - 65)**
   * Match pada teks yang terlihat di layar (*innerText*).
6. **Rule 6: Fuzzy Distance Match (Skor: 30 - 50)**
   * Penggunaan algoritma Levenshtein jika terdapat sedikit perbedaan ejakan (misal: "User Name" vs "Username").

#### Ambiguity Resolution:
Jika terdapat 2 atau lebih elemen dengan skor tertinggi yang **sama**, sistem akan:
1. Menambahkan kriteria konteks hierarki (misal: elemen di dalam `<form>` yang sedang aktif).
2. Memilih elemen yang berada paling atas-kiri secara visual (*bounding box coordinate*).
3. Menandai warning `Ambiguous Element Detected` pada log laporan.

---

### 3.4. Perancangan Module 4: Transpiler & Code Generator Engine
Modul untuk mengubah hasil matching menjadi *clean code*.

#### Strategi Template Mapping (Contoh Playwright TS):
* `action = fill` & `selectorType = getByLabel` ➔ `await page.getByLabel('{{value}}').fill('{{inputValue}}');`
* `action = click` & `selectorType = getByRole` ➔ `await page.getByRole('{{role}}', { name: '{{name}}' }).click();`
* `action = assert_text` ➔ `await expect(page.locator('{{selector}}')).toContainText('{{expectedText}}');`

#### Code Formatting Integration:
Setelah kode string berhasil disusun dari template, jalankan `prettier.format(rawCode, { parser: "typescript" })` sebelum disimpan ke file fisik.

---

### 3.5. Perancangan Module 5: Dry-Run & Self-Healing Engine
Proses validasi sebelum script diserahkan ke pengguna.

1. **Dry-Run Execution:**
   * Script yang baru diproduksi langsung dieksekusi oleh Playwright Runner secara terisolasi (*headless mode*).
2. **Verification Check:**
   * Jika eksekusi berhasil 100% ➔ Status: **VERIFIED**.
   * Jika terjadi `TimeoutError` atau `ElementNotFound` ➔ System memicu *Fallback Strategy*.
3. **Fallback Strategy (Self-Healing Rule):**
   * Ambil candidate selector dengan skor tertinggi kedua (Rank 2) dari Heuristic Matcher, lalu lakukan perbaikan otomatis (*auto-patch*) pada script.

---

## 4. Perancangan Antarmuka & Integrasi (Interfaces & Integration)

Sistem dapat diakses melalui dua moda antarmuka:

### 4.1. Mode CLI (Command Line Interface)
Didesain untuk integrasi pengembang & CI/CD.
```bash
# Perintah pembuatan script
npx test-gen generate --config ./flows/login-scenario.json --out ./tests/login.spec.ts --dry-run
```

### 4.2. Mode REST API (Service Interface)
Didesain jika ingin dihubungkan dengan Web Dashboard / Internal Portal.
* `POST /api/v1/generate-script`: Menerima payload JSON DSL dan mengembalikan string kode beserta log matching.
* `POST /api/v1/inspect-dom`: Menerima URL target dan mengembalikan daftar elemen interaktif yang ditemukan.

---

## 5. Perancangan Keamanan & Handling Edge Cases

### 5.1. Penanganan UI Dinamis & Framework Modern
* **Tailwind / Dynamic CSS Classes:** Sistem melarang penggunaan class name acak (seperti `.css-1n641x`) sebagai selector utama. Selector diwajibkan berbasis *Accessibility Role*, *Text*, atau *Attribute ID*.
* **Single Page Application (SPA) Loading:** Injeksi `await page.waitForLoadState('networkidle')` pada setiap perubahan halaman atau pengiriman form.
* **IFrame Support:** Pembedahan DOM crawler harus masuk ke dalam konteks `page.frames()` jika elemen berada di dalam *cross-origin* atau *same-origin iframe*.

### 5.2. Keamanan & Sanitasi Input Data
* **Sanitasi String (Prevention Code Injection):** Semua string input dari DSL (seperti `value` atau `targetLabel`) di-escape sebelum diinjeksi ke dalam template JavaScript/TypeScript untuk mencegah eksekusi kode berbahaya (*Code Injection attack*).
rencana_perancangan_dan_persiapan_test_generator.md
Displaying rencana_perancangan_dan_persiapan_test_generator.md.