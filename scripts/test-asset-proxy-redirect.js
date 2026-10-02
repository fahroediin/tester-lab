/*
 * Regression test for SSRF-via-redirect in the recorder asset proxy.
 *
 * handleRecorderProxy re-checks the FINAL url after redirects (assertSafeProxyUrl
 * on upstreamResponse.url). handleAssetProxy must do the same: a public origin
 * that 30x-redirects a sub-resource to an internal address must NOT be proxied.
 *
 * Run: node scripts/test-asset-proxy-redirect.js   (after `npm run build`)
 */
'use strict';
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy';

const assert = require('assert');
const { handleAssetProxy } = require('../dist/server/services/recorder-proxy-service.js');

let passed = 0;
function ok(name, cond) { assert.ok(cond, 'FAILED: ' + name); passed++; console.log('  ✓ ' + name); }

function makeReq(originalUrl, proxyOrigin) {
  return {
    path: originalUrl.split('?')[0],
    originalUrl,
    method: 'GET',
    headers: { cookie: `__tl_proxy_origin=${encodeURIComponent(proxyOrigin)}` }
  };
}
function makeRes() {
  return {
    statusCode: 200, headers: {}, bodySent: null, _ended: false,
    status(c) { this.statusCode = c; return this; },
    setHeader(k, v) { this.headers[k] = v; },
    removeHeader(k) { delete this.headers[k]; },
    send(b) { this.bodySent = b; this._ended = true; return this; }
  };
}

(async () => {
  console.log('\n[asset-proxy] redirect to internal must be blocked');

  const realFetch = global.fetch;

  // A public origin whose sub-resource redirects to an internal metadata IP.
  // fetch(redirect:follow) resolves with .url = the FINAL (internal) url.
  global.fetch = async () => ({
    status: 200,
    url: 'http://169.254.169.254/latest/meta-data/',
    headers: { get: () => 'text/html' },
    text: async () => '<html><body>SECRET INTERNAL</body></html>',
    arrayBuffer: async () => new ArrayBuffer(0)
  });

  try {
    const req = makeReq('/app.js', 'https://public-site.example');
    const res = makeRes();
    let nextCalled = false;
    await handleAssetProxy(req, res, () => { nextCalled = true; });

    // Correct behavior: the internal body must NOT be sent to the client.
    const leaked = typeof res.bodySent === 'string' && res.bodySent.includes('SECRET INTERNAL');
    ok('internal redirect body is NOT proxied to client', !leaked);
    ok('falls through (next) or errors instead of serving internal content', nextCalled || !res.bodySent);
  } finally {
    global.fetch = realFetch;
  }

  console.log('\nALL ASSET-PROXY REDIRECT TESTS PASSED (' + passed + ' assertions)\n');
})().catch((e) => { console.error(e); process.exit(1); });
