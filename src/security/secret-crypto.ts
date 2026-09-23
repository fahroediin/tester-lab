/*
 * tester-lab - Encrypt/decrypt small secrets at rest (SMTP password in email_config).
 * AES-256-GCM using Node's built-in crypto; key derived from EMAIL_CONFIG_SECRET.
 * Fail-closed: without the env key, encryption/decryption throws rather than
 * storing or returning plaintext.
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import crypto from 'crypto';

/** Derive a 32-byte key from EMAIL_CONFIG_SECRET (scrypt). Fail-closed when unset. */
function getKey(): Buffer {
  const secret = process.env.EMAIL_CONFIG_SECRET;
  if (!secret) {
    throw new Error('EMAIL_CONFIG_SECRET is not set; cannot encrypt/decrypt email secrets.');
  }
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
