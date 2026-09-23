# Email/SMTP, Access Notification & Forgot Password Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Menambah email ke POC: admin mengelola SMTP+template (US-B), email otomatis saat approve/reject akses (US-A), dan forgot-password via link reset (US-C).

**Architecture:** Fondasi pure (enkripsi secret AES-256-GCM via `crypto` bawaan, render template, build transport nodemailer) diuji tanpa DB/SMTP. Di atasnya: tabel `email_config` (pola `app_config`) + kolom reset di `users`, store, `email-service`, endpoint config/approve/reject/forgot/reset, lalu frontend. Password SMTP dienkripsi at-rest; token reset disimpan sebagai hash SHA-256, sekali pakai, kedaluwarsa 60 menit.

**Tech Stack:** TypeScript + Express, Supabase (PostgreSQL), nodemailer, bcryptjs (sudah ada), Node `crypto` bawaan, test pure via `node scripts/*.js` (assert).

**Spec:** `docs/superpowers/specs/2026-09-23-email-smtp-forgot-password-design.md`

## Global Constraints

- Body/pesan email dan pesan sistem: **bahasa Inggris** (konsisten Doc_BA).
- Password SMTP TIDAK PERNAH dikembalikan plaintext ke frontend; kosong dari UI = pertahankan yang tersimpan.
- Token reset: hash SHA-256 di DB (bukan token mentah), sekali pakai, expiry 60 menit.
- Enkripsi memakai env `EMAIL_CONFIG_SECRET`; tanpa kunci -> fail-closed (menolak simpan, tidak menyimpan plaintext).
- Email gagal saat approve/reject TIDAK menggagalkan aksi (best-effort).
- Forgot-password anti user-enumeration: pesan generik sama untuk email ada/tidak.
- Test pure baru wajib masuk `package.json` script `test`.
- Ikuti pola commit atomik + tanpa trailer Claude (hook global strip).
- Transport nodemailer persis ba-handbook: `secure: port===465`, `tls:{rejectUnauthorized:false}`.

---

### Task 1: Enkripsi secret (AES-256-GCM)

**Files:**
- Create: `src/security/secret-crypto.ts`
- Test: `scripts/test-secret-crypto.js`

**Interfaces:**
- Produces: `encryptSecret(plain: string): string` (format `iv:authTag:ciphertext` hex), `decryptSecret(payload: string): string`. Keduanya melempar Error bila `EMAIL_CONFIG_SECRET` tak ada atau payload rusak.

- [ ] **Step 1: Tulis test gagal** — `scripts/test-secret-crypto.js`:

```js
'use strict';
const assert = require('assert');
process.env.EMAIL_CONFIG_SECRET = 'test-secret-key-for-unit-tests-32b';
const { encryptSecret, decryptSecret } = require('../dist/security/secret-crypto.js');
let passed = 0;
function ok(n, c){ assert.ok(c, 'FAILED: '+n); passed++; console.log('  ok '+n); }
(function(){
  console.log('\n[secret-crypto]');
  const enc = encryptSecret('RahasiaSmtp1');
  ok('format iv:tag:cipher', enc.split(':').length === 3);
  ok('ciphertext != plaintext', !enc.includes('RahasiaSmtp1'));
  ok('round-trip', decryptSecret(enc) === 'RahasiaSmtp1');
  // tamper authTag -> gagal
  const parts = enc.split(':'); parts[1] = 'deadbeef'.padEnd(parts[1].length,'0');
  let threw = false; try { decryptSecret(parts.join(':')); } catch { threw = true; }
  ok('tamper terdeteksi (throw)', threw);
  // tanpa kunci -> fail-closed
  const saved = process.env.EMAIL_CONFIG_SECRET; delete process.env.EMAIL_CONFIG_SECRET;
  let failClosed = false; try { encryptSecret('x'); } catch { failClosed = true; }
  process.env.EMAIL_CONFIG_SECRET = saved;
  ok('tanpa kunci fail-closed', failClosed);
  console.log('secret-crypto lulus: '+passed);
})();
```

- [ ] **Step 2: Jalankan, pastikan gagal** — `npm run build && node scripts/test-secret-crypto.js` → FAIL (module not found).

- [ ] **Step 3: Implementasi** — `src/security/secret-crypto.ts`:

```ts
import crypto from 'crypto';

/** Derive a 32-byte key from EMAIL_CONFIG_SECRET (scrypt). Fail-closed when unset. */
function getKey(): Buffer {
  const secret = process.env.EMAIL_CONFIG_SECRET;
  if (!secret) throw new Error('EMAIL_CONFIG_SECRET is not set; cannot encrypt/decrypt email secrets.');
  return crypto.scryptSync(secret, 'tester-lab-email-config', 32);
}

/** Encrypt a secret to "iv:authTag:ciphertext" (all hex), AES-256-GCM. */
export function encryptSecret(plain: string): string {
  const key = getKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${ct.toString('hex')}`;
}

