/*
 * tester-lab - Email configuration store (single row, id=1). SMTP password is
 * encrypted at rest; the public loader never returns it. A blank password from
 * the UI keeps the stored one (mergeSmtpPass).
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import { supabase } from './supabase-client.js';
import { encryptSecret, decryptSecret } from '../security/secret-crypto.js';

export interface EmailConfigPublic {
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpFromName: string;
  approveSubject: string;
  approveBody: string;
  rejectSubject: string;
  rejectBody: string;
  resetSubject: string;
  resetBody: string;
}

export interface SaveEmailConfigInput extends EmailConfigPublic {
  /** Blank/undefined keeps the currently stored (encrypted) password. */
  smtpPass?: string;
}

/** Decide the stored encrypted password: keep old when new is blank, else encrypt. Pure. */
export function mergeSmtpPass(prevEnc: string | null, newPass: string | undefined): string | null {
  if (newPass === undefined || newPass === '') return prevEnc;
  return encryptSecret(newPass);
}

export async function loadEmailConfigPublic(): Promise<EmailConfigPublic> {
  const { data } = await supabase.from('email_config').select('*').eq('id', 1).single();
  const d = (data || {}) as Record<string, unknown>;
  return {
    smtpHost: (d.smtp_host as string) || '',
    smtpPort: (d.smtp_port as number) || 587,
    smtpUser: (d.smtp_user as string) || '',
    smtpFromName: (d.smtp_from_name as string) || 'Tester Lab',
    approveSubject: (d.approve_subject as string) || '',
    approveBody: (d.approve_body as string) || '',
    rejectSubject: (d.reject_subject as string) || '',
    rejectBody: (d.reject_body as string) || '',
    resetSubject: (d.reset_subject as string) || '',
    resetBody: (d.reset_body as string) || ''
  };
}

/** SMTP credentials with the decrypted password, or null when incomplete/undecryptable. */
export async function loadSmtpCreds(): Promise<{ host: string; port: number; user: string; pass: string } | null> {
  const { data } = await supabase.from('email_config').select('*').eq('id', 1).single();
  if (!data || !data.smtp_host || !data.smtp_user || !data.smtp_pass_enc) return null;
  let pass: string;
  try {
    pass = decryptSecret(data.smtp_pass_enc);
  } catch {
    return null;
  }
  return { host: data.smtp_host, port: data.smtp_port || 587, user: data.smtp_user, pass };
}

export async function saveEmailConfig(input: SaveEmailConfigInput): Promise<void> {
  const { data: prev } = await supabase.from('email_config').select('smtp_pass_enc').eq('id', 1).single();
  const passEnc = mergeSmtpPass(prev ? (prev.smtp_pass_enc as string | null) : null, input.smtpPass);
  const { error } = await supabase.from('email_config').upsert(
    {
      id: 1,
      smtp_host: input.smtpHost,
      smtp_port: input.smtpPort,
      smtp_user: input.smtpUser,
      smtp_pass_enc: passEnc,
      smtp_from_name: input.smtpFromName,
      approve_subject: input.approveSubject,
      approve_body: input.approveBody,
      reject_subject: input.rejectSubject,
      reject_body: input.rejectBody,
      reset_subject: input.resetSubject,
      reset_body: input.resetBody,
      updated_at: new Date().toISOString()
    },
    { onConflict: 'id' }
  );
  if (error) throw new Error('Could not save email configuration');
}
