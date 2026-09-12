# Design: Edit script di Flow History (US-10) + fix keluar-suite saat unassign ke project (US-13)

Status: Terimplementasi & ter-push ke origin/main (retro-spec — US/AC ditulis setelah implementasi, sesi 2026-09-13)
Tanggal: 2026-09-13
Repo: tester-lab-oss (POC)
Rujukan BA: Doc_BA_Tester-Lab_1.xlsx — US-10 (AC-10.03), US-13 (AC-13.14)

Catatan proses: dua perubahan ini diimplementasikan lebih dulu di sesi ini,
US/AC formal dilengkapi setelahnya. Ke depan, tulis US/AC sebelum implementasi
(SysFunc_US_AC_Guide).

---

## Bagian A — Edit script hasil generate LANGSUNG di Flow History (perluasan US-10)

### Konteks

US-10 ("Mengedit Script Hasil Generate") sudah mencakup menyunting kode di
Scenario Builder sebelum Run. Yang kurang: setelah scenario dirapikan ke dalam
Suite, memperbaiki sedikit script masih menuntut generate ulang lewat Builder.
Perluasan ini memberi titik edit kedua — di detail Flow History — yang menyimpan
hasil edit ke record yang sama, sehingga Run Suite memakainya tanpa generate
ulang.

Run Suite membaca `generated_code` mentah per record suite dan
`dedupeLatestByName` mengambil versi terbaru per nama; jadi begitu record
diperbarui di tempat, Run Suite otomatis memakainya tanpa perubahan di sisi Run
Suite.

### AC baru

**AC-10.03 — Menyunting script di Flow History lalu Run Suite memakainya**

- GIVEN saya seorang QA Engineer
  AND saya membuka detail sebuah scenario di halaman "Flow History"
  AND scenario itu berada di dalam sebuah Suite dan punya kode hasil generate
- WHEN saya menekan "Edit", mengubah satu value di dalam kode, lalu menekan "Save"
  AND saya menjalankan "Run Suite" pada suite tersebut
- THEN Save menimpa script pada record yang sama (bukan record baru)
  AND status record menjadi GENERATED
  AND Run Suite menjalankan versi hasil suntingan saya, bukan versi asli

Perilaku pendukung (bagian dari AC-10.03, semua ter-cover):
- Tombol Edit muncul hanya bila record punya kode; Edit memunculkan Save & Cancel.
- Cancel mengembalikan script ke versi terakhir yang dimuat (buang edit tak tersimpan).
- Save menjalankan code-sanitizer (rules sama dengan jalur run); bila kena blok,
  Save ditolak (403) dengan daftar violation, record tidak berubah.
- Semua framework boleh diedit & disimpan; runner-guard TIDAK berlaku di jalur
  simpan, jadi script non-Playwright tersimpan tapi tetap SKIPPED saat Run Suite.

### Perubahan teknis

- `src/server/services/history-edit-service.ts` — `validateCodeEdit` (murni):
  tolak non-string/kosong, jalankan sanitizer, kembalikan code ter-trim.
- `src/server/routes/history-routes.ts` — `PATCH /api/v1/history/:id/code`:
  cek kepemilikan, validasi, `updateHistory(id, { generatedCode, status: 'GENERATED' })`.
- `public/index.html` + `public/js/app.js` — Edit/Save/Cancel di panel Generated
  Code; reuse styling `.code-preview[contenteditable]`.

### Testing

- Unit (pure) di `scripts/security-checks.js` blok [9].
- Verifikasi manual (butuh .env + browser): Edit/Save/Cancel, Run Suite pakai
  versi edit, tolak paste kode berbahaya, tombol Edit sembunyi bila tak ada kode.

---

## Bagian B — Unassign scenario ke level project mengeluarkannya dari Suite (US-13)

### Konteks & bug

US-13 mengatur penempatan scenario ke Suite. Dropdown "Move to..." punya opsi
"Unassigned in <project>" (endpoint `/project`) dan "Uncategorized" (`/project`
dengan projectId null), selain "pindah ke suite lain" (`/suite`).

Bug: route `/project` hanya mereset `suite_id` bila project tujuan BERBEDA dari
project asal. Saat user memilih "Unassigned in <project yang SAMA>", `suite_id`
lama dipertahankan, sehingga scenario tetap ikut Run Suite di suite itu —
padahal maksudnya keluar dari suite.

Root cause: `if (suiteId && (!folderId || folderId !== record.folderId))` di
`history-routes.ts`. Semantik yang benar: menempatkan scenario di level project
selalu berarti keluar dari suite (endpoint `/project` mengatur wadah project;
`/suite` mengatur keanggotaan suite).

### AC baru

**AC-13.14 — Unassign ke project mengeluarkan scenario dari suite**

- GIVEN saya seorang QA Engineer
  AND ada project "Test Project 1" berisi suite "Suite 1"
  AND sebuah scenario berada di dalam "Suite 1"
- WHEN saya memilih "Unassigned in Test Project 1" pada dropdown "Move to..." scenario itu
  AND saya menjalankan "Run Suite" pada "Suite 1"
- THEN scenario itu tidak lagi ikut dijalankan oleh Run Suite "Suite 1"
  AND scenario tetap berada di project "Test Project 1" tanpa suite

Regresi yang tetap benar: pindah ke suite lain (via `/suite`), pindah ke project
berbeda, dan pindah ke Uncategorized semuanya tetap mengatur `suite_id` dengan benar.

Catatan data lama: fix ini membetulkan perilaku ke depan; scenario yang sudah
terlanjur salah (di-unassign ke project sama sebelum fix, `suite_id` masih
menunjuk suite) tidak dibersihkan otomatis — dibereskan manual dengan
memindahkannya ulang setelah versi baru ter-deploy. (Skrip pembersih otomatis
sengaja tidak dibuat: data "unassigned in project yang sama" secara struktur
tetap valid dan tak terbedakan dari scenario yang memang mau ada di suite.)

### Perubahan teknis

- `src/server/services/history-edit-service.ts` — `resolveSuiteOnProjectMove()`
  (murni): move ke level project selalu -> `suite_id = null`.
- `src/server/routes/history-routes.ts` — route `/project` (& `/folder`) memakai
  helper itu menggantikan kondisi lama.

### Testing

- Unit (pure) di `scripts/security-checks.js` blok [10].
- Verifikasi manual: unassign ke project sama -> tidak muncul di Run Suite;
  regresi move ke suite lain / project beda / uncategorized tetap benar.

---

Lihat juga: run-suite-poc-design (US-15/US-34), suite-scenario-reorder-design (US-15).