/** Decrypt a payload produced by encryptSecret. Throws on tamper or bad format. */
export function decryptSecret(payload: string): string {
  const key = getKey();
  const [ivHex, tagHex, ctHex] = (payload || '').split(':');
  if (!ivHex || !tagHex || !ctHex) throw new Error('Malformed encrypted secret.');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  return Buffer.concat([decipher.update(Buffer.from(ctHex, 'hex')), decipher.final()]).toString('utf8');
}
```

- [ ] **Step 4: Jalankan, pastikan lulus** — `npm run build && node scripts/test-secret-crypto.js` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/security/secret-crypto.ts scripts/test-secret-crypto.js
git commit -m "feat(email): enkripsi secret AES-256-GCM untuk kredensial SMTP"
```

---

### Task 2: Template render, transport, dan token helper (pure)

**Files:**
- Create: `src/server/services/email-service.ts`
- Test: `scripts/test-email-service.js`

**Interfaces:**
- Produces:
  - `renderTemplate(tpl: string, vars: Record<string,string>): string` — ganti `{{key}}` dengan `vars[key]`; key tak dikenal dibiarkan apa adanya.
  - `transportOptions(cfg: {host:string;port:number;user:string;pass:string}): {host:string;port:number;secure:boolean;auth:{user:string;pass:string};tls:{rejectUnauthorized:boolean}}` — `secure = port===465`.
  - `hashResetToken(token: string): string` — SHA-256 hex.
  - `isResetTokenUsable(row: {expires: string|null; used: boolean|null}, now?: number): boolean` — true bila `!used` dan `now < Date.parse(expires)`.

- [ ] **Step 1: Tulis test gagal** — `scripts/test-email-service.js`:

```js
'use strict';
const assert = require('assert');
const { renderTemplate, transportOptions, hashResetToken, isResetTokenUsable } =
  require('../dist/server/services/email-service.js');
let passed = 0;
function ok(n,c){ assert.ok(c,'FAILED: '+n); passed++; console.log('  ok '+n); }
(function(){
  console.log('\n[email-service]');
  ok('substitusi variabel', renderTemplate('Hi {{name}} <{{email}}>', {name:'Budi',email:'b@c.com'}) === 'Hi Budi <b@c.com>');
  ok('variabel tak dikenal dibiarkan', renderTemplate('X {{unknown}}', {}) === 'X {{unknown}}');
  ok('multi occurrence', renderTemplate('{{p}}-{{p}}', {p:'z'}) === 'z-z');

  ok('port 465 secure', transportOptions({host:'h',port:465,user:'u',pass:'p'}).secure === true);
  ok('port 587 tidak secure', transportOptions({host:'h',port:587,user:'u',pass:'p'}).secure === false);
  ok('tls rejectUnauthorized false', transportOptions({host:'h',port:587,user:'u',pass:'p'}).tls.rejectUnauthorized === false);

  const h1 = hashResetToken('abc'); const h2 = hashResetToken('abc');
  ok('hash stabil & 64 hex', h1 === h2 && /^[0-9a-f]{64}$/.test(h1));
  ok('hash beda utk token beda', hashResetToken('abc') !== hashResetToken('abd'));

  const future = new Date(Date.now()+60000).toISOString();
  const past = new Date(Date.now()-1000).toISOString();
  ok('token valid (belum used, belum expired)', isResetTokenUsable({expires:future, used:false}) === true);
  ok('token used ditolak', isResetTokenUsable({expires:future, used:true}) === false);
  ok('token expired ditolak', isResetTokenUsable({expires:past, used:false}) === false);
  console.log('email-service lulus: '+passed);
})();
```

- [ ] **Step 2: Jalankan, pastikan gagal** — build + run → FAIL (module not found).

- [ ] **Step 3: Implementasi** — `src/server/services/email-service.ts` (bagian pure dulu; `sendEmail`/`testConnection` ditambah Task 4):

