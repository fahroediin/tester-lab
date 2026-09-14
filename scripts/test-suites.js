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

  console.log('\n[6d] Run Suite — parseStepList (step-by-step detail for passed scenarios)');
  const parseStepList = runSuite.parseStepList;
  ok('parseStepList is exported', typeof parseStepList === 'function');
  if (typeof parseStepList === 'function') {
    const code = [
      "console.log('__STEP_START__ 1');",
      "// Step 1: Isi kolom username",
      "await maestro.interact(x, 'fill', 'a');",
      "console.log('__STEP_START__ 2');",
      "// Step 2: Klik tombol login",
      "await maestro.interact(y, 'click');",
      "console.log('__STEP_START__ 3');",
      "// Step 3: Verifikasi dashboard",
      "await expect(z).toBeVisible();"
    ].join('\n');
    // Semua step tereksekusi (log memuat penanda 1..3).
    const logAll = '__STEP_START__ 1\n__STEP_START__ 2\n__STEP_START__ 3\nDone';
    const stepsAll = parseStepList(code, logAll);
    ok('parses 3 steps with descriptions', stepsAll.length === 3 && stepsAll[0].description === 'Isi kolom username');
    ok('all reached steps are OK', stepsAll.every(s => s.status === 'OK'));
    ok('step numbers are 1..3', stepsAll.map(s => s.step).join(',') === '1,2,3');
    // Hanya sampai step 2 (mis. gagal di 3): step 3 tidak tercapai.
    const logPartial = '__STEP_START__ 1\n__STEP_START__ 2\n__STEP_START__ 3';
    // step yang penanda-nya muncul dianggap tercapai; untuk SUCCESS semua OK.
    ok('empty code -> empty list (no throw)', parseStepList('', logAll).length === 0);
    ok('null args -> empty list (no throw)', parseStepList(null, null).length === 0);
    // Step tanpa penanda di log -> status PENDING/tidak OK.
    const logNone = 'Done';
    const stepsNone = parseStepList(code, logNone);
    ok('steps not reached are not marked OK', stepsNone.every(s => s.status !== 'OK'));
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

  console.log('\n[8] Run Suite — progress streaming (US-16, intent AC-16.01)');
  // makeStartEvent: bentuk payload "start" dari daftar scenario terurut.
  ok('makeStartEvent is exported', typeof runSuite.makeStartEvent === 'function');
  {
    const mk = runSuite.makeStartEvent;
    const scn = [
      { id: 'a', testSuite: 'Login' },
      { id: 'b', testSuite: 'Checkout' },
      { id: 'c', testSuite: 'Logout' }
    ];
    const ev = mk(scn);
    ok('start event type is "start"', ev.type === 'start');
    ok('start event total = jumlah scenario', ev.total === 3);
    ok('start event scenarios preserve order', ev.scenarios.map((s) => s.name).join(',') === 'Login,Checkout,Logout');
    ok('start event carries id + name only', ev.scenarios[0].id === 'a' && ev.scenarios[0].name === 'Login' && Object.keys(ev.scenarios[0]).sort().join(',') === 'id,name');
    ok('empty list -> total 0, empty scenarios (no throw)', (() => { const e = mk([]); return e.total === 0 && e.scenarios.length === 0; })());
    ok('null arg -> total 0 (no throw)', (() => { const e = mk(null); return e.total === 0 && e.scenarios.length === 0; })());
  }

  // runScenariosWithProgress: jalankan loop scenario dengan executor yang
  // di-inject (tanpa Supabase/Playwright), memancarkan progress per scenario.
  ok('runScenariosWithProgress is exported', typeof runSuite.runScenariosWithProgress === 'function');
  {
    const runWith = runSuite.runScenariosWithProgress;
    const scn = [
      { id: 'a', testSuite: 'Login', generatedCode: 'code-a', language: 'typescript', framework: 'playwright' },
      { id: 'b', testSuite: 'Checkout', generatedCode: '', language: 'typescript', framework: 'playwright' },
      { id: 'c', testSuite: 'Logout', generatedCode: 'code-c', language: 'typescript', framework: 'playwright' }
    ];
    // Fake executor: Login pass, Logout fail. Checkout has no code -> SKIPPED (never executed).
    const fakeExec = async (s) => (s.testSuite === 'Login'
      ? { success: true, logs: 'ok' }
      : { success: false, logs: 'Error: boom' });
    const events = [];
    const out = await runWith(scn, fakeExec, (ev) => events.push(ev));

    const starts = events.filter((e) => e.type === 'scenario_start');
    const dones = events.filter((e) => e.type === 'scenario_done');
    ok('emits one scenario_start per scenario', starts.length === 3);
    ok('emits one scenario_done per scenario', dones.length === 3);
    ok('scenario_start index is 1-based in order', starts.map((e) => e.index).join(',') === '1,2,3');
    ok('scenario_start carries the scenario name', starts.map((e) => e.name).join(',') === 'Login,Checkout,Logout');
    ok('start precedes done for the same index', events.findIndex((e) => e.type === 'scenario_start' && e.index === 2) < events.findIndex((e) => e.type === 'scenario_done' && e.index === 2));
    ok('done result reflects executor: Login SUCCESS', dones.find((e) => e.index === 1).result.status === 'SUCCESS');
    ok('no code -> SKIPPED without executing (Checkout)', dones.find((e) => e.index === 2).result.status === 'SKIPPED');
    ok('failing executor -> FAILED (Logout)', dones.find((e) => e.index === 3).result.status === 'FAILED');
    // Return value matches the batch shape used by the existing modal/history.
    ok('returns results array of length 3', Array.isArray(out.results) && out.results.length === 3);
    ok('returns computed jobStatus PARTIAL (mix pass/fail)', out.jobStatus === 'PARTIAL');
    // Omitting onProgress must not throw (non-streaming callers).
    const out2 = await runWith(scn, fakeExec);
    ok('works without onProgress callback (no throw)', out2.results.length === 3);
  }

  console.log('\n[8e] collectStepScreenshots — per-step evidence (US-19)');
  {
    const sanitized = require('../dist/security/sanitized-env.js');
    ok('collectStepScreenshots is exported', typeof sanitized.collectStepScreenshots === 'function');
    const collect = sanitized.collectStepScreenshots;
    const fs = require('fs'); const os = require('os'); const path = require('path');
    const base = fs.mkdtempSync(path.join(os.tmpdir(), 'tl-steps-'));
    try {
      const nested = path.join(base, 'results', 'run-x');
      fs.mkdirSync(nested, { recursive: true });
      // Out-of-order + a non-step png + a video: only step_N.png in numeric order.
      fs.writeFileSync(path.join(nested, 'step_10.png'), 'x');
      fs.writeFileSync(path.join(nested, 'step_2.png'), 'x');
      fs.writeFileSync(path.join(nested, 'step_1.png'), 'x');
      fs.writeFileSync(path.join(nested, 'video.webm'), 'x');
      fs.writeFileSync(path.join(nested, 'test-failed-1.png'), 'x'); // playwright's own, ignore
      const out = collect(base);
      ok('returns array of step shots', Array.isArray(out));
      ok('picks up all 3 step_N.png', out.length === 3);
      ok('sorted numerically 1,2,10 (not lexical)', out.map((s) => s.step).join(',') === '1,2,10');
      ok('each entry has step + path', out[0].step === 1 && typeof out[0].path === 'string' && out[0].path.endsWith('step_1.png'));
      ok('ignores non step_N png (test-failed-1)', out.every((s) => /step_\d+\.png$/.test(s.path)));
      // Empty / missing dir -> [] (no throw).
      ok('missing dir -> [] no throw', collect(path.join(base, 'nope')).length === 0);
      ok('null -> [] no throw', collect(null).length === 0);
    } finally {
      fs.rmSync(base, { recursive: true, force: true });
    }
    // Templates must emit per-step screenshots + a first-failure capture.
    const tsTpl = fs.readFileSync(path.join(process.cwd(), 'dist', 'templates', 'playwright-ts.hbs'), 'utf-8');
    const jsTpl = fs.readFileSync(path.join(process.cwd(), 'dist', 'templates', 'playwright-js.hbs'), 'utf-8');
    ok('TS emits step_<N>.png per step', /step_'?\s*\+\s*\{\{step\}\}|step_\{\{step\}\}|captureStep\(\{\{step\}\}\)/.test(tsTpl));
    ok('JS emits step_<N>.png per step', /captureStep\(\{\{step\}\}\)/.test(jsTpl));
    ok('TS captures failure at first fail (captureStepFailure)', /captureStepFailure/.test(tsTpl));
    ok('TS sets currentStep before each step', /maestro\.currentStep = \{\{step\}\}/.test(tsTpl));
    // When the asserted element is absent, overlay a "not found" banner naming
    // the searched target (deterministic; no fuzzy guessing).
    ok('TS overlays a not-found banner when element absent', /TIDAK DITEMUKAN/.test(tsTpl));
    ok('TS tracks the searched target (currentTarget)', /currentTarget/.test(tsTpl));
    ok('JS tracks the searched target (currentTarget)', /currentTarget/.test(jsTpl));
    ok('JS overlays a not-found banner', /TIDAK DITEMUKAN/.test(jsTpl));
  }

  console.log('\n[8d] success snapshot with assert highlight (Opsi A)');
  {
    const fs = require('fs'); const path = require('path');
    const tsTpl = fs.readFileSync(path.join(process.cwd(), 'dist', 'templates', 'playwright-ts.hbs'), 'utf-8');
    const jsTpl = fs.readFileSync(path.join(process.cwd(), 'dist', 'templates', 'playwright-js.hbs'), 'utf-8');
    // Engine remembers the last asserted locator so the success snapshot can
    // highlight it (only when the scenario has an assert).
    ok('TS engine tracks lastAssertLocator', /lastAssertLocator/.test(tsTpl));
    ok('JS engine tracks lastAssertLocator', /lastAssertLocator/.test(jsTpl));
    // A captureSuccess routine highlights + screenshots on success.
    ok('TS has captureSuccess', /captureSuccess/.test(tsTpl));
    ok('JS has captureSuccess', /captureSuccess/.test(jsTpl));
    ok('TS captureSuccess takes a manual screenshot', /captureSuccess[\s\S]{0,1200}page\.screenshot/.test(tsTpl));
    ok('JS captureSuccess takes a manual screenshot', /captureSuccess[\s\S]{0,1200}page\.screenshot/.test(jsTpl));
    ok('TS highlights via outline', /outline/.test(tsTpl));
    ok('JS highlights via outline', /outline/.test(jsTpl));
    // captureSuccess is invoked once at the very end of the test.
    ok('TS calls captureSuccess at end', /await\s+maestro\.captureSuccess\(\)/.test(tsTpl));
    ok('JS calls captureSuccess at end', /await\s+maestro\.captureSuccess\(\)/.test(jsTpl));
    // The success PNG must be named so the runner can find it (results dir).
    ok('TS screenshots into a success png path', /success[\w-]*\.png|__success__/.test(tsTpl));
    ok('JS screenshots into a success png path', /success[\w-]*\.png|__success__/.test(jsTpl));
  }

  console.log('\n[8a] parseStepList — 3-state via __STEP_DONE__ (failed step not marked OK)');
  {
    const psl = runSuite.parseStepList;
    const code = [
      "console.log('__STEP_START__ 1');",
      "// Step 1: isi username",
      "console.log('__STEP_DONE__ 1');",
      "console.log('__STEP_START__ 2');",
      "// Step 2: cari baris",
      "console.log('__STEP_DONE__ 2');",
      "console.log('__STEP_START__ 3');",
      "// Step 3: klik selesai",
      "console.log('__STEP_DONE__ 3');"
    ].join('\n');
    // Run reached step 3 START, but step 3 failed (no DONE 3). Steps 1,2 done.
    const log = '__STEP_START__ 1\n__STEP_DONE__ 1\n__STEP_START__ 2\n__STEP_DONE__ 2\n__STEP_START__ 3\nError: boom';
    const out = psl(code, log);
    const byN = Object.fromEntries(out.map((s) => [s.step, s.status]));
    ok('step 1 START+DONE -> OK', byN[1] === 'OK');
    ok('step 2 START+DONE -> OK', byN[2] === 'OK');
    ok('step 3 START without DONE -> FAILED (not OK)', byN[3] === 'FAILED');
    // A step never reached stays PENDING.
    const log2 = '__STEP_START__ 1\n__STEP_DONE__ 1\nError: died early';
    const out2 = psl(code, log2);
    const byN2 = Object.fromEntries(out2.map((s) => [s.step, s.status]));
    ok('step 1 done -> OK', byN2[1] === 'OK');
    ok('step 2 START missing -> FAILED only if started; here PENDING', byN2[2] === 'PENDING');
    ok('step 3 never reached -> PENDING', byN2[3] === 'PENDING');
    // Backward-compat: old logs without any DONE marker (legacy scenarios) must
    // not regress to all-FAILED; when NO __STEP_DONE__ exists at all, fall back
    // to START-means-OK so pre-fix generated code still reads sensibly.
    const legacyLog = '__STEP_START__ 1\n__STEP_START__ 2\n__STEP_START__ 3\nError: boom';
    const legacyOut = psl(code, legacyLog);
    const legacyByN = Object.fromEntries(legacyOut.map((s) => [s.step, s.status]));
    ok('legacy log (no DONE at all) -> START means OK', legacyByN[1] === 'OK' && legacyByN[3] === 'OK');
  }

  console.log('\n[8b] Run Suite — resolveSlowMo (headless suite gets a pacing buffer)');
  ok('resolveSlowMo is exported', typeof runSuite.resolveSlowMo === 'function' || typeof require('../dist/server/services/test-runner-service.js').resolveSlowMo === 'function');
  {
    const runner = require('../dist/server/services/test-runner-service.js');
    const resolve = runner.resolveSlowMo;
    ok('resolveSlowMo exported from runner', typeof resolve === 'function');
    // Explicit slowMoMs wins.
    ok('explicit slowMoMs is honored', resolve({ mode: 'headless', slowMoMs: 400 }) === 400);
    ok('explicit slowMoMs honored even when headed', resolve({ mode: 'headed', slowMoMs: 250 }) === 250);
    // Fallback preserves the old behavior when slowMoMs is absent.
    ok('headed without slowMoMs -> 1000 (legacy)', resolve({ mode: 'headed' }) === 1000);
    ok('headless without slowMoMs -> 0 (legacy)', resolve({ mode: 'headless' }) === 0);
    ok('default mode without slowMoMs -> 0', resolve({}) === 0);
    // Guard against nonsense.
    ok('negative slowMoMs clamped to 0', resolve({ slowMoMs: -50 }) === 0);
    ok('non-number slowMoMs ignored -> legacy', resolve({ mode: 'headed', slowMoMs: 'x' }) === 1000);
  }

  console.log('\n[8c] scopedRow.assertResolvable polls for async-rendered rows');
  {
    const fs = require('fs');
    const tsTpl = fs.readFileSync(require('path').join(process.cwd(), 'dist', 'templates', 'playwright-ts.hbs'), 'utf-8');
    const jsTpl = fs.readFileSync(require('path').join(process.cwd(), 'dist', 'templates', 'playwright-js.hbs'), 'utf-8');
    // The resolvable check must retry (poll) rather than count once, so a row
    // that renders shortly after navigation is not reported as not-found.
    const tsBlock = tsTpl.slice(tsTpl.indexOf('assertResolvable'), tsTpl.indexOf('assertResolvable') + 1400);
    const jsBlock = jsTpl.slice(jsTpl.indexOf('assertResolvable'), jsTpl.indexOf('assertResolvable') + 1400);
    ok('TS assertResolvable polls (has a loop)', /for\s*\(/.test(tsBlock) && /waitForTimeout/.test(tsBlock));
    ok('JS assertResolvable polls (has a loop)', /for\s*\(/.test(jsBlock) && /waitForTimeout/.test(jsBlock));
    // Still reports not-found and not-unique after polling (AC-36.04/05).
    ok('TS keeps not-found message', tsBlock.includes('No row containing'));
    ok('TS keeps not-unique message', tsBlock.includes('matched more than one row'));
    ok('JS keeps not-found message', jsBlock.includes('No row containing'));
    ok('JS keeps not-unique message', jsBlock.includes('matched more than one row'));
  }

  console.log('\n[9] Run evidence — findScreenshotFile (snapshot on-failure, intent AC-19.03)');
  const sanitized = require('../dist/security/sanitized-env.js');
  ok('findScreenshotFile is exported', typeof sanitized.findScreenshotFile === 'function');
  {
    const fs = require('fs');
    const os = require('os');
    const path = require('path');
    const findPng = sanitized.findScreenshotFile;
    const base = fs.mkdtempSync(path.join(os.tmpdir(), 'tl-shot-test-'));
    try {
      // Nested results dir with a video and a screenshot, like Playwright output.
      const nested = path.join(base, 'results', 'manual_run-chromium');
      fs.mkdirSync(nested, { recursive: true });
      fs.writeFileSync(path.join(nested, 'video.webm'), 'x');
      fs.writeFileSync(path.join(nested, 'trace.zip'), 'x');
      const shot = path.join(nested, 'test-failed-1.png');
      fs.writeFileSync(shot, 'x');
      ok('finds the .png recursively', findPng(base) === shot);
      ok('ignores non-png files', !findPng(base).endsWith('.webm') && !findPng(base).endsWith('.zip'));

      const empty = path.join(base, 'no-shot');
      fs.mkdirSync(empty, { recursive: true });
      fs.writeFileSync(path.join(empty, 'only-video.webm'), 'x');
      ok('no png -> null', findPng(empty) === null);
      ok('missing dir -> null (no throw)', findPng(path.join(base, 'does-not-exist')) === null);
    } finally {
      fs.rmSync(base, { recursive: true, force: true });
    }
  }

  // ScenarioResult carries a screenshotUrl for a FAILED scenario (from executor).
  {
    const runWith = runSuite.runScenariosWithProgress;
    const scn = [
      { id: 'x', testSuite: 'Payflow', generatedCode: 'code-x', language: 'typescript', framework: 'playwright' }
    ];
    const failExec = async () => ({ success: false, logs: 'Error: nope', screenshotUrl: 'https://signed/fail.png' });
    const out = await runWith(scn, failExec);
    ok('FAILED result carries screenshotUrl from executor', out.results[0].screenshotUrl === 'https://signed/fail.png');
    // Opsi A: a passing scenario now also carries a (success) snapshot url.
    const passExec = async () => ({ success: true, logs: 'ok', screenshotUrl: 'https://signed/success.png' });
    const out2 = await runWith(scn, passExec);
    ok('SUCCESS result carries success screenshotUrl', out2.results[0].screenshotUrl === 'https://signed/success.png');
    // No snapshot produced -> undefined, not a crash.
    const passNoShot = async () => ({ success: true, logs: 'ok' });
    const out3 = await runWith(scn, passNoShot);
    ok('SUCCESS without snapshot -> undefined', out3.results[0].screenshotUrl === undefined);
    // Per-step evidence (US-19): stepShots array flows through to the result.
    const stepExec = async () => ({ success: true, logs: 'ok', screenshotUrl: 'https://signed/s3.png', stepShots: [ { step: 1, url: 'https://s/1.png' }, { step: 2, url: 'https://s/2.png' } ] });
    const out4 = await runWith(scn, stepExec);
    ok('result carries stepShots array', Array.isArray(out4.results[0].stepShots) && out4.results[0].stepShots.length === 2);
    ok('stepShots preserve step + url', out4.results[0].stepShots[1].step === 2 && out4.results[0].stepShots[1].url === 'https://s/2.png');
  }

  console.log(`\nALL PROJECT & SUITE VERIFICATIONS PASSED (${passed} assertions)\n`);
})();
