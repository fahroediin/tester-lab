/*
 * tester-lab - Email service: template rendering, SMTP transport, reset-token
 * helpers, and best-effort send/verify. Used by approve/reject notifications
 * (US-A) and forgot-password (US-C). Body language is English (Doc_BA parity).
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import crypto from 'crypto';
import nodemailer from 'nodemailer';

/** Replace {{key}} with vars[key]; unknown keys are left as-is. Pure. */
export function renderTemplate(tpl: string, vars: Record<string, string>): string {
  return (tpl || '').replace(/\{\{(\w+)\}\}/g, (m, k) => {
    const v = vars[k];
    return v !== undefined ? v : m;
  });
}

export interface SmtpCreds {
  host: string;
  port: number;
  user: string;
  pass: string;
}

/** nodemailer transport options; secure only on port 465 (matches ba-handbook). Pure. */
export function transportOptions(cfg: SmtpCreds) {
  return {
    host: cfg.host,
    port: cfg.port,
    secure: cfg.port === 465,
    auth: { user: cfg.user, pass: cfg.pass },
    tls: { rejectUnauthorized: false }
  };
}

/** SHA-256 hex of a reset token; only this hash is persisted. Pure. */
export function hashResetToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/** A reset token is usable when not used and not past its expiry. Pure. */
export function isResetTokenUsable(
  row: { expires: string | null; used: boolean | null },
  now: number = Date.now()
): boolean {
  if (row.used) return false;
  if (!row.expires) return false;
  return now < Date.parse(row.expires);
}

/** Send one email best-effort. Never throws; returns {sent, error?}. */
export async function sendEmail(
  creds: SmtpCreds,
  fromName: string,
  msg: { to: string; subject: string; body: string }
): Promise<{ sent: boolean; error?: string }> {
  try {
    const transporter = nodemailer.createTransport(transportOptions(creds));
    await transporter.sendMail({
      from: `"${fromName}" <${creds.user}>`,
      to: msg.to,
      subject: msg.subject,
      text: msg.body,
      html: msg.body.replace(/\n/g, '<br>')
    });
    return { sent: true };
  } catch (err) {
    return { sent: false, error: (err as Error).message };
  }
}

/** Verify SMTP connectivity for the Test Connection button. Never throws. */
export async function testConnection(creds: SmtpCreds): Promise<{ ok: boolean; error?: string }> {
  try {
    const transporter = nodemailer.createTransport(transportOptions(creds));
    await transporter.verify();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}