```ts
import crypto from 'crypto';
import nodemailer from 'nodemailer';

/** Replace {{key}} with vars[key]; unknown keys are left as-is. */
export function renderTemplate(tpl: string, vars: Record<string, string>): string {
  return (tpl || '').replace(/\{\{(\w+)\}\}/g, (m, k) => (k in vars ? vars[k] : m));
}

export interface SmtpCreds { host: string; port: number; user: string; pass: string; }

/** nodemailer transport options; secure only on port 465 (persis ba-handbook). */
export function transportOptions(cfg: SmtpCreds) {
  return {
    host: cfg.host,
    port: cfg.port,
    secure: cfg.port === 465,
    auth: { user: cfg.user, pass: cfg.pass },
    tls: { rejectUnauthorized: false }
  };
}

/** SHA-256 hex of a reset token (only the hash is persisted). */
export function hashResetToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/** A reset token is usable when not used and not past its expiry. */
export function isResetTokenUsable(row: { expires: string | null; used: boolean | null }, now: number = Date.now()): boolean {
  if (row.used) return false;
  if (!row.expires) return false;
  return now < Date.parse(row.expires);
}

// sendEmail / testConnection ditambahkan di Task 4 (butuh transportOptions + nodemailer).
export { nodemailer };
```

- [ ] **Step 4: Pasang nodemailer lalu jalankan test**

```bash
npm install nodemailer && npm install --save-dev @types/nodemailer
npm run build && node scripts/test-email-service.js
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/services/email-service.ts scripts/test-email-service.js package.json package-lock.json
git commit -m "feat(email): render template, transport nodemailer, dan token reset helper (pure)"
```

---

### Task 3: Migrasi DB — tabel email_config + kolom reset di users

**Files:**
- Create: `supabase/migration-add-email.sql`

**Interfaces:**
- Produces: tabel `email_config` (id=1) dan kolom `users.reset_token_hash`, `users.reset_token_expires`, `users.reset_token_used`.

- [ ] **Step 1: Tulis migrasi** — `supabase/migration-add-email.sql`:

```sql
-- Email configuration (single row, id=1), same pattern as app_config.
CREATE TABLE IF NOT EXISTS email_config (
  id INT PRIMARY KEY DEFAULT 1,
  smtp_host TEXT NOT NULL DEFAULT '',
  smtp_port INT NOT NULL DEFAULT 587,
  smtp_user TEXT NOT NULL DEFAULT '',
  smtp_pass_enc TEXT,
  smtp_from_name TEXT NOT NULL DEFAULT 'Tester Lab',
  approve_subject TEXT NOT NULL DEFAULT 'Your Tester Lab Account Has Been Created',
  approve_body TEXT NOT NULL DEFAULT 'Hello {{name}},

Your Tester Lab account has been created with the following details:

Email: {{email}}
Password: {{password}}

You can log in at: {{url}}

Please change your password after your first login.

Regards,
Tester Lab Admin',
  reject_subject TEXT NOT NULL DEFAULT 'Update on Your Tester Lab Access Request',
  reject_body TEXT NOT NULL DEFAULT 'Hello {{name}},

We are sorry, but your access request to Tester Lab could not be approved at this time.

{{notes}}

If you believe this is a mistake, please contact the team.

Regards,
Tester Lab Admin',
  reset_subject TEXT NOT NULL DEFAULT 'Reset Your Tester Lab Password',
  reset_body TEXT NOT NULL DEFAULT 'Hello {{name}},

We received a request to reset your Tester Lab password.

Click the link below to set a new password (valid for 60 minutes):
{{url}}

If you did not request this, you can safely ignore this email.

Regards,
Tester Lab Admin',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT email_config_singleton CHECK (id = 1)
);

ALTER TABLE email_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS email_config_service_role ON email_config;
CREATE POLICY email_config_service_role ON email_config FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Password reset token fields on users (hash only; raw token lives in the email link).
ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token_hash TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token_expires TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token_used BOOLEAN NOT NULL DEFAULT false;
```

- [ ] **Step 2: Verifikasi SQL secara sintaksis** (tak ada runner otomatis; Fahrudin menjalankan di Supabase). Baca ulang untuk memastikan tak ada typo kolom.

- [ ] **Step 3: Commit**

```bash
git add supabase/migration-add-email.sql
git commit -m "feat(email): migrasi tabel email_config + kolom reset token di users"
```

> Catatan eksekutor: migrasi ini WAJIB dijalankan Fahrudin di Supabase sebelum fitur jalan. Sertakan pengingat di handoff.

---

### Task 4: email-config-store + lengkapi email-service (sendEmail/testConnection)

**Files:**
- Create: `src/server/email-config-store.ts`
- Modify: `src/server/services/email-service.ts` (tambah sendEmail, testConnection)
- Test: `scripts/test-email-config-store.js` (bagian pure: password-preserve)

