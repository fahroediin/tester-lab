/*
 * Tests that Run Suite goes THROUGH the shared runner queue (Skema B), so 10
 * concurrent Run Suites no longer launch 10 Chromium at once — they are capped
 * by MAX_CONCURRENT_TESTS (FIFO) and rejected with 503 when the queue is full.
 *
 * We stub the runner queue and the suite service so no browser/Supabase is hit.
 *
 * Run: node scripts/test-run-suite-queue.js   (after `npm run build`)
 */
'use strict';
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy';

const assert = require('assert');
const path = require('path');
const root = process.cwd();

let passed = 0;
function ok(name, cond) { assert.ok(cond, 'FAILED: ' + name); passed++; console.log('  ✓ ' + name); }

// --- Stub modules the route imports, BEFORE requiring the route ---
const Module = require('module');
const realLoad = Module._load;

const resolved = (req, parent) => { try { return Module._resolveFilename(req, parent); } catch { return req; } };
const P = (rel) => path.resolve(root, rel);

// Controllable queue stub: records enqueue calls and whether isFull() is on.
const queueState = { full: false, enqueued: 0, lastFn: null };
const queueStub = {
  globalTestRunnerQueue: {
    isFull: () => queueState.full,
    enqueue: async (fn) => { queueState.enqueued++; queueState.lastFn = fn; return fn(); }
  },
  isQueueFullError: (e) => !!e && e.code === 'QUEUE_FULL'
};

Module._load = function (request, parent, isMain) {
  const r = resolved(request, parent);
  if (r === P('dist/server/queue-manager.js')) return queueStub;
  if (r === P('dist/server/suite-store.js')) return {
    getSuiteById: async () => ({ id: 's1', name: 'Suite', projectId: 'p1' }),
    getSuitesByProjectId: async () => [], createSuite: async () => ({}),
    updateSuite: async () => ({}), deleteSuite: async () => true, setScenarioOrder: async () => true,
  };
  if (r === P('dist/server/folder-store.js')) return {
    getProjectById: async () => ({ id: 'p1', userId: 'u1' }),
  };
  if (r === P('dist/server/flow-history-store.js')) return {
    getScenarioCountsBySuite: async () => ({}),
    getRunnableScenariosBySuite: async () => [{ id: 'sc1', testSuite: 'A', generatedCode: 'x' }],
  };
  if (r === P('dist/server/services/run-suite-service.js')) return {
    dedupeLatestByName: (x) => x,
    runSuiteForSuite: async (_u, _s, onProgress) => { if (onProgress) onProgress({ type: 'scenario_start', index: 1 }); return { jobStatus: 'PASSED', results: [] }; },
  };
  if (r === P('dist/server/activity-log-store.js')) return { addLog: async () => {} };
  if (r === P('dist/server/suite-run-store.js')) return {
    addSuiteRun: async () => ({ id: 'run1' }), getSuiteRunById: async () => null, getSuiteRunsBySuite: async () => [],
  };
  if (r === P('dist/server/services/suite-report-service.js')) return { buildSuiteReport: async () => ({}) };
  if (r === P('dist/server/services/suite-report-export.js')) return { exportSuiteReport: async () => ({}) };
  return realLoad.apply(this, arguments);
};

const { suiteRoutes } = require(P('dist/server/routes/suite-routes.js'));
Module._load = realLoad; // restore

function makeReq() {
  return { params: { suiteId: 's1' }, user: { id: 'u1', username: 'tester', role: 'user' }, body: {}, headers: {} };
}
function makeRes() {
  return {
    statusCode: 200, headers: {}, chunks: [], ended: false, headersSent: false,
    status(c){ this.statusCode = c; return this; },
    setHeader(k,v){ this.headers[k]=v; this.headersSent = false; },
    json(b){ this.body = b; this.ended = true; return this; },
    write(s){ this.headersSent = true; this.chunks.push(s); return true; },
    end(){ this.ended = true; return this; },
  };
}
const layer = suiteRoutes.stack.find(l => l.route && l.route.path === '/:suiteId/run' && l.route.methods.post);
const handler = layer.route.stack[layer.route.stack.length - 1].handle;

(async () => {
  console.log('\n[run-suite queue] Skema B — Run Suite lewat queue (FIFO + 503)');

  // Case 1: queue has room -> run proceeds AND went through enqueue().
  queueState.full = false; queueState.enqueued = 0;
  let res = makeRes();
  await handler(makeReq(), res);
  ok('run proceeds when queue has room', res.ended === true);
  ok('execution went through the runner queue (enqueue called)', queueState.enqueued === 1);
  ok('stream carried a done line', res.chunks.some(c => c.includes('"type":"done"')));

  // Case 2: queue full -> 503 BEFORE streaming headers, no enqueue.
  queueState.full = true; queueState.enqueued = 0;
  res = makeRes();
  await handler(makeReq(), res);
  ok('queue full -> HTTP 503', res.statusCode === 503);
  ok('queue full -> JSON error (not a stream)', res.body && res.body.success === false);
  ok('queue full -> nothing enqueued', queueState.enqueued === 0);
  ok('queue full -> no NDJSON chunks written', res.chunks.length === 0);

  console.log('\nALL RUN-SUITE QUEUE TESTS PASSED (' + passed + ' assertions)\n');
})().catch((e) => { console.error(e); process.exit(1); });
