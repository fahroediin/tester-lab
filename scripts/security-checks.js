/*
 * Security regression checks (CODING_STANDARD §8.1).
 * Pure-function tests — no network / Supabase required.
 * Run: node scripts/security-checks.js   (after `npm run build`)
 */
'use strict';
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy';

const assert = require('assert');
const { sanitizeCode } = require('../dist/server/code-sanitizer.js');
const { CodeGenerator } = require('../dist/generator/code-generator.js');
const { assertSafeProxyUrl, isValidHttpUrl } = require('../dist/server/lib/url-guard.js');
const { validateDSL } = require('../dist/validator/dsl-validator.js');
const { toVideoStoragePath } = require('../dist/server/lib/storage-url.js');

let passed = 0;
function ok(name, cond) {
  assert.ok(cond, 'FAILED: ' + name);
  passed++;
  console.log('  ✓ ' + name);
}

(async () => {
  console.log('\n[1] code-sanitizer blocks dangerous patterns');
  ok('blocks process.env', !sanitizeCode('const x = process.env.SECRET;').safe);
  ok('blocks process["env"] bracket', !sanitizeCode("const x = process['env'];").safe);
  ok('blocks require(child_process)', !sanitizeCode("require('child_process')").safe);
  ok('blocks require(fs)', !sanitizeCode("const fs = require('fs');").safe);
  ok('blocks dynamic import()', !sanitizeCode("await import('child_process')").safe);
  ok('blocks import from fs', !sanitizeCode("import { readFileSync } from 'fs';").safe);
  ok('blocks eval', !sanitizeCode('eval("1+1")').safe);
  ok('blocks globalThis', !sanitizeCode('globalThis.process').safe);
  ok('blocks .constructor', !sanitizeCode("({}).constructor").safe);
  ok('blocks require via template literal', !sanitizeCode('require(`child_process`)').safe);
  ok('allows @playwright import', sanitizeCode("import { test, expect } from '@playwright/test';\nawait page.goto('https://x');").safe);
  ok('allows require(@playwright)', sanitizeCode("const { test } = require('@playwright/test');").safe);

  console.log('\n[2] code-generator escapes injected DSL values (no breakout)');
  const gen = new CodeGenerator();
  const parsesOk = (code) => { try { new Function(code); return true; } catch (_) { return false; } };

  // (a) Pure-JS Playwright output must still parse as valid JS after an injection attempt.
  const jsInject = "x'); await page.evaluate(() => alert(1)); ('";
  const cfgJs = { testSuite: "S'); danger(); ('", targetUrl: 'https://example.com', framework: 'playwright', language: 'javascript' };
  const stepsJs = [{ step: 1, action: 'fill', selectorType: 'getByTestId', selectorValue: 'email', value: jsInject, targetLabel: 'Email', matchScore: 100 }];
  const resJs = await gen.generateScript(cfgJs, stepsJs);
  ok('generated JS parses (no syntax breakout)', parsesOk(resJs.code));
  ok('generated JS is sanitizer-safe', sanitizeCode(resJs.code).safe);

  // (b) Selenium output is NOT prettier-processed, so raw escaping is directly observable.
  const pyInject = '");import os;os.system("id");("';
  const cfgPy = { testSuite: 'T', targetUrl: 'https://example.com', framework: 'selenium', language: 'python' };
  const stepsPy = [{ step: 1, action: 'fill', selectorType: 'locator', selectorValue: '#x', value: pyInject, targetLabel: 'x', matchScore: 50 }];
  const resPy = await gen.generateScript(cfgPy, stepsPy);
  ok('python value quotes are escaped', resPy.code.includes('\\"'));
  ok('python has no raw breakout sequence', !resPy.code.includes('");import os;os.system("id");("'));

  console.log('\n[3] dangerous payload in DSL value is caught by dry-run sanitizer');
  const steps2 = [{ step: 1, action: 'fill', selectorType: 'getByTestId', selectorValue: 'x', value: 'require("child_process").execSync("id")', targetLabel: 'x', matchScore: 100 }];
  const res2 = await gen.generateScript(cfgJs, steps2);
  ok('generated code with require payload is flagged unsafe', !sanitizeCode(res2.code).safe);

  console.log('\n[4] SSRF url-guard');
  ok('allows public host', assertSafeProxyUrl('https://example.com/x').ok === true);
  ok('blocks localhost', assertSafeProxyUrl('http://localhost:3000').ok === false);
  ok('blocks 127.0.0.1', assertSafeProxyUrl('http://127.0.0.1/').ok === false);
  ok('blocks cloud metadata 169.254.169.254', assertSafeProxyUrl('http://169.254.169.254/latest/').ok === false);
  ok('blocks 10.x private', assertSafeProxyUrl('http://10.1.2.3/').ok === false);
  ok('blocks 192.168.x private', assertSafeProxyUrl('http://192.168.0.5/').ok === false);
  ok('blocks 172.16.x private', assertSafeProxyUrl('http://172.16.5.5/').ok === false);
  ok('blocks ipv6 loopback ::1', assertSafeProxyUrl('http://[::1]/').ok === false);
  ok('blocks file protocol', assertSafeProxyUrl('file:///etc/passwd').ok === false);
  ok('isValidHttpUrl rejects ftp', isValidHttpUrl('ftp://x') === false);

  console.log('\n[5] DSL validator enforces http(s) targetUrl');
  ok('rejects non-URL targetUrl', validateDSL({ testSuite: 'T', targetUrl: "'); danger();", steps: [{ step: 1, action: 'click', targetLabel: 'x' }] }).valid === false);
  ok('rejects javascript: targetUrl', validateDSL({ testSuite: 'T', targetUrl: 'javascript:alert(1)', steps: [{ step: 1, action: 'click', targetLabel: 'x' }] }).valid === false);
  ok('accepts valid http URL', validateDSL({ testSuite: 'T', targetUrl: 'https://example.com', steps: [{ step: 1, action: 'click', targetLabel: 'x' }] }).valid === true);

  console.log('\n[6] video storage path normalization');
  ok('new path passthrough', toVideoStoragePath('user123/run_9.webm') === 'user123/run_9.webm');
  ok('legacy public URL -> path', toVideoStoragePath('https://p.supabase.co/storage/v1/object/public/test-videos/user123/run_9.webm') === 'user123/run_9.webm');

  console.log('\n[7] normal (benign) generation still works — no over-escaping regression');
  const okCfg = { testSuite: 'Login Flow', targetUrl: 'https://example.com/login', framework: 'playwright', language: 'javascript' };
  const okSteps = [
    { step: 1, action: 'fill', selectorType: 'getByTestId', selectorValue: 'email', value: 'john@example.com', targetLabel: 'Email', matchScore: 100 },
    { step: 2, action: 'click', selectorType: 'getByRole', selectorValue: 'button', roleName: 'Sign In', targetLabel: 'Sign In', matchScore: 88 }
  ];
  const okRes = await gen.generateScript(okCfg, okSteps);
  ok('benign value preserved verbatim', okRes.code.includes('john@example.com'));
  ok('benign output parses & is safe', parsesOk(okRes.code) && sanitizeCode(okRes.code).safe);
  const apos = await gen.generateScript(okCfg, [{ step: 1, action: 'fill', selectorType: 'getByTestId', selectorValue: 'name', value: "O'Brien", targetLabel: 'Name', matchScore: 100 }]);
  ok("value with apostrophe stays safe & valid", parsesOk(apos.code) && sanitizeCode(apos.code).safe);

  console.log('\nALL SECURITY CHECKS PASSED (' + passed + ' assertions)\n');
})().catch((e) => { console.error(e); process.exit(1); });
