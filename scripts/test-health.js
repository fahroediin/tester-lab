/*
 * Tests for /healthz status computation.
 *
 * computeHealthStatus() turns per-component checks into an overall status and
 * the HTTP code a monitor (e.g. Monita) keys on: 200 when healthy, 503 when any
 * critical dependency is down. Pure; no I/O.
 *
 * Run: node scripts/test-health.js   (after `npm run build`)
 */
'use strict';
const assert = require('assert');
const { computeHealthStatus } = require('../dist/server/lib/health.js');

let passed = 0;
function ok(name, cond) { assert.ok(cond, 'FAILED: ' + name); passed++; console.log('  ✓ ' + name); }

(async () => {
  console.log('\n[health] computeHealthStatus');

  // All good -> ok / 200.
  {
    const r = computeHealthStatus({ database: { ok: true }, queue: { ok: true } });
    ok('all ok -> status ok', r.status === 'ok');
    ok('all ok -> http 200', r.httpStatus === 200);
  }

  // Database down -> unhealthy / 503 (critical dependency).
  {
    const r = computeHealthStatus({ database: { ok: false, error: 'timeout' }, queue: { ok: true } });
    ok('db down -> status error', r.status === 'error');
    ok('db down -> http 503', r.httpStatus === 503);
    ok('db down -> names the failing check', Array.isArray(r.failing) && r.failing.includes('database'));
  }

  // Queue check failing also -> 503.
  {
    const r = computeHealthStatus({ database: { ok: true }, queue: { ok: false } });
    ok('queue down -> http 503', r.httpStatus === 503);
    ok('queue down -> failing lists queue', r.failing.includes('queue'));
  }

  // Multiple failing -> both listed.
  {
    const r = computeHealthStatus({ database: { ok: false }, queue: { ok: false } });
    ok('both down -> both listed', r.failing.includes('database') && r.failing.includes('queue'));
  }

  // Robustness: missing/empty checks never throw; no checks -> ok (nothing failing).
  ok('empty checks -> ok', computeHealthStatus({}).status === 'ok');
  ok('null -> ok (no throw)', computeHealthStatus(null).status === 'ok');
  ok('undefined -> ok (no throw)', computeHealthStatus(undefined).status === 'ok');

  // A check object without ok is treated as failing (defensive).
  {
    const r = computeHealthStatus({ database: {} });
    ok('check missing ok -> failing', r.status === 'error' && r.failing.includes('database'));
  }

  console.log('\nALL HEALTH TESTS PASSED (' + passed + ' assertions)\n');
})().catch((e) => { console.error(e); process.exit(1); });
