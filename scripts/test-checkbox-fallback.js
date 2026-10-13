/*
 * Tests for the checkbox check->click fallback decision (engine robustness).
 *
 * Playwright's locator.check() verifies the checkbox actually becomes checked.
 * For React/Vue custom checkboxes the native `checked` may not flip synchronously,
 * so check() throws "did not change its state" even though a click would work.
 * isCheckboxStateError() detects exactly that error so the caller can fall back
 * to .click() + isChecked() verification — without masking genuine failures
 * (element not found, timeout, detached, etc.).
 *
 * Run: node scripts/test-checkbox-fallback.js   (after `npm run build`)
 */
'use strict';
const assert = require('assert');
const { isCheckboxStateError } = require('../dist/crawler/checkbox-fallback.js');

let passed = 0;
function ok(name, cond) { assert.ok(cond, 'FAILED: ' + name); passed++; console.log('  ✓ ' + name); }

(async () => {
  console.log('\n[checkbox fallback] isCheckboxStateError');

  // The exact Playwright message that must trigger the fallback.
  ok('detects "did not change its state"',
    isCheckboxStateError('locator.check: Clicking the checkbox did not change its state'));
  ok('detects regardless of surrounding text',
    isCheckboxStateError('Error: locator.check: Clicking the checkbox did not change its state\nCall log: ...'));
  ok('case-insensitive',
    isCheckboxStateError('CLICKING THE CHECKBOX DID NOT CHANGE ITS STATE'));

  // Must NOT trigger fallback for unrelated failures (those are real errors).
  ok('ignores timeout error', !isCheckboxStateError('locator.check: Timeout 5000ms exceeded.'));
  ok('ignores element-not-found', !isCheckboxStateError('locator.check: no element matches selector'));
  ok('ignores detached node', !isCheckboxStateError('Element is not attached to the DOM'));
  ok('ignores empty', !isCheckboxStateError(''));
  ok('ignores non-string (undefined)', !isCheckboxStateError(undefined));
  ok('ignores non-string (Error obj without message handled by caller)', !isCheckboxStateError(null));

  console.log('\nALL CHECKBOX FALLBACK TESTS PASSED (' + passed + ' assertions)\n');
})().catch((e) => { console.error(e); process.exit(1); });
