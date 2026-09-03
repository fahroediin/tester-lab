# Deployment & Environments

tester-lab dijalankan dalam dua lingkungan terpisah yang dipetakan ke dua branch Git.

## Branch & lingkungan

| Branch | Lingkungan | Domain | Database |
| :--- | :--- | :--- | :--- |
| `main` | Production | `tester-lab.mibot.my.id` | Supabase project produksi |
| `develop` | Staging / Dev | `dev.tester-lab.mibot.my.id` (contoh) | Supabase project dev (terpisah) |

Aturan pokok:

- `main` selalu stabil dan hanya menerima kode yang sudah diuji di staging.
- Pekerjaan harian dilakukan di `develop` (atau branch `feature/*` yang di-merge ke `develop`).
- Promosi ke produksi = merge `develop` ke `main`, lalu deploy dan beri tag rilis.

## Alur kerja

```
1. git checkout develop
2. (kerjakan perubahan; commit)
3. git push origin develop            -> deploy otomatis/manual ke domain dev
4. Uji di dev.tester-lab.mibot.my.id
5. Jika lolos:
     git checkout main
     git merge develop
     git push origin main             -> deploy ke domain utama
     git tag -a vX.Y.Z main && git push origin vX.Y.Z
```

Untuk banyak fitur paralel, kerjakan di `feature/<nama>` lalu merge ke `develop`.

## Environment variable per lingkungan

Setiap lingkungan memakai file `.env` sendiri (tidak pernah di-commit). Salin dari `.env.example` dan sesuaikan.

Yang WAJIB berbeda antara produksi dan dev:

- `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` — arahkan dev ke Supabase project dev yang terpisah, agar data uji tidak mengotori data produksi.
- `PORT` — proses dev berjalan di port berbeda dari produksi pada server yang sama.
- `JWT_SECRET` — gunakan secret berbeda per lingkungan.
- `ADMIN_USERNAME` / `ADMIN_EMAIL` / `ADMIN_PASSWORD` — kredensial admin bootstrap terpisah.

Menyiapkan Supabase project dev: buat project baru di Supabase, jalankan `supabase/schema.sql` di SQL editor-nya (membuat tabel + RLS), buat bucket Storage privat `test-videos` dan `feedback-attachments`, lalu isi kredensialnya ke `.env` dev.

## Menyiapkan domain dev (di server / DNS, di luar repo)

1. Buat subdomain (mis. `dev.tester-lab.mibot.my.id`) dan arahkan DNS-nya ke server.
2. Jalankan instance aplikasi kedua dari branch `develop` pada port dev.
3. Arahkan reverse proxy (mis. nginx) dari subdomain dev ke port dev tersebut.
4. Pastikan instance dev memakai `.env` dev (Supabase dev, secret dev).

## Build & jalankan

```bash
npm install
npx playwright install chromium
npm run build
npm run start
```
