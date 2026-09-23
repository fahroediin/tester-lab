# Email/SMTP Configuration, Access Notification, and Forgot Password — Design

Date: 2026-09-23
Status: Approved (US/AC by Fahrudin); implementation pending

## Ringkasan

Menambah kemampuan email ke tester-lab-oss (POC):
1. **US-B** Admin mengelola konfigurasi SMTP + template email dari menu Configuration (editable, disimpan di DB, password dienkripsi).
2. **US-A** Sistem mengirim email otomatis saat admin approve/reject request akses.
3. **US-C** Pengguna memulihkan akses via forgot-password (link reset token via email).

Sumber pola email: proyek `ba-handbook` (nodemailer, port 587 TLS / 465 secure, template approve/reject). Body email dalam **bahasa Inggris** agar konsisten dengan Doc_BA.

US/AC (US-A/B/C, nomor final ditetapkan Fahrudin di Doc_BA) sudah disetujui; dokumen ini merinci desain teknis.

## Arsitektur & komponen

### 1. Skema DB

**Tabel baru `email_config`** (satu baris, id=1, pola sama seperti `app_config`):
- `id` int PK (selalu 1)
- `smtp_host`, `smtp_user`, `smtp_from_name` text
- `smtp_port` int (default 587)
- `smtp_pass_enc` text — password SMTP terenkripsi (AES-256-GCM, format `iv:authTag:ciphertext` hex), NULL bila belum diisi
- `approve_subject`, `approve_body`, `reject_subject`, `reject_body`, `reset_subject`, `reset_body` text — template (default diisi migrasi)
- `updated_at` timestamptz

**Kolom baru di `users`** (untuk reset password):
- `reset_token_hash` text NULL — SHA-256 dari token mentah (token mentah TIDAK disimpan)
- `reset_token_expires` timestamptz NULL
- `reset_token_used` boolean NOT NULL DEFAULT false

Migrasi: `supabase/migration-add-email.sql` (CREATE TABLE email_config + ALTER TABLE users ADD COLUMN ...). RLS service_role sama seperti tabel lain.

### 2. Enkripsi secret — `src/security/secret-crypto.ts`

- `encryptSecret(plain)` / `decryptSecret(payload)` memakai `crypto` bawaan Node, AES-256-GCM.
- Kunci dari env `EMAIL_CONFIG_SECRET` (32 byte; di-derive via scrypt bila panjang beda). Bila env tak ada, enkripsi menolak dengan error jelas (fail-closed).
- Pure, unit-testable (round-trip encrypt->decrypt, tamper authTag -> gagal).

### 3. Config store — `src/server/email-config-store.ts`

- `loadEmailConfig()` -> mengembalikan config; password TIDAK dalam bentuk plaintext ke caller UI (ada `getDecryptedSmtpPass()` terpisah khusus untuk service kirim).
- `saveEmailConfig(input)` -> bila `smtpPass` kosong, PERTAHANKAN `smtp_pass_enc` yang ada (AC-B.02); bila diisi, enkripsi lalu simpan. Validasi host+user wajib (AC-B.03).
- Default template (English) ditanam di store bila kolom kosong.

### 4. Email service — `src/server/services/email-service.ts`

- `buildTransport(cfg)` -> nodemailer transport: `{host, port, secure: port===465, auth:{user, pass}, tls:{rejectUnauthorized:false}}` (persis ba-handbook).
- `sendEmail({to, subject, body})` -> kirim `text: body` + `html: body.replace(/\n/g,'<br>')`, from `"<fromName>" <smtpUser>`. Return `{sent:boolean, error?}` — TIDAK melempar ke caller approve/reject (evidence-style best-effort).
- `testConnection(cfg)` -> `transporter.verify()`, map sukses/gagal ke pesan AC-B.04/05.
- `renderTemplate(tpl, vars)` -> substitusi `{{name}}/{{email}}/{{password}}/{{url}}/{{notes}}`.

### 5. Endpoint

Config (admin-only, di `config-routes.ts` atau route baru `email-config-routes.ts`):
- `GET  /api/v1/email-config` -> config tanpa password (AC-B.02)
- `POST /api/v1/email-config` -> simpan (AC-B.01/03/06/07)
- `POST /api/v1/email-config/test` -> test connection (AC-B.04/05)