**Interfaces:**
- Produces (store):
  - `EmailConfigPublic` = { smtpHost, smtpPort, smtpUser, smtpFromName, approveSubject, approveBody, rejectSubject, rejectBody, resetSubject, resetBody } (TANPA password).
  - `loadEmailConfigPublic(): Promise<EmailConfigPublic>`
  - `loadSmtpCreds(): Promise<{host,port,user,pass}|null>` — pass sudah didekripsi; null bila host/user/pass tak lengkap.
  - `saveEmailConfig(input): Promise<void>` — bila `input.smtpPass` kosong/undefined, pertahankan enc lama; else enkripsi.
  - `mergeSmtpPass(prevEnc: string|null, newPass: string|undefined): string|null` (pure, diuji) — mengembalikan enc yang harus disimpan.
- Produces (service): `sendEmail(creds, fromName, {to,subject,body}): Promise<{sent:boolean;error?:string}>`, `testConnection(creds): Promise<{ok:boolean;error?:string}>`.

- [ ] **Step 1: Tulis test gagal** — `scripts/test-email-config-store.js` (uji `mergeSmtpPass` pure):

```js
'use strict';
const assert = require('assert');
process.env.EMAIL_CONFIG_SECRET = 'test-secret-key-for-unit-tests-32b';
const { mergeSmtpPass } = require('../dist/server/email-config-store.js');
const { decryptSecret } = require('../dist/security/secret-crypto.js');
let passed=0; function ok(n,c){ assert.ok(c,'FAILED: '+n); passed++; console.log('  ok '+n); }
(function(){
  console.log('\n[email-config-store.mergeSmtpPass]');
  const prev = require('../dist/security/secret-crypto.js').encryptSecret('LamaPass1');
  ok('pass kosong -> pertahankan enc lama', mergeSmtpPass(prev, '') === prev);
  ok('pass undefined -> pertahankan enc lama', mergeSmtpPass(prev, undefined) === prev);
  const next = mergeSmtpPass(prev, 'BaruPass2');
  ok('pass baru -> enc berubah', next !== prev);
  ok('pass baru -> decrypt cocok', decryptSecret(next) === 'BaruPass2');
  ok('prev null + pass kosong -> null', mergeSmtpPass(null, '') === null);
  console.log('mergeSmtpPass lulus: '+passed);
})();
```

- [ ] **Step 2: Jalankan, pastikan gagal** — build + run → FAIL.

- [ ] **Step 3: Implementasi store** — `src/server/email-config-store.ts`:

```ts
import { supabase } from './supabase-client.js';
import { encryptSecret, decryptSecret } from '../security/secret-crypto.js';

export interface EmailConfigPublic {
  smtpHost: string; smtpPort: number; smtpUser: string; smtpFromName: string;
  approveSubject: string; approveBody: string;
  rejectSubject: string; rejectBody: string;
  resetSubject: string; resetBody: string;
}
export interface SaveEmailConfigInput extends EmailConfigPublic { smtpPass?: string; }

/** Decide the stored encrypted password: keep old when new is blank, else encrypt. Pure. */
export function mergeSmtpPass(prevEnc: string | null, newPass: string | undefined): string | null {
  if (newPass === undefined || newPass === '') return prevEnc;
  return encryptSecret(newPass);
}

export async function loadEmailConfigPublic(): Promise<EmailConfigPublic> {
  const { data } = await supabase.from('email_config').select('*').eq('id', 1).single();
  const d = data || {};
  return {
    smtpHost: d.smtp_host || '', smtpPort: d.smtp_port || 587, smtpUser: d.smtp_user || '',
    smtpFromName: d.smtp_from_name || 'Tester Lab',
    approveSubject: d.approve_subject || '', approveBody: d.approve_body || '',
    rejectSubject: d.reject_subject || '', rejectBody: d.reject_body || '',
    resetSubject: d.reset_subject || '', resetBody: d.reset_body || ''
  };
}

export async function loadSmtpCreds(): Promise<{ host: string; port: number; user: string; pass: string } | null> {
  const { data } = await supabase.from('email_config').select('*').eq('id', 1).single();
  if (!data || !data.smtp_host || !data.smtp_user || !data.smtp_pass_enc) return null;
  let pass: string;
  try { pass = decryptSecret(data.smtp_pass_enc); } catch { return null; }
  return { host: data.smtp_host, port: data.smtp_port || 587, user: data.smtp_user, pass };
}

export async function saveEmailConfig(input: SaveEmailConfigInput): Promise<void> {
  const { data: prev } = await supabase.from('email_config').select('smtp_pass_enc').eq('id', 1).single();
  const passEnc = mergeSmtpPass(prev ? prev.smtp_pass_enc : null, input.smtpPass);
  const { error } = await supabase.from('email_config').upsert({
    id: 1, smtp_host: input.smtpHost, smtp_port: input.smtpPort, smtp_user: input.smtpUser,
    smtp_pass_enc: passEnc, smtp_from_name: input.smtpFromName,
    approve_subject: input.approveSubject, approve_body: input.approveBody,
    reject_subject: input.rejectSubject, reject_body: input.rejectBody,
    reset_subject: input.resetSubject, reset_body: input.resetBody,
    updated_at: new Date().toISOString()
  }, { onConflict: 'id' });
  if (error) throw new Error('Could not save email configuration');
}
```

