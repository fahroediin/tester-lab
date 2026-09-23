/*
 * Aturan token reset yang dipakai endpoint: valid dalam 60 menit, sekali pakai,
 * hash != token mentah. Mengunci konsistensi isReset­TokenUsable/hashResetToken.
 * Run: node scripts/test-reset-token-store.js
 */
'use strict';
const assert = require('assert');
const { isResetTokenUsable, hashResetToken } = require('../dist/server/services/email-service.js');
let passed = 0;
function ok(n, c) { assert.ok(c, 'FAILED: ' + n); passed++; console.log('  ok ' + n); }
(function () {
  console.log('\n[reset-token]');
  const soon = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  ok('valid dalam 60 menit', isResetTokenUsable({ expires: soon, used: false }));
  ok('used ditolak', !isResetTokenUsable({ expires: soon, used: true }));
  ok('expired ditolak', !isResetTokenUsable({ expires: new Date(Date.now() - 1).toISOString(), used: false }));
  ok('hash != token', hashResetToken('secret') !== 'secret');
  console.log('reset-token lulus: ' + passed);
})();