Approve/Reject (di admin-routes, endpoint existing diperluas):
- Saat approve user: bila body `sendEmail` true, render approve template, kirim; hasil email tak menggagalkan approve (AC-A.03/05).
- Saat reject user: analog, template reject dengan `{{notes}}` (AC-A.04).

Forgot password (auth-routes, endpoint baru — TIDAK butuh JWT):
- `POST /api/v1/auth/forgot-password` {email} -> selalu balas pesan generik yang sama (AC-C.01/02); bila email cocok akun approved, buat token (crypto.randomBytes -> mentah di email, hash di DB), expiry 60 menit, kirim email berisi link `<origin>/reset-password?token=<mentah>`.
- `POST /api/v1/auth/reset-password` {token, password} -> hash token, cari user dengan hash cocok + belum expired + belum used; validasi password >=6 (AC-C.06); update password_hash (bcrypt), set reset_token_used=true. Pesan sukses/gagal per AC-C.03/04/05/06.

### 6. Frontend

- **Menu Configuration**: tab/section "Email" — form SMTP (host/port/user/password/from) + tombol Save & Test Connection + textarea template (approve/reject/reset subject+body). Password field placeholder "Leave blank to keep current password".
- **User Management**: dialog approve/reject dapat checkbox "Send email notification" (default on bila SMTP terkonfigurasi).
- **Login**: tautan "Forgot password?" -> form email -> submit. Halaman "Reset Password" (baca token dari query) -> form new/confirm password.

## Alur data (reset password)

```
User -> POST /auth/forgot-password {email}
  -> cari user approved by email
  -> token = randomBytes(32).hex();  hash = sha256(token)
  -> simpan hash + expires(+60m) + used=false di users
  -> kirim email link ?token=<token mentah>
  -> SELALU balas "If the email is registered, a reset link has been sent."
User klik link -> GET /reset-password?token=... (halaman)
User -> POST /auth/reset-password {token, password}
  -> hash=sha256(token); cari user hash cocok, not used, not expired
  -> validasi password>=6
  -> update password_hash (bcrypt.hashSync), used=true
  -> "Your password has been reset. Please log in with your new password."
```

## Error handling

- Email gagal saat approve/reject: aksi tetap sukses, pesan memberi tahu email gagal (AC-A.03/05). Best-effort, tidak melempar.
- SMTP belum dikonfigurasi: pesan "User approved. SMTP is not configured, so no email was sent." (AC-A.05).
- Enkripsi tanpa `EMAIL_CONFIG_SECRET`: menolak simpan dengan pesan jelas (fail-closed), tidak menyimpan plaintext.
- Forgot-password anti user-enumeration: pesan generik sama untuk email ada/tidak (AC-C.02).
- Reset token: hash-only di DB, sekali pakai, kedaluwarsa 60 menit.

## Testing (TDD)

Pure unit (tanpa DB/SMTP), masuk `npm test`:
- `secret-crypto`: round-trip, tamper authTag gagal, tanpa kunci fail-closed.
- `email-service.renderTemplate`: substitusi variabel benar, variabel tak dikenal dibiarkan.
- `email-service.buildTransport`: secure=true saat port 465, false saat 587.
- `email-config-store` password-preserve: input password kosong mempertahankan enc lama (logika pure diekstrak).
- Reset-token helper: sha256 stabil, cek expired/used (pure).

Integrasi (manual oleh Fahrudin, sesuai workflow): kirim email nyata via SMTP ba-handbook, alur approve/reject/forgot end-to-end.

## Dependency & env baru

- npm: `nodemailer` (+ `@types/nodemailer` dev).
- env: `EMAIL_CONFIG_SECRET` (kunci enkripsi), opsional seed SMTP.
- ffmpeg tak relevan. Tak ada perubahan pada engine generator/matcher.

## Yang TIDAK dikerjakan (YAGNI)

- IMAP (baca email masuk) — tak dibutuhkan approve/reject/reset.
- Rate limiting forgot-password — dicatat sebagai perbaikan lanjutan, bukan scope awal.
- Verifikasi email saat register — di luar scope.
