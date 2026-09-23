/*
 * email-service pure helpers: render template, transport options, token hash+usable.
 * Run: node scripts/test-email-service.js
 */
'use strict';
const assert = require('assert');
const { renderTemplate, transportOptions, hashResetToken, isResetTokenUsable } =
  require('../dist/server/services/email-service.js');
let passed = 0;
function ok(n, c) { assert.ok(c, 'FAILED: ' + n); passed++; console.log('  ok ' + n); }
(function () {
  console.log('\n[email-service]');
  ok('substitusi variabel', renderTemplate('Hi {{name}} <{{email}}>', { name: 'Budi', email: 'b@c.com' }) === 'Hi Budi <b@c.com>');
  ok('variabel tak dikenal dibiarkan', renderTemplate('X {{unknown}}', {}) === 'X {{unknown}}');
  ok('multi occurrence', renderTemplate('{{p}}-{{p}}', { p: 'z' }) === 'z-z');

  ok('port 465 secure', transportOptions({ host: 'h', port: 465, user: 'u', pass: 'p' }).secure === true);
  ok('port 587 tidak secure', transportOptions({ host: 'h', port: 587, user: 'u', pass: 'p' }).secure === false);
  ok('tls rejectUnauthorized false', transportOptions({ host: 'h', port: 587, user: 'u', pass: 'p' }).tls.rejectUnauthorized === false);

  const h1 = hashResetToken('abc'); const h2 = hashResetToken('abc');
  ok('hash stabil & 64 hex', h1 === h2 && /^[0-9a-f]{64}$/.test(h1));
  ok('hash beda utk token beda', hashResetToken('abc') !== hashResetToken('abd'));

  const future = new Date(Date.now() + 60000).toISOString();
  const past = new Date(Date.now() - 1000).toISOString();
  ok('token valid (belum used, belum expired)', isResetTokenUsable({ expires: future, used: false }) === true);
  ok('token used ditolak', isResetTokenUsable({ expires: future, used: true }) === false);
  ok('token expired ditolak', isResetTokenUsable({ expires: past, used: false }) === false);
  console.log('email-service lulus: ' + passed);
})();
