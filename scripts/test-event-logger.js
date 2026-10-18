/*
 * Tests for the structured event logger (POC observability).
 *
 * formatEvent() builds a single, grep-able log line with a stable shape so
 * operators can filter all activity (`grep [EVENT]`) or just failures
 * (`grep result=error`). Values are sanitized to stay on one line and never
 * break the key=value format. Pure; no I/O — logEvent() does the stdout write.
 *
 * Run: node scripts/test-event-logger.js   (after `npm run build`)
 */
'use strict';
const assert = require('assert');
const { formatEvent } = require('../dist/server/lib/event-logger.js');

let passed = 0;
function ok(name, cond) { assert.ok(cond, 'FAILED: ' + name); passed++; console.log('  ✓ ' + name); }

(async () => {
  console.log('\n[event-logger] formatEvent');

  const line = formatEvent({ action: 'recorder_open', user: 'qa_budi', result: 'ok', target: 'https://x.com' });
  ok('starts with [EVENT] marker', line.startsWith('[EVENT] '));
  ok('contains action', line.includes('action=recorder_open'));
  ok('contains user', line.includes('user=qa_budi'));
  ok('contains result', line.includes('result=ok'));
  ok('contains target', line.includes('target=https://x.com'));
  ok('has an ISO timestamp', /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(line));
  ok('is a single line', !line.includes('\n'));

  // Defaults / robustness
  ok('defaults result to ok when omitted',
    formatEvent({ action: 'a', user: 'u' }).includes('result=ok'));
  ok('defaults user to anonymous when omitted',
    formatEvent({ action: 'a' }).includes('user=anonymous'));
  ok('missing action -> action=unknown',
    formatEvent({}).includes('action=unknown'));

  // Sanitization: newlines/spaces in values must not break the one-line format
  {
    const l = formatEvent({ action: 'import', user: 'u', msg: 'line1\nline2  with   spaces' });
    ok('newlines collapsed to single line', !l.includes('\n'));
    ok('value spaces collapsed', l.includes('msg=line1 line2 with spaces'));
  }
  // Numeric and boolean extra fields render as key=value
  {
    const l = formatEvent({ action: 'import', user: 'u', steps: 12, format: 'katalon' });
    ok('numeric field rendered', l.includes('steps=12'));
    ok('string field rendered', l.includes('format=katalon'));
  }
  // Undefined/null extra fields are skipped (not "key=undefined")
  {
    const l = formatEvent({ action: 'a', user: 'u', note: undefined, other: null });
    ok('undefined field skipped', !l.includes('note='));
    ok('null field skipped', !l.includes('other='));
  }

  console.log('\nALL EVENT LOGGER TESTS PASSED (' + passed + ' assertions)\n');
})().catch((e) => { console.error(e); process.exit(1); });
