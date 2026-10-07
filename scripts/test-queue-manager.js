/*
 * Tests for ConcurrencyQueueManager backpressure (MAX_QUEUE_LENGTH).
 *
 * The queue runs up to `maxConcurrent` tasks at once; the rest wait. Without a
 * bound, a flood of runs would pile up unboundedly in memory. maxQueue caps the
 * number of WAITING tasks: once full, enqueue rejects immediately with a
 * QueueFullError so the route can answer 503 instead of accepting work it cannot
 * hold. maxQueue = 0 means "unbounded" (back-compat default).
 *
 * Run: node scripts/test-queue-manager.js   (after `npm run build`)
 */
'use strict';
const assert = require('assert');
const { ConcurrencyQueueManager, isQueueFullError } = require('../dist/server/queue-manager.js');

let passed = 0;
function ok(name, cond) { assert.ok(cond, 'FAILED: ' + name); passed++; console.log('  ✓ ' + name); }

// A task we can hold open until we choose to release it.
function deferred() {
  let resolve;
  const promise = new Promise((r) => { resolve = r; });
  return { promise, release: () => resolve('done') };
}

(async () => {
  console.log('\n[queue] MAX_QUEUE_LENGTH backpressure');

  // maxConcurrent=1, maxQueue=2  -> 1 running + 2 waiting = capacity 3.
  const q = new ConcurrencyQueueManager(1, 2);
  const d1 = deferred(), d2 = deferred(), d3 = deferred();

  const p1 = q.enqueue(() => d1.promise); // starts running immediately
  const p2 = q.enqueue(() => d2.promise); // waits (slot 1)
  const p3 = q.enqueue(() => d3.promise); // waits (slot 2) -> queue now full

  // Let the microtask queue settle so processQueue has run.
  await new Promise((r) => setTimeout(r, 10));

  const stats = q.getStats();
  ok('1 active, 2 queued when full', stats.activeCount === 1 && stats.queuedCount === 2);

  // The 4th enqueue must be rejected synchronously-ish with a QueueFullError.
  let rejected = null;
  try {
    await q.enqueue(() => Promise.resolve('nope'));
  } catch (e) {
    rejected = e;
  }
  ok('4th task rejected when queue full', rejected !== null);
  ok('rejection is identifiable as queue-full', isQueueFullError(rejected));
  ok('queue length unchanged after rejection', q.getStats().queuedCount === 2);
  ok('isFull() true when at capacity', q.isFull() === true);

  // Drain everything; the accepted tasks still resolve normally.
  d1.release(); d2.release(); d3.release();
  const results = await Promise.all([p1, p2, p3]);
  ok('all accepted tasks resolve', results.every((r) => r === 'done'));

  // After draining, a new task is accepted again.
  const d4 = deferred();
  const p4 = q.enqueue(() => d4.promise);
  d4.release();
  ok('accepts work again after draining', (await p4) === 'done');

  // maxQueue = 0 means unbounded: many waiters are all accepted.
  const qUnbounded = new ConcurrencyQueueManager(1, 0);
  const hold = deferred();
  qUnbounded.enqueue(() => hold.promise); // occupies the single slot
  let anyRejected = false;
  for (let i = 0; i < 50; i++) {
    try { qUnbounded.enqueue(() => Promise.resolve(i)); }
    catch { anyRejected = true; }
  }
  ok('maxQueue=0 is unbounded (no rejection)', anyRejected === false && qUnbounded.getStats().queuedCount === 50);
  ok('isFull() always false when unbounded', qUnbounded.isFull() === false);
  hold.release();

  console.log('\nALL QUEUE MANAGER TESTS PASSED (' + passed + ' assertions)\n');
})().catch((e) => { console.error(e); process.exit(1); });