- [ ] **Step 4: Lengkapi email-service** — tambahkan ke `src/server/services/email-service.ts`:

```ts
/** Send one email best-effort. Never throws; returns {sent, error?}. */
export async function sendEmail(
  creds: SmtpCreds, fromName: string, msg: { to: string; subject: string; body: string }
): Promise<{ sent: boolean; error?: string }> {
  try {
    const transporter = nodemailer.createTransport(transportOptions(creds));
    await transporter.sendMail({
      from: `"${fromName}" <${creds.user}>`,
      to: msg.to, subject: msg.subject,
      text: msg.body, html: msg.body.replace(/\n/g, '<br>')
    });
    return { sent: true };
  } catch (err) {
    return { sent: false, error: (err as Error).message };
  }
}

/** Verify SMTP connectivity for the Test Connection button. */
export async function testConnection(creds: SmtpCreds): Promise<{ ok: boolean; error?: string }> {
  try {
    const transporter = nodemailer.createTransport(transportOptions(creds));
    await transporter.verify();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}
```

- [ ] **Step 5: Jalankan test, pastikan lulus** — build + run → PASS.

- [ ] **Step 6: Commit**

```bash
git add src/server/email-config-store.ts src/server/services/email-service.ts scripts/test-email-config-store.js
git commit -m "feat(email): email-config store (password-preserve+enkripsi) dan sendEmail/testConnection"
```

---

### Task 5: Endpoint konfigurasi email (US-B)

**Files:**
- Create: `src/server/routes/email-config-routes.ts`
- Modify: `src/server/index.ts` (mount route di `/api/v1/email-config`)

**Interfaces:**
- Consumes: `loadEmailConfigPublic`, `saveEmailConfig`, `loadSmtpCreds`, `testConnection`, `authenticateJWT`, `requireAdmin`.
- Produces: `GET /api/v1/email-config`, `POST /api/v1/email-config`, `POST /api/v1/email-config/test`.

- [ ] **Step 1: Implementasi route** — `src/server/routes/email-config-routes.ts`:

```ts
import { Router, Response } from 'express';
import { authenticateJWT, requireAdmin } from '../auth-middleware.js';
import type { AuthenticatedRequest } from '../auth-middleware.js';
import { loadEmailConfigPublic, saveEmailConfig } from '../email-config-store.js';
import { testConnection, SmtpCreds } from '../services/email-service.js';

export const emailConfigRoutes = Router();

emailConfigRoutes.get('/', authenticateJWT, requireAdmin, async (_req: AuthenticatedRequest, res: Response) => {
  try {
    res.json({ success: true, data: await loadEmailConfigPublic() });
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

emailConfigRoutes.post('/', authenticateJWT, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const b = req.body || {};
    if (!b.smtpHost || !b.smtpUser) {
      res.status(400).json({ success: false, error: 'SMTP Host and SMTP User are required.' });
      return;
    }
    await saveEmailConfig({
      smtpHost: b.smtpHost, smtpPort: parseInt(b.smtpPort, 10) || 587, smtpUser: b.smtpUser,
      smtpPass: b.smtpPass, smtpFromName: b.smtpFromName || 'Tester Lab',
      approveSubject: b.approveSubject || '', approveBody: b.approveBody || '',
      rejectSubject: b.rejectSubject || '', rejectBody: b.rejectBody || '',
      resetSubject: b.resetSubject || '', resetBody: b.resetBody || ''
    });
    res.json({ success: true, message: 'Email configuration saved successfully.' });
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

emailConfigRoutes.post('/test', authenticateJWT, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const b = req.body || {};
  const creds: SmtpCreds = { host: b.smtpHost, port: parseInt(b.smtpPort, 10) || 587, user: b.smtpUser, pass: b.smtpPass };
  const r = await testConnection(creds);
  if (r.ok) res.json({ success: true, message: 'SMTP connection successful.' });
  else res.status(400).json({ success: false, error: `SMTP connection failed: ${r.error || 'could not connect to host.'}` });
});
```

- [ ] **Step 2: Mount route** — di `src/server/index.ts`, cari pola `app.use('/api/v1/config'...)` lalu tambah:

