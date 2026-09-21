/*
 * Identitas scenario untuk upsert saat generate-ulang.
 * Dua scenario dianggap SAMA bila nama (ternormalisasi: trim + case-insensitive),
 * project (folderId), dan suite (suiteId) cocok. Generate-ulang dengan identitas
 * sama = edit (UPDATE record), bukan record baru.
 * Run: node scripts/test-scenario-identity.js
 */
'use strict';

const assert = require('assert');
const { normalizeScenarioName, matchesScenarioIdentity } = require('../dist/server/flow-history-store.js');

let passed = 0;
function ok(name, cond) {
  assert.ok(cond, 'FAILED: ' + name);
  passed++;
  console.log('  ✓ ' + name);
}

(function () {
  console.log('\n[scenario-identity] normalizeScenarioName');
  ok('trim spasi', normalizeScenarioName('  Login  ') === 'login');
  ok('lowercase', normalizeScenarioName('LOGIN') === 'login');
  ok('trim + lowercase', normalizeScenarioName('  Login Berhasil ') === 'login berhasil');
  ok('null/undefined -> string kosong', normalizeScenarioName(undefined) === '' && normalizeScenarioName(null) === '');
  ok('spasi ganda di tengah dipertahankan', normalizeScenarioName('Login  Berhasil') === 'login  berhasil');

  console.log('\n[scenario-identity] matchesScenarioIdentity');
  const base = { testSuite: 'Login', folderId: 'proj-1', suiteId: 'suite-1' };

  ok('nama sama persis + folder + suite cocok', matchesScenarioIdentity(base, { testSuite: 'Login', folderId: 'proj-1', suiteId: 'suite-1' }));
  ok('nama beda kapital dianggap cocok', matchesScenarioIdentity(base, { testSuite: 'login', folderId: 'proj-1', suiteId: 'suite-1' }));
  ok('nama dengan spasi ekstra dianggap cocok', matchesScenarioIdentity(base, { testSuite: '  Login ', folderId: 'proj-1', suiteId: 'suite-1' }));

  ok('nama beda TIDAK cocok', !matchesScenarioIdentity(base, { testSuite: 'Logout', folderId: 'proj-1', suiteId: 'suite-1' }));
  ok('folder beda TIDAK cocok', !matchesScenarioIdentity(base, { testSuite: 'Login', folderId: 'proj-2', suiteId: 'suite-1' }));
  ok('suite beda TIDAK cocok', !matchesScenarioIdentity(base, { testSuite: 'Login', folderId: 'proj-1', suiteId: 'suite-2' }));

  // Guard nilai kosong: record tanpa folder/suite tidak boleh cocok dengan yang punya folder/suite.
  const noScope = { testSuite: 'Login', folderId: null, suiteId: null };
  ok('null folder vs berisi TIDAK cocok', !matchesScenarioIdentity(noScope, { testSuite: 'Login', folderId: 'proj-1', suiteId: 'suite-1' }));
  ok('null folder & suite cocok dengan sama-sama null', matchesScenarioIdentity(noScope, { testSuite: 'Login', folderId: null, suiteId: null }));

  console.log('\nSemua test scenario-identity lulus: ' + passed);
})();
