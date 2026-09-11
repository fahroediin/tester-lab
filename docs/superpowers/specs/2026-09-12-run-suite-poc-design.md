# Design: Run Suite (POC) — jalankan scenario satu Suite berurutan

Status: Disetujui untuk implementasi
Tanggal: 2026-09-12
Repo: tester-lab-oss (POC)
Rujukan BA: Doc_BA_Tester-Lab_1.xlsx — US-15 / US-34, AC-15.01–AC-15.18

## Konteks & Tujuan

US-15 ("Menjalankan Seluruh Scenario dalam Satu Suite") dan US-34 sudah
terdefinisi di Doc BA, seluruh AC-nya berstatus "belum". Alur Run Suite di
dokumen murni Suite -> scenario -> job -> status; **tidak** bergantung pada
User Story maupun Acceptance Criteria. Karena itu POC dapat mengimplementasi
konsep yang sama tanpa fitur US/AC (yang di POC memang belum ada dan bersifat
opsional).

Tujuan POC: membuktikan bahwa menjalankan seluruh scenario satu Suite secara
berurutan dalam sekali jalan memberi nilai (satu area uji terbukti tuntas,
terlihat scenario mana yang lolos/gagal), memakai fondasi yang sudah ada.

## Prinsip Keselarasan (POC vs Doc BA)

POC mengimplementasi **subset AC-15**, tidak mengubah makna satu pun. AC yang
dikerjakan berperilaku persis seperti definisinya; AC yang ditunda hanya
dihilangkan, bukan diubah. Dengan begitu, saat versi SaaS melengkapi sisanya,
tidak ada yang perlu dibongkar.

### AC-15 yang dikerjakan di POC

| AC | Perilaku | Catatan implementasi |
|---|---|---|
| AC-15.01 | Run Suite membuat satu job berisi seluruh scenario suite | Job = satu batch (`runBatchId`), bukan entitas Run |
| AC-15.02 | Menjalankan scenario berurutan, bukan paralel | Loop sekuensial di server |
| AC-15.03 | Semua lolos -> status job PASSED | Dihitung dari hasil batch |
| AC-15.05 | Scenario gagal ditandai FAILED | Status per record history |
| AC-15.06 | Tetap lanjut setelah ada yang gagal (Model B) | Tidak break saat gagal |
| AC-15.07 | Sebagian gagal -> status job PARTIAL | Dihitung dari hasil batch |
| AC-15.08 | Suite kosong -> tolak, pesan jelas, tidak ada job dibuat | Guard sebelum eksekusi |
| AC-15.09 | Scenario tanpa script -> jalankan yang punya script | Lewati yang kode-nya kosong |
| AC-15.10 | Scenario tanpa script -> ditandai SKIPPED | Status baru SKIPPED |
| AC-15.11 | Status job = gabungan hasil scenario yang dijalankan | Dihitung dari batch |
| AC-15.12–15.14 | Suite berisi tepat satu scenario | Kasus batas, dijalankan penuh |

### AC-15 yang DITUNDA ke versi SaaS (di luar POC)

- AC-15.15–AC-15.18: Cancel di tengah eksekusi + status CANCELLED. Butuh
  kontrol proses berjalan; kompleks. Ditunda.
- Status lifecycle tersimpan (QUEUED/RUNNING) dan pemantauan real-time: itu
  US-29 (entitas Run), target SaaS. Di POC status dihitung, tidak dipersist
  sebagai entity terpisah.

## Keputusan Desain

| Keputusan | Pilihan | Alasan |
|---|---|---|
| Penyimpanan hasil | Opsi A: history + `runBatchId` | Manfaatkan fondasi teruji; tanpa tabel/entity Run baru (YAGNI untuk POC) |
| Perilaku gagal | Model B (lanjut sampai habis) | Sesuai AC-15.06, terlihat semua flow lolos/gagal |
| Status job | Dihitung dari batch (PASSED/PARTIAL/FAILED) | Memenuhi AC-15.03/07/11 tanpa entity Run |
| Eksekusi | Sinkron | Cukup membuktikan konsep; tanpa real-time |
| US/AC | Tidak diimplementasi | Opsional per Doc BA; bukan prasyarat Run Suite |

## Arsitektur & Aliran Data

```
User klik "Run Suite" pada satu Suite
  -> POST /api/v1/suites/:suiteId/run   (baru)
       -> ambil scenario terbaru milik suite (query baru di flow-history-store)
       -> AC-15.08: bila 0 scenario -> tolak (400), tidak ada batch dibuat
       -> generate runBatchId
       -> untuk tiap scenario, berurutan (Model B):
            - bila generatedCode kosong -> catat SKIPPED (AC-15.09/10), lanjut
            - else jalankan lewat jalur eksekusi yang sudah ada
              (checkRunnerSupport -> executePlaywrightTest), simpan sebagai
              history record dengan runBatchId + status SUCCESS/FAILED
       -> hitung status job dari hasil batch:
            semua SUCCESS -> PASSED
            campur       -> PARTIAL
            semua FAILED -> FAILED
            (SKIPPED tidak menggugurkan; status dari yang dijalankan)
       -> balikan ringkasan { runBatchId, jobStatus, results: [{scenarioId, name, status}] }
  -> UI menampilkan ringkasan per scenario + status job
```

