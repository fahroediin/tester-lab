/*
 * Unit tests for Activity Log filter helpers (AC-27.03 / AC-27.04).
 * Run: node scripts/test-activity-log-filters.js  (after npm run build)
 */
'use strict';
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy';

const assert = require('assert');
const { escapeLikePattern, normalizeLogFilters } = require('../dist/server/activity-log-store.js');

let passed = 0;
function ok(name, cond) {
  assert.ok(cond, 'FAILED: ' + name);
  passed++;
  console.log('  ✓ ' + name);
}

console.log('\n[1] escapeLikePattern');
ok('underscore is escaped (qa_budi must not match qa-budi)', escapeLikePattern('qa_budi') === 'qa\\_budi');
ok('percent is escaped', escapeLikePattern('50%') === '50\\%');
ok('backslash is escaped', escapeLikePattern('a\\b') === 'a\\\\b');
ok('plain value untouched', escapeLikePattern('admin') === 'admin');

console.log('\n[2] normalizeLogFilters');
const both = normalizeLogFilters({ action: 'Delete Run', username: '  qa_budi ' });
ok('keeps action and trims username', both.action === 'Delete Run' && both.username === 'qa_budi');
ok('empty strings are dropped', Object.keys(normalizeLogFilters({ action: '', username: '   ' })).length === 0);
ok('non-string values are dropped', Object.keys(normalizeLogFilters({ action: ['x'], username: 5 })).length === 0);
ok('long values are capped at 100 chars', normalizeLogFilters({ username: 'a'.repeat(500) }).username.length === 100);

console.log(`\n${passed} passed`);
