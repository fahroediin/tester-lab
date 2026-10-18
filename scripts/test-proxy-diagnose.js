/*
 * Tests for recorder proxy page diagnosis.
 *
 * When the recorder proxies a target that requires authentication, the target
 * 30x-redirects to a login page. The raw iframe then shows a confusing browser
 * error. diagnoseProxyPage() detects the common "you were redirected to a login
 * page" case from the final URL + HTML, so the proxy can inject a clear,
 * actionable banner instead. Pure; no I/O.
 *
 * Run: node scripts/test-proxy-diagnose.js   (after `npm run build`)
 */
'use strict';
const assert = require('assert');
const { diagnoseProxyPage } = require('../dist/server/services/proxy-diagnose.js');

let passed = 0;
function ok(name, cond) { assert.ok(cond, 'FAILED: ' + name); passed++; console.log('  ✓ ' + name); }

(async () => {
  console.log('\n[proxy-diagnose] diagnoseProxyPage');

  // Redirected from a target root to a /login URL -> login_required.
  ok('redirect to /login path -> login_required',
    diagnoseProxyPage('https://app.example.com/', 'https://app.example.com/login', '<html><title>Login</title></html>').kind === 'login_required');

  // Final URL same as requested, normal content -> ok (no banner).
  ok('no redirect, normal page -> ok',
    diagnoseProxyPage('https://demo.playwright.dev/todomvc', 'https://demo.playwright.dev/todomvc', '<html><h1>TodoMVC</h1></html>').kind === 'ok');

  // Login detected by HTML signals even without /login in URL (SSO forms).
  ok('login form in HTML -> login_required',
    diagnoseProxyPage('https://x.com/', 'https://x.com/', '<form><input type="password" name="pass"></form>').kind === 'login_required');

  ok('title "Login - BDS" -> login_required',
    diagnoseProxyPage('https://devterral.osacademy.net/', 'https://devterral.osacademy.net/login', '<title>Login - BDS</title>Please enter your detail to login').kind === 'login_required');

  // Different host after redirect (SSO provider) -> login_required too.
  ok('redirect to different host with login -> login_required',
    diagnoseProxyPage('https://app.example.com/', 'https://sso.okta.com/signin', '<title>Sign In</title>').kind === 'login_required');

  // A normal page that merely contains the word "login" in a link is NOT flagged.
  ok('word "login" in a nav link only -> ok',
    diagnoseProxyPage('https://shop.example.com/', 'https://shop.example.com/', '<html><a href="/login">Login</a><h1>Products</h1><p>Buy now</p></html>').kind === 'ok');

  // Robustness: empty / missing inputs never throw, default to ok.
  ok('empty html -> ok', diagnoseProxyPage('https://x.com/', 'https://x.com/', '').kind === 'ok');
  ok('null html -> ok (no throw)', diagnoseProxyPage('https://x.com/', 'https://x.com/', null).kind === 'ok');
  ok('bad urls -> ok (no throw)', diagnoseProxyPage('not a url', '', '').kind === 'ok');

  // The result carries a human-readable, actionable message when login_required.
  {
    const d = diagnoseProxyPage('https://app.example.com/', 'https://app.example.com/login', '<title>Login</title>');
    ok('login_required carries a message', typeof d.message === 'string' && d.message.length > 0);
  }

  console.log('\nALL PROXY DIAGNOSE TESTS PASSED (' + passed + ' assertions)\n');
})().catch((e) => { console.error(e); process.exit(1); });
