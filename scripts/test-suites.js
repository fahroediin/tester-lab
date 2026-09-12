/*
 * Unit and integration tests for Project & Suite hierarchy and compatibility.
 * Run: node scripts/test-suites.js
 */
'use strict';
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy';

const assert = require('assert');

let passed = 0;
function ok(name, cond) {
  assert.ok(cond, 'FAILED: ' + name);
  passed++;
  console.log('  ✓ ' + name);
}

(async () => {
  console.log('\n[1] Type definitions and backward compat');
  const folderStore = require('../dist/server/folder-store.js');
  ok('getUserProjects is exported', typeof folderStore.getUserProjects === 'function');
  ok('getUserFolders is aliased to getUserProjects', folderStore.getUserFolders === folderStore.getUserProjects);
  ok('createProject is exported', typeof folderStore.createProject === 'function');
  ok('createFolder is aliased to createProject', folderStore.createFolder === folderStore.createProject);
  ok('getProjectById is exported', typeof folderStore.getProjectById === 'function');
  ok('getFolderById is aliased to getProjectById', folderStore.getFolderById === folderStore.getProjectById);
  ok('updateProject is exported', typeof folderStore.updateProject === 'function');
  ok('deleteProject is exported', typeof folderStore.deleteProject === 'function');

  console.log('\n[2] Suite Store exports');
  const suiteStore = require('../dist/server/suite-store.js');
  ok('getSuitesByProjectId is exported', typeof suiteStore.getSuitesByProjectId === 'function');
  ok('getSuiteById is exported', typeof suiteStore.getSuiteById === 'function');
  ok('createSuite is exported', typeof suiteStore.createSuite === 'function');
  ok('updateSuite is exported', typeof suiteStore.updateSuite === 'function');
  ok('deleteSuite is exported', typeof suiteStore.deleteSuite === 'function');

  console.log('\n[3] Flow History Store suiteId support');
  const historyStore = require('../dist/server/flow-history-store.js');
  ok('addHistory is exported', typeof historyStore.addHistory === 'function');
  ok('updateHistory is exported', typeof historyStore.updateHistory === 'function');
  ok('getUserHistorySummaries is exported (lightweight list)', typeof historyStore.getUserHistorySummaries === 'function');
  ok('getScenarioCountsByFolder is exported (count query)', typeof historyStore.getScenarioCountsByFolder === 'function');
  ok('getScenarioCountsBySuite is exported (count query)', typeof historyStore.getScenarioCountsBySuite === 'function');

  console.log('\n[4] Route module exports');
  const { folderRoutes } = require('../dist/server/routes/folder-routes.js');
  const { suiteRoutes } = require('../dist/server/routes/suite-routes.js');
  const { historyRoutes } = require('../dist/server/routes/history-routes.js');
  const { testRoutes } = require('../dist/server/routes/test-routes.js');
  ok('folderRoutes router is exported', typeof folderRoutes === 'function');
  ok('suiteRoutes router is exported', typeof suiteRoutes === 'function');
  ok('historyRoutes router is exported', typeof historyRoutes === 'function');
  ok('testRoutes router is exported', typeof testRoutes === 'function');

  console.log('\n[5] Run Suite — computeJobStatus (AC-15.03/07/11) Model B');
  const runSuite = require('../dist/server/services/run-suite-service.js');
  ok('computeJobStatus is exported', typeof runSuite.computeJobStatus === 'function');
  const cjs = runSuite.computeJobStatus;
  // AC-15.03: semua lolos -> PASSED
  ok('all SUCCESS -> PASSED', cjs(['SUCCESS', 'SUCCESS', 'SUCCESS']) === 'PASSED');
  // AC-15.07/11: sebagian gagal -> PARTIAL
  ok('mixed SUCCESS+FAILED -> PARTIAL', cjs(['SUCCESS', 'FAILED', 'SUCCESS']) === 'PARTIAL');
  // semua gagal -> FAILED
  ok('all FAILED -> FAILED', cjs(['FAILED', 'FAILED']) === 'FAILED');
  // AC-15.10/11: SKIPPED tidak menggugurkan; status dari yang dijalankan
  ok('SKIPPED ignored, rest all pass -> PASSED', cjs(['SUCCESS', 'SKIPPED', 'SUCCESS']) === 'PASSED');
  ok('SKIPPED ignored, rest mixed -> PARTIAL', cjs(['SUCCESS', 'SKIPPED', 'FAILED']) === 'PARTIAL');
  ok('SKIPPED ignored, rest all fail -> FAILED', cjs(['FAILED', 'SKIPPED']) === 'FAILED');
  // tidak ada yang benar-benar dijalankan (semua SKIPPED) -> SKIPPED
  ok('all SKIPPED -> SKIPPED', cjs(['SKIPPED', 'SKIPPED']) === 'SKIPPED');
  // suite kosong / input kosong -> SKIPPED (tidak ada yang dijalankan)
  ok('empty results -> SKIPPED', cjs([]) === 'SKIPPED');
  ok('single SUCCESS -> PASSED (AC-15.12-14)', cjs(['SUCCESS']) === 'PASSED');
  ok('single FAILED -> FAILED (AC-15.12-14)', cjs(['FAILED']) === 'FAILED');

  console.log('\n[6] Run Suite — dedupeLatestByName (record terbaru per nama scenario)');
  const dedupe = runSuite.dedupeLatestByName;
  ok('dedupeLatestByName is exported', typeof dedupe === 'function');
  // Dua record nama sama -> ambil timestamp terbaru; nama beda -> keduanya.
  const recs = [
    { id: 'a1', testSuite: 'Login', timestamp: '2026-09-10T10:00:00Z', generatedCode: 'old' },
    { id: 'a2', testSuite: 'Login', timestamp: '2026-09-12T10:00:00Z', generatedCode: 'new' },
    { id: 'b1', testSuite: 'Checkout', timestamp: '2026-09-11T10:00:00Z', generatedCode: 'co' }
  ];
  const out = dedupe(recs);
  ok('collapses duplicates to one per name', out.length === 2);
  ok('keeps the latest record for a repeated name', out.find(r => r.testSuite === 'Login').id === 'a2');
  ok('keeps the only record for a unique name', out.find(r => r.testSuite === 'Checkout').id === 'b1');
  ok('empty input -> empty', dedupe([]).length === 0);
  ok('null input -> empty (no throw)', dedupe(null).length === 0);
  // Urutan hasil stabil menurut kemunculan pertama nama (untuk eksekusi berurutan yang dapat diprediksi).
  ok('order follows first appearance of each name', dedupe(recs)[0].testSuite === 'Login');

  console.log('\n[6b] Run Suite — extractErrorSnippet (cuplikan error andal dari log)');
  const snip = runSuite.extractErrorSnippet;
  ok('extractErrorSnippet is exported', typeof snip === 'function');
  // Ambil baris di sekitar penanda error Playwright, dibatasi panjang.
  const plog = [
    'Running 1 test using 1 worker',
    '  1) login.spec.ts:12:5 > fills the form',
    '    Error: locator.click: Timeout 30000ms exceeded.',
    '    Call log: waiting for getByRole(\'button\', { name: \'Login\' })',
    '    at login.spec.ts:14:20'
  ].join('\n');
  const s1 = snip(plog);
  ok('captures the Error: line', /Timeout 30000ms exceeded/.test(s1));
  ok('snippet is non-empty string', typeof s1 === 'string' && s1.length > 0);
  ok('empty log -> empty string (no throw)', snip('') === '');
  ok('null log -> empty string (no throw)', snip(null) === '');
  // Batasi panjang agar payload modal tidak membengkak.
  const huge = 'Error: boom\n' + 'x'.repeat(5000);
  ok('snippet is length-capped', snip(huge).length <= 1200);
  // Tanpa penanda error eksplisit, kembalikan ekor log (bukan kosong) supaya tetap informatif.
  ok('no explicit Error marker -> falls back to tail', snip('some plain output line\nanother line').length > 0);

  console.log('\n[6c] Run Suite — orderScenariosByMap & moveItem (US-15 re-order)');
  const orderBy = runSuite.orderScenariosByMap;
  const moveItem = runSuite.moveItem;
  ok('orderScenariosByMap is exported', typeof orderBy === 'function');
  ok('moveItem is exported', typeof moveItem === 'function');
  if (typeof orderBy === 'function') {
    const scn = [
      { testSuite: 'Buat SPK' }, { testSuite: 'Login' }, { testSuite: 'Cek Nilai' }
    ];
    // Peta urutan: Login=0, Buat SPK=1, Cek Nilai=2 -> hasil terurut sesuai peta.
    const map = { 'Login': 0, 'Buat SPK': 1, 'Cek Nilai': 2 };
    const ordered = orderBy(scn, map);
    ok('orders scenarios by the map', ordered.map(s => s.testSuite).join(',') === 'Login,Buat SPK,Cek Nilai');
    // Nama tak ada di peta -> ke akhir, stable.
    const scn2 = [ { testSuite: 'Baru' }, { testSuite: 'Login' }, { testSuite: 'Cek Nilai' } ];
    const map2 = { 'Login': 0, 'Cek Nilai': 1 };
    const ordered2 = orderBy(scn2, map2);
    ok('unmapped scenario goes to the end (AC-15.22)', ordered2.map(s => s.testSuite).join(',') === 'Login,Cek Nilai,Baru');
    // Peta kosong -> urutan asal.
    ok('empty map keeps original order', orderBy(scn, {}).map(s => s.testSuite).join(',') === 'Buat SPK,Login,Cek Nilai');
    ok('null scenarios -> empty (no throw)', Array.isArray(orderBy(null, map)) && orderBy(null, map).length === 0);
  }
  if (typeof moveItem === 'function') {
    ok('moveItem moves up', moveItem(['a', 'b', 'c'], 2, 0).join(',') === 'c,a,b');
    ok('moveItem moves down', moveItem(['a', 'b', 'c'], 0, 2).join(',') === 'b,c,a');
    ok('moveItem out-of-range is a no-op', moveItem(['a', 'b'], 5, 0).join(',') === 'a,b');
    ok('moveItem preserves length', moveItem(['a', 'b', 'c'], 1, 2).length === 3);
  }

  console.log('\n[7] Run Suite — service & route wiring');
  ok('runSuiteForSuite is exported', typeof runSuite.runSuiteForSuite === 'function');
  const hist = require('../dist/server/flow-history-store.js');
  ok('getRunnableScenariosBySuite is exported', typeof hist.getRunnableScenariosBySuite === 'function');
  // Endpoint POST /:suiteId/run terdaftar di suiteRoutes.
  const suiteRouter = require('../dist/server/routes/suite-routes.js').suiteRoutes;
  const hasRunRoute = suiteRouter.stack.some(
    (layer) => layer.route && layer.route.path === '/:suiteId/run' && layer.route.methods && layer.route.methods.post
  );
  ok('POST /:suiteId/run route is registered', hasRunRoute);
  const hasOrderRoute = suiteRouter.stack.some(
    (layer) => layer.route && layer.route.path === '/:suiteId/scenario-order' && layer.route.methods && layer.route.methods.put
  );
  ok('PUT /:suiteId/scenario-order route is registered', hasOrderRoute);
  ok('setScenarioOrder is exported', typeof suiteStore.setScenarioOrder === 'function');
  ok('getScenarioOrderMap is exported', typeof suiteStore.getScenarioOrderMap === 'function');

  console.log(`\nALL PROJECT & SUITE VERIFICATIONS PASSED (${passed} assertions)\n`);
})();
