/*
 * Enkripsi secret (AES-256-GCM) untuk kredensial SMTP di email_config.
 * Round-trip encrypt/decrypt, deteksi tamper (authTag), fail-closed tanpa kunci.
 * Run: node scripts/test-secret-crypto.js
 */
'use strict';
const assert = require('assert');
process.env.EMAIL_CONFIG_SECRET = 'test-secret-key-for-unit-tests-32b';
const { encryptSecret, decryptSecret } = require('../dist/security/secret-crypto.js');
let passed = 0;
function ok(n, c) { assert.ok(c, 'FAILED: ' + n); passed++; console.log('  ok ' + n); }
(function () {
  console.log('\n[secret-crypto]');
  const enc = encryptSecret('RahasiaSmtp1');
  ok('format iv:tag:cipher', enc.split(':').length === 3);
  ok('ciphertext != plaintext', !enc.includes('RahasiaSmtp1'));
  ok('round-trip', decryptSecret(enc) === 'RahasiaSmtp1');
  // tamper authTag -> gagal
  const parts = enc.split(':');
  parts[1] = 'deadbeef'.padEnd(parts[1].length, '0');
  let threw = false;
  try { decryptSecret(parts.join(':')); } catch { threw = true; }
  ok('tamper terdeteksi (throw)', threw);
  // tanpa kunci -> fail-closed
  const saved = process.env.EMAIL_CONFIG_SECRET;
  delete process.env.EMAIL_CONFIG_SECRET;
  let failClosed = false;
  try { encryptSecret('x'); } catch { failClosed = true; }
  process.env.EMAIL_CONFIG_SECRET = saved;
  ok('tanpa kunci fail-closed', failClosed);
  console.log('secret-crypto lulus: ' + passed);
})();
