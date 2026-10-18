# Deployment Plan — Tester Lab

Tester Lab dapat dijalankan dengan **dua cara**. Keduanya butuh Supabase
(database + object storage) eksternal, dan Chromium (Playwright) untuk menjalankan
test.

| Metode | Untuk | Status |
|--------|-------|--------|
| **A. VM + PM2** | Produksi saat ini (GCP) | Sudah dipakai |
| **B. Docker Compose** | Portabel, konsisten, mudah pindah provider | Baru |

---

## Prasyarat (kedua metode)

1. **Proyek Supabase** aktif — ambil `SUPABASE_URL`, `SUPABASE_ANON_KEY`,
   `SUPABASE_SERVICE_ROLE_KEY` dari dashboard.
2. **Jalankan migration SQL** di Supabase SQL Editor (sekali, berurutan):
   - `supabase/schema.sql`
   - `supabase/migration-add-suites.sql`
   - `supabase/migration-add-suite-runs.sql`
   - `supabase/migration-add-email.sql`
   - `supabase/migration-add-email-unique.sql`
3. **Buat bucket Storage** di Supabase: `test-videos`, `feedback-attachments`.
4. **Siapkan `.env`** — salin `.env.example` ke `.env`, isi nilai nyata.
   Variabel kunci:
   - `SUPABASE_*` — kredensial di atas
   - `JWT_SECRET` — string acak panjang (mis. `openssl rand -base64 32`)
   - `EMAIL_CONFIG_SECRET` — string acak panjang (wajib untuk fitur email)
   - `ADMIN_USERNAME` / `ADMIN_PASSWORD` — admin awal (ganti dari default!)
   - `MAX_CONCURRENT_TESTS` / `MAX_QUEUE_LENGTH` — sesuaikan kapasitas server
     (lihat README → Tuning Kapasitas & Infrastruktur)

> **Catatan Chromium:** kedua metode butuh browser Playwright. Metode Docker
> sudah menyertakannya lewat base image resmi; metode VM butuh
> `npx playwright install chromium` + dependensi OS.

---

## Metode A — VM + PM2 (produksi GCP saat ini)

Skrip `deploy/deploy-prod.sh` menjalankan deploy di server (pull, build, restart).

### Setup awal (sekali) di VM
```bash
git clone <repo> tester-lab && cd tester-lab
npm install
npx playwright install chromium          # + dependensi OS (lihat dok Playwright)
cp .env.example .env                      # lalu isi nilai nyata
npm run build
pm2 start dist/server/index.js --name tester-lab
pm2 save
```

### Deploy pembaruan (rutin)
```bash
cd tester-lab
bash deploy/deploy-prod.sh               # pull + install + build + pm2 restart
```

### nginx (reverse proxy, di host)
Pakai `deploy/nginx-prod.conf.example` (atau `-dev`). Penting:
`client_max_body_size 20m`, dan `certbot` untuk SSL.

---

## Metode B — Docker Compose (app + nginx)

Menjalankan **app (Node + Chromium)** dan **nginx** sebagai container. Database
& storage tetap di Supabase.

### File terkait
- `Dockerfile` — image app (base: `mcr.microsoft.com/playwright:v1.62.1-jammy`,
  multi-stage, + ffmpeg, non-root).
- `docker-compose.yml` — orkestrasi app + nginx.
- `deploy/nginx-docker.conf` — konfig nginx untuk Compose (proxy ke `app:3000`).
- `.dockerignore` — mengecualikan node_modules, dist, .env, docs, dll.

### Jalankan
```bash
cp .env.example .env                      # isi nilai nyata (JANGAN commit .env)
docker compose up -d --build              # build image + jalankan app & nginx
docker compose logs -f app                # pantau log (termasuk [EVENT] ...)
```
Aplikasi tersedia di `http://<host>/` (nginx port 80 → app 3000).

### Perintah berguna
```bash
docker compose ps                         # status container
docker compose restart app                # restart app saja
docker compose down                       # hentikan & hapus container
docker compose up -d --build              # rebuild setelah update kode
```

### Catatan penting Docker
- **`.env` tidak di-bake ke image** — dibaca saat runtime via `env_file`. Aman
  dari kebocoran di image.
- **`shm_size: 1gb`** sudah di-set untuk app — Chromium butuh shared memory
  besar; default 64MB menyebabkan crash saat beban.
- **Tag base image = versi Playwright** (1.62.1). Saat upgrade Playwright di
  `package.json`, perbarui juga tag di `Dockerfile`.
- **SSL** tak termasuk di `nginx-docker.conf` — terminasi TLS di proxy host,
  atau tambah container certbot/Traefik.
- **Volume video**: video run diunggah ke Supabase Storage (tak disimpan di
  container), jadi tak perlu volume persisten untuk itu.

---

## Verifikasi pasca-deploy (kedua metode)

1. Server hidup: log menampilkan `Tester Lab backend listening on ...`.
2. Buka `/` (landing) dan `/app` (workspace) — tampil tanpa error.
3. Login sebagai admin → buat project → suite → scenario → **Run Test**
   (memastikan Chromium berfungsi di lingkungan itu).
4. Cek log event (observability): aksi seperti `[EVENT] action=recorder_open`
   muncul saat memakai recorder.

---

## Troubleshooting

| Gejala | Kemungkinan sebab | Solusi |
|--------|-------------------|--------|
| Run/generate gagal "browser not found" | Chromium belum terpasang | VM: `npx playwright install chromium`; Docker: pastikan base image Playwright |
| Crash saat beberapa run paralel | RAM/`shm` kurang | Turunkan `MAX_CONCURRENT_TESTS`; Docker: naikkan `shm_size` |
| 413 saat upload feedback | body limit nginx kecil | pastikan `client_max_body_size 20m` |
| "Could not save SMTP" | `EMAIL_CONFIG_SECRET` kosong | set di `.env` (fail-closed by design) |
| Video multi-tab tak tergabung | ffmpeg tak ada | VM: install ffmpeg; Docker: sudah termasuk |