Fondasi yang sudah ada dan dipakai ulang:
- Entitas Suite (`suite-store.ts`), scenario tertaut `suiteId`
  (`flow-history-store.ts`), `generatedCode` tersimpan per scenario.
- Runner satu-scenario: `executePlaywrightTest` + `checkRunnerSupport`
  (runner-guard) pada jalur `/run-test`.
- `addHistory` / `updateHistory` untuk mencatat hasil.

## Perubahan

### Backend
1. `flow-history-store.ts`: query baru `getRunnableScenariosBySuite(suiteId, userId)`
   yang mengembalikan scenario terbaru per suite dengan `id, testSuite,
   generatedCode, language, framework`.
2. `flow-history-store.ts`: tambah nilai status `SKIPPED` pada tipe status, dan
   kolom `run_batch_id` (nullable) pada record.
3. `suite-routes.ts`: endpoint `POST /suites/:suiteId/run`
   - Guard suite milik user, suite ada.
   - AC-15.08: 0 scenario -> 400 dengan pesan jelas, tanpa batch.
   - Eksekusi berurutan (Model B) memakai runner + guard yang ada.
   - Hitung status job; balikan ringkasan.
4. Reuse `checkRunnerSupport`: hanya scenario yang runner-nya didukung (mis.
   Playwright) yang dieksекusi di server; lainnya diperlakukan sesuai guard.

### Frontend
5. Tombol "Run Suite" pada tampilan Suite (di mana scenario suite terlihat).
6. Panggil endpoint, tampilkan ringkasan: status job + daftar scenario dengan
   status (SUCCESS/FAILED/SKIPPED).

### Data
7. Kolom `run_batch_id` di tabel history (Supabase) + izin RLS mengikut pola
   kolom lain. Migrasi additive (nullable), tidak memengaruhi record lama.

## Batasan POC (eksplisit)

- Tidak ada entitas Run tersendiri; job = batch history via `runBatchId`.
- Tidak ada cancel (AC-15.15–18) dan tidak ada status real-time.
- Sinkron: pemanggil menunggu seluruh scenario selesai.
- Hanya scenario dengan runner didukung server (Playwright) yang dieksekusi;
  runner guard yang sudah ada menentukan.
- US/AC tidak disentuh.

## Rencana Testing (TDD)

Logika pure yang dapat diuji headless (tanpa DB/Playwright), pola `vm` yang
sudah dipakai `scripts/test-katalon.js` atau suite Node yang ada:
- `computeJobStatus(results)`: [SUCCESS,SUCCESS] -> PASSED; [SUCCESS,FAILED] ->
  PARTIAL; [FAILED,FAILED] -> FAILED; SKIPPED diabaikan dalam penentuan asalkan
  ada yang dijalankan; semua SKIPPED -> tandai khusus (mis. tidak ada yang
  dijalankan).
- Pemilihan scenario runnable: yang `generatedCode` kosong -> SKIPPED.
- Guard suite kosong -> menolak.

Bagian yang menyentuh Playwright/DB/HTTP diuji lewat suite server yang ada bila
memungkinkan; jika tidak, verifikasi manual dengan satu suite berisi beberapa
scenario (satu lolos, satu gagal, satu tanpa script) untuk mengonfirmasi
PASSED/PARTIAL/FAILED/SKIPPED.

Regresi: seluruh suite test yang ada harus tetap hijau (security, project &
suite, generator, katalon).

## Urutan Implementasi

1. `computeJobStatus` + tes (TDD).
2. Query `getRunnableScenariosBySuite` + status SKIPPED + kolom run_batch_id.
3. Endpoint `POST /suites/:suiteId/run` (guard, Model B, hitung status).
4. Migrasi kolom `run_batch_id` (additive) + RLS.
5. UI tombol Run Suite + ringkasan hasil.
6. Verifikasi manual + full test hijau.

## Setelah POC (jalur ke SaaS, tidak dikerjakan sekarang)

Bila POC lolos gate: angkat ke entitas Run penuh (US-29) dengan status
lifecycle tersimpan, cancel (AC-15.15–18), dan pemantauan real-time. Logika
Model B dan computeJobStatus dari POC dipakai ulang; yang berubah adalah tempat
menyimpan job dan mekanisme eksekusi (async).
