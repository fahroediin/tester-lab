/*
 * Multi-tab evidence: a run that opens a new tab records one .webm per tab.
 * findAllVideoFiles collects every recording (not just the first), so the report
 * can show the whole flow across tabs.
 * Run: node scripts/test-all-videos.js
 */
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { findAllVideoFiles, findVideoFile } = require('../dist/security/sanitized-env.js');

let passed = 0;
function ok(name, cond) {
  assert.ok(cond, 'FAILED: ' + name);
  passed++;
  console.log('  ✓ ' + name);
}

(function () {
  console.log('\n[all-videos] findAllVideoFiles collects every tab recording');

  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tl-videos-'));
  const sub = path.join(root, 'nested');
  fs.mkdirSync(sub, { recursive: true });
  // Two tab recordings in different dirs + a non-video file.
  fs.writeFileSync(path.join(root, 'a.webm'), 'v1');
  fs.writeFileSync(path.join(sub, 'b.webm'), 'v2');
  fs.writeFileSync(path.join(root, 'notes.txt'), 'x');

  try {
    const all = findAllVideoFiles(root);
    ok('mengembalikan array', Array.isArray(all));
    ok('menemукan kedua .webm', all.length === 2);
    ok('hanya .webm (abaikan .txt)', all.every((p) => p.endsWith('.webm')));
    ok('path absolut', all.every((p) => path.isAbsolute(p)));

    // Backward-compat: findVideoFile still returns a single one (the first).
    const one = findVideoFile(root);
    ok('findVideoFile tetap kembalikan satu', typeof one === 'string' && one.endsWith('.webm'));

    // Empty dir -> empty list, no throw.
    const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'tl-empty-'));
    ok('folder kosong -> []', findAllVideoFiles(empty).length === 0);
    ok('folder tak ada -> [] (no throw)', findAllVideoFiles(path.join(empty, 'nope')).length === 0);
    fs.rmSync(empty, { recursive: true, force: true });

    console.log('\nAll all-videos tests passed: ' + passed);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
})();