```ts
import { emailConfigRoutes } from './routes/email-config-routes.js';
app.use('/api/v1/email-config', emailConfigRoutes);
```

- [ ] **Step 3: Build & verifikasi kompilasi** — `npm run build` → sukses tanpa error TS.

- [ ] **Step 4: Commit**

```bash
git add src/server/routes/email-config-routes.ts src/server/index.ts
git commit -m "feat(email): endpoint konfigurasi email admin (get/save/test)"
```

---

### Task 6: Kirim email saat approve/reject (US-A)

**Files:**
- Modify: `src/server/routes/admin-routes.ts:137-186` (approve & reject handler)

**Interfaces:**
- Consumes: `loadSmtpCreds`, `loadEmailConfigPublic`, `sendEmail`, `renderTemplate`.
- Produces: perilaku email pada approve/reject; respons memuat pesan sesuai AC-A.03/05.

- [ ] **Step 1: Implementasi approve** — di handler `/users/:id/approve`, setelah `updateUserStatus(id,'approved')` sukses, sebelum `res.json`, sisipkan:

```ts
// Best-effort email notification (US-A). Never fails the approval.
let emailNote = '';
if (req.body && req.body.sendEmail) {
  const creds = await loadSmtpCreds();
  if (!creds) {
    emailNote = ' SMTP is not configured, so no email was sent.';
  } else {
    const cfg = await loadEmailConfigPublic();
    const tempPassword: string = req.body.password || '';
    const loginUrl = `${req.protocol}://${req.get('host')}/`;
    const body = renderTemplate(cfg.approveBody, {
      name: updated.username, email: updated.email, password: tempPassword, url: loginUrl
    });
    const r = await sendEmail(creds, cfg.smtpFromName, { to: updated.email, subject: cfg.approveSubject, body });
    if (!r.sent) emailNote = ' but the email failed to send.';
  }
}
```

Lalu ganti pesan respons menjadi:

```ts
const base = emailNote.startsWith(' but') ? `User approved,${emailNote}` : `User approved.${emailNote}`;
res.json({ success: true, message: base, user: { /* field existing */ } });
```

(Pesan hasil: "User approved, but the email failed to send." / "User approved. SMTP is not configured, so no email was sent." / "User approved." — sesuai AC-A.03/05.)

- [ ] **Step 2: Implementasi reject** — di handler `/users/:id/reject`, setelah sukses:

```ts
if (req.body && req.body.sendEmail) {
  const creds = await loadSmtpCreds();
  if (creds) {
    const cfg = await loadEmailConfigPublic();
    const notes = req.body.notes ? `Reason: ${req.body.notes}` : '';
    const body = renderTemplate(cfg.rejectBody, { name: updated.username, email: updated.email, notes });
    await sendEmail(creds, cfg.smtpFromName, { to: updated.email, subject: cfg.rejectSubject, body });
  }
}
```

- [ ] **Step 3: Tambah import** di atas `admin-routes.ts`:

```ts
import { loadSmtpCreds, loadEmailConfigPublic } from '../email-config-store.js';
import { sendEmail, renderTemplate } from '../services/email-service.js';
```

- [ ] **Step 4: Build & verifikasi** — `npm run build` sukses.

- [ ] **Step 5: Commit**

```bash
git add src/server/routes/admin-routes.ts
git commit -m "feat(email): kirim notifikasi email saat approve/reject akses (best-effort)"
```

---

### Task 7: Forgot & reset password (US-C)

**Files:**
- Modify: `src/server/routes/auth-routes.ts` (tambah 2 endpoint)
- Modify: `src/server/auth-store.ts` (tambah helper token)
- Test: `scripts/test-reset-token-store.js` (pure: setResetToken payload shape)

**Interfaces:**
- Consumes: `hashResetToken`, `isResetTokenUsable`, `loadSmtpCreds`, `loadEmailConfigPublic`, `renderTemplate`, `sendEmail`, `bcrypt`.
- Produces (auth-store): `findUserByEmailAsync(email)`, `setResetToken(userId, hash, expiresIso)`, `findUserByResetHash(hash)`, `consumeResetToken(userId, newPasswordHash)`.
- Produces (routes): `POST /api/v1/auth/forgot-password`, `POST /api/v1/auth/reset-password`.

- [ ] **Step 1: Tambah helper di auth-store.ts**:

```ts
export async function findUserByEmailAsync(email: string): Promise<User | undefined> {
  const { data, error } = await supabase.from('users').select('*').ilike('email', email).limit(1).single();
  if (error || !data) return undefined;
  return rowToUser(data);
}
export async function setResetToken(userId: string, hash: string, expiresIso: string): Promise<void> {
  await supabase.from('users').update({ reset_token_hash: hash, reset_token_expires: expiresIso, reset_token_used: false }).eq('id', userId);
}
export async function findUserByResetHash(hash: string): Promise<{ id: string; expires: string | null; used: boolean } | undefined> {
  const { data, error } = await supabase.from('users').select('id, reset_token_expires, reset_token_used').eq('reset_token_hash', hash).limit(1).single();
  if (error || !data) return undefined;
  return { id: data.id, expires: data.reset_token_expires, used: data.reset_token_used };
}
export async function consumeResetToken(userId: string, newPasswordHash: string): Promise<void> {
  await supabase.from('users').update({ password_hash: newPasswordHash, reset_token_used: true }).eq('id', userId);
}
```

- [ ] **Step 2: Tulis test pure token store** — `scripts/test-reset-token-store.js` menguji `isResetTokenUsable` untuk kombinasi used/expired (mengunci aturan yang dipakai route). (Gunakan import dari email-service; ini menegaskan aturan sekali-pakai + 60 menit dipakai konsisten.)

```js
'use strict';
const assert = require('assert');
const { isResetTokenUsable, hashResetToken } = require('../dist/server/services/email-service.js');
let passed=0; function ok(n,c){ assert.ok(c,'FAILED: '+n); passed++; console.log('  ok '+n); }
(function(){
  console.log('\n[reset-token]');
  const soon = new Date(Date.now()+60*60*1000).toISOString();
  ok('valid dalam 60 menit', isResetTokenUsable({expires:soon, used:false}));
  ok('used ditolak', !isResetTokenUsable({expires:soon, used:true}));
  ok('expired ditolak', !isResetTokenUsable({expires:new Date(Date.now()-1).toISOString(), used:false}));
  ok('hash != token', hashResetToken('secret') !== 'secret');
  console.log('reset-token lulus: '+passed);
})();
```

- [ ] **Step 3: Jalankan, pastikan lulus** — build + run → PASS (fungsi sudah ada dari Task 2).

- [ ] **Step 4: Tambah endpoint forgot-password** di `auth-routes.ts`:

```ts
authRoutes.post('/forgot-password', async (req: Request, res: Response) => {
  const generic = 'If the email is registered, a reset link has been sent.';
  try {
    const { email } = req.body || {};
    if (!email) { res.status(400).json({ success: false, error: 'Email is required.' }); return; }
    const user = await findUserByEmailAsync(email);
    if (user && user.status === 'approved') {
      const creds = await loadSmtpCreds();
      if (creds) {
        const raw = crypto.randomBytes(32).toString('hex');
        const hash = hashResetToken(raw);
        const expires = new Date(Date.now() + 60 * 60 * 1000).toISOString();
        await setResetToken(user.id, hash, expires);
        const cfg = await loadEmailConfigPublic();
        const url = `${req.protocol}://${req.get('host')}/reset-password?token=${raw}`;
        const body = renderTemplate(cfg.resetBody, { name: user.username, email: user.email, url });
        await sendEmail(creds, cfg.smtpFromName, { to: user.email, subject: cfg.resetSubject, body });
      }
    }
    res.json({ success: true, message: generic });
  } catch {
    res.json({ success: true, message: generic }); // tetap generik walau error internal
  }
});
```

- [ ] **Step 5: Tambah endpoint reset-password** di `auth-routes.ts`:

```ts
authRoutes.post('/reset-password', async (req: Request, res: Response) => {
  try {
    const { token, password } = req.body || {};
    if (!token || !password) { res.status(400).json({ success: false, error: 'Token and password are required.' }); return; }
    if (password.length < 6) { res.status(400).json({ success: false, error: 'Password must be at least 6 characters long.' }); return; }
    const rec = await findUserByResetHash(hashResetToken(token));
    if (!rec) { res.status(400).json({ success: false, error: 'This reset link is invalid. Please request a new one.' }); return; }
    if (rec.used) { res.status(400).json({ success: false, error: 'This reset link has already been used. Please request a new one.' }); return; }
    if (!isResetTokenUsable({ expires: rec.expires, used: rec.used })) {
      res.status(400).json({ success: false, error: 'This reset link has expired. Please request a new one.' }); return;
    }
    await consumeResetToken(rec.id, bcrypt.hashSync(password, 10));
    res.json({ success: true, message: 'Your password has been reset. Please log in with your new password.' });
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});
```

- [ ] **Step 6: Tambah import** di `auth-routes.ts`:

```ts
import crypto from 'crypto';
import { findUserByEmailAsync, setResetToken, findUserByResetHash, consumeResetToken } from '../auth-store.js';
import { loadSmtpCreds, loadEmailConfigPublic } from '../email-config-store.js';
import { sendEmail, renderTemplate, hashResetToken, isResetTokenUsable } from '../services/email-service.js';
```

- [ ] **Step 7: Build & verifikasi** — `npm run build` sukses.

- [ ] **Step 8: Commit**

```bash
git add src/server/routes/auth-routes.ts src/server/auth-store.ts scripts/test-reset-token-store.js
git commit -m "feat(email): forgot-password dan reset-password via token (hash, sekali pakai, 60 menit)"
```

---

### Task 8: Frontend — menu konfigurasi Email, approve/reject checkbox, forgot & reset UI

**Files:**
- Modify: `public/index.html` (form Email di menu Configuration; tautan Forgot password + form; halaman Reset Password)
- Modify: `public/js/app.js` (load/save/test email config; kirim sendEmail+password saat approve/reject; forgot/reset handler)

**Interfaces:**
- Consumes endpoint: `/api/v1/email-config` (GET/POST/test), `/api/v1/auth/forgot-password`, `/api/v1/auth/reset-password`, plus approve/reject existing dengan body `{sendEmail, password, notes}`.

- [ ] **Step 1: Form konfigurasi Email** — tambahkan section "Email" di menu Configuration (admin) di `index.html`: input SMTP Host, Port, User, Password (placeholder "Leave blank to keep current password"), From Name; tombol "Save Configuration" + "Test Connection"; textarea approve/reject/reset subject+body. Ikuti pola markup config existing (lihat `#tab-*`/config modal yang sudah ada).

- [ ] **Step 2: app.js load/save/test** — fungsi `loadEmailConfig()` (GET, isi form, password dibiarkan kosong), `saveEmailConfig()` (POST body form; tampilkan pesan server), `testEmailConnection()` (POST /test; tampilkan pesan sukses/gagal via showSnackbar).

- [ ] **Step 3: Approve/reject dialog** — pada aksi approve, sertakan `password` (default/temporary) dan checkbox "Send email notification" -> body `{sendEmail, password}`; pada reject sertakan `{sendEmail, notes}`. Tampilkan `data.message` dari server (memuat catatan email).

- [ ] **Step 4: Forgot password UI** — di halaman Login tambah tautan "Forgot password?" -> tampilkan form email -> POST `/auth/forgot-password` -> tampilkan `data.message` (generik). 

- [ ] **Step 5: Reset password page** — halaman/rute klien `reset-password` membaca `?token=` dari URL, form New Password + Confirm Password -> POST `/auth/reset-password` {token, password} -> tampilkan `data.message`, arahkan ke Login saat sukses.

- [ ] **Step 6: Syntax check + build** — `node --check public/js/app.js && npm run build`.

- [ ] **Step 7: Commit**

```bash
git add public/index.html public/js/app.js
git commit -m "feat(email): UI konfigurasi SMTP+template, opsi email approve/reject, forgot & reset password"
```

---

### Task 9: Registrasi test ke npm test + env example + dokumentasi

**Files:**
- Modify: `package.json` (script `test` tambah test baru)
- Modify: `.env.example` (tambah SMTP + EMAIL_CONFIG_SECRET)

- [ ] **Step 1: Tambah test ke `package.json`** script `test`: `&& node scripts/test-secret-crypto.js && node scripts/test-email-service.js && node scripts/test-email-config-store.js && node scripts/test-reset-token-store.js`.

- [ ] **Step 2: Update `.env.example`** tambah:

```
# Email / SMTP (dikelola via menu Configuration; env ini opsional seed)
EMAIL_CONFIG_SECRET=change-me-32-byte-secret-for-smtp-encryption
```

- [ ] **Step 3: Jalankan seluruh test** — `npm test` → semua PASS.

- [ ] **Step 4: Commit**

```bash
git add package.json .env.example
git commit -m "test(email): daftarkan test email ke npm test + env example EMAIL_CONFIG_SECRET"
```

---

## Catatan handoff (WAJIB disampaikan ke Fahrudin)

1. Jalankan `supabase/migration-add-email.sql` di Supabase (tabel + kolom reset) SEBELUM fitur dipakai.
2. Set env `EMAIL_CONFIG_SECRET` (32 byte) di server/VPS; tanpa ini simpan SMTP menolak (fail-closed).
3. `npm install nodemailer` sudah masuk Task 2; di VPS jalankan `npm install` setelah pull.
4. Verifikasi manual end-to-end (kirim email nyata via SMTP ba-handbook) dilakukan Fahrudin.
5. US-A/B/C + AC belum ditulis ke Doc_BA xlsx (pengingat aktif [[pending-ac-within-title]]).
