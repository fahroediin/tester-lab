/*
 * email-config-store.mergeSmtpPass: password kosong dari UI mempertahankan enc
 * lama; password baru dienkripsi. Run: node scripts/test-email-config-store.js
 */
'use strict';
const assert = require('assert');
process.env.EMAIL_CONFIG_SECRET = 'test-secret-key-for-unit-tests-32b';
const { mergeSmtpPass } = require('../dist/server/email-config-store.js');
const { encryptSecret, decryptSecret } = require('../dist/security/secret-crypto.js');
let passed = 0;
function ok(n, c) { assert.ok(c, 'FAILED: ' + n); passed++; console.log('  ok ' + n); }
(function () {
  console.log('\n[email-config-store.mergeSmtpPass]');
  const prev = encryptSecret('LamaPass1');
  ok('pass kosong -> pertahankan enc lama', mergeSmtpPass(prev, '') === prev);
  ok('pass undefined -> pertahankan enc lama', mergeSmtpPass(prev, undefined) === prev);
  const next = mergeSmtpPass(prev, 'BaruPass2');
  ok('pass baru -> enc berubah', next !== prev);
  ok('pass baru -> decrypt cocok', decryptSecret(next) === 'BaruPass2');
  ok('prev null + pass kosong -> null', mergeSmtpPass(null, '') === null);
  console.log('mergeSmtpPass lulus: ' + passed);
})();
