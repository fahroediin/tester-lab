# Design: Re-order scenario dalam suite (urutan eksekusi Run Suite)

Status: Disetujui untuk implementasi
Tanggal: 2026-09-12
Repo: tester-lab-oss (POC)
Rujukan BA: Doc_BA_Tester-Lab_1.xlsx — US-15, AC-15.19 s.d. AC-15.22

## Konteks & Tujuan

Run Suite menjalankan scenario dalam suite "secara berurutan" (US-15), tapi
urutannya kini tak bisa diatur user — scenario tampil apa adanya (urutan
timestamp). Untuk menyusun flow end-to-end yang terbaca (Login -> Buat SPK ->
Cek), user perlu mengatur urutan eksekusi.

Penting (prinsip): urutan **hanya** menentukan giliran jalan dan urutan di
laporan. Scenario tetap **independen** — urutan tidak membawa state/data antar
scenario (Model B tetap berlaku). Re-order adalah fitur organisasi/keterbacaan,
bukan orkestrasi data.

## Keputusan

| Keputusan | Pilihan |
|---|---|
| Jangkar urutan | Per **nama scenario** (testSuite) dalam suite, konsisten dengan dedupeLatestByName |
| Persistensi | Kolom urutan di DB, per (suiteId, nama scenario) |
| Kontrol UI | Drag-and-drop DAN tombol naik/turun (↑↓) |
| Dampak eksekusi | Run Suite menghormati urutan tersimpan |
| Scenario baru | Masuk ke akhir urutan (AC-15.22) |
| Independensi | Tidak berubah — scenario tetap mandiri (Model B) |

## AC -> perilaku (traceability)

| AC | Perilaku |
|---|---|
| AC-15.19 | Ubah posisi scenario -> urutan baru tersimpan |
| AC-15.20 | Run Suite jalan sesuai urutan tersimpan |
| AC-15.21 | Urutan bertahan setelah reload |
| AC-15.22 | Scenario baru muncul di posisi terakhir |

## Model data

Karena urutan per **nama scenario** dalam suite (bukan per record history),
opsi paling bersih: tabel/pemetaan urutan terpisah dari flow_history.

Usulan: tabel `suite_scenario_order`
- `suite_id` (fk)
- `scenario_name` (text; = flow_history.test_suite)
- `sort_order` (int)
- unik (suite_id, scenario_name), RLS per pemilik (ikut pola suites/flow_history)

Alternatif lebih ringan (bila menambah tabel dihindari): kolom
`scenario_order jsonb` di tabel `suites` berisi array nama scenario terurut.
Keputusan tabel-vs-kolom dibuat saat implementasi; spec memakai konsep
"peta urutan per nama".

Catatan: karena scenario diidentifikasi via nama (POC belum punya entitas
Scenario), urutan mengikat nama. Ganti nama scenario = perlu penyesuaian
(di luar cakupan POC; bila nama tak ada di peta, treated sebagai scenario baru
-> akhir urutan).

## Aliran

```
Halaman detail suite (tree Flow History, suite di-expand)
  -> tampilkan scenario terurut menurut peta urutan; yang tak ada di peta di akhir
  -> user drag / klik naik-turun
  -> PUT/POST urutan baru: daftar nama scenario terurut untuk suite itu
  -> simpan peta urutan
Run Suite
  -> getRunnableScenariosBySuite + dedupeLatestByName (seperti sekarang)
  -> URUTKAN hasil menurut peta urutan suite (fungsi pure baru)
  -> jalankan berurutan (Model B, tak berubah)
```

## Perubahan

### Fungsi pure (dapat diuji headless) — inti TDD
1. `orderScenariosByMap(scenarios, orderMap)` di run-suite-service (atau util):
   - Input: daftar scenario ter-dedup + peta {name -> sort_order}.
   - Output: scenario terurut menurut peta; nama yang tak ada di peta ditaruh
     di akhir, mempertahankan urutan relatif asalnya (stable). Kasus kosong /
     peta kosong aman.
2. `applyReorder(orderedNames, fromIndex, toIndex)` (atau moveItem): util murni
   memindahkan satu item dalam array (dipakai UI & bisa diuji).

### Backend
3. Store: baca & tulis peta urutan per suite (tabel atau kolom jsonb).
4. Endpoint: `PUT /api/v1/suites/:suiteId/scenario-order` menerima daftar nama
   terurut; simpan. Guard kepemilikan suite.
5. `getRunnableScenariosBySuite` hasilnya diurutkan via `orderScenariosByMap`
   sebelum dijalankan (AC-15.20), dan query listing suite juga mengembalikan
   urutan untuk UI (AC-15.21).

### UI (Scenario Builder / tree Flow History)
6. Di baris scenario dalam suite (tree): tombol ↑↓ + drag handle. Saat berubah,
   panggil endpoint simpan urutan lalu render ulang tree sesuai urutan baru.
7. Scenario baru (tak ada di peta) tampil di akhir (AC-15.22).

### Data / Migrasi (dijalankan user di Supabase)
8. Tabel `suite_scenario_order` (atau kolom jsonb di suites) + RLS. Additive.

## Rencana Testing (TDD)

Headless (pola suite test):
- `orderScenariosByMap`:
  - peta lengkap -> scenario terurut sesuai peta (AC-15.20).
  - nama tak ada di peta -> di akhir, stable (AC-15.22).
  - peta kosong / scenario kosong -> aman, urutan asal.
- `applyReorder`/moveItem: pindah atas/bawah, batas indeks, tak mengubah panjang.
- Endpoint & store (persist) dan drag/tombol UI: verifikasi manual (butuh
  DB + browser). AC-15.19/21 diverifikasi manual.

Regresi: seluruh suite hijau; Run Suite tanpa peta urutan berperilaku seperti
sekarang (fallback ke urutan hasil dedup).

## Batasan POC
- Urutan mengikat nama scenario; ganti nama di luar cakupan.
- Migrasi DB dijalankan user (tak otomatis dari sini).
- Tak mengubah independensi scenario (Model B).

## Urutan Implementasi
1. `orderScenariosByMap` + `moveItem` (pure) + tes (TDD).
2. Store + endpoint simpan/baca urutan.
3. Run Suite hormati urutan (pakai orderScenariosByMap).
4. Migrasi DB (user) + wiring listing.
5. UI drag + ↑↓ di tree.
6. Verifikasi manual + full test hijau.
