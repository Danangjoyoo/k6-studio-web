'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fsp = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');

let server, TESTS_DIR;

function req(method, urlPath, opts = {}) {
  return new Promise((resolve, reject) => {
    const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
    const r = http.request({ hostname: '127.0.0.1', port: 19080, path: urlPath, method, headers }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    r.on('error', reject);
    if (opts.body) r.write(JSON.stringify(opts.body));
    r.end();
  });
}

const CSRF = { 'X-Requested-With': 'XMLHttpRequest' };

before(async () => {
  TESTS_DIR = await fsp.mkdtemp(path.join(os.tmpdir(), 'k6-server-test-'));
  await fsp.mkdir(path.join(TESTS_DIR, 'reports'), { recursive: true });
  process.env.TESTS_DIR = TESTS_DIR;
  process.env.K6_RUNNER_URL = 'http://127.0.0.1:19999';
  const { startServer } = require('../server.js');
  server = await startServer(19080);
});
after(async () => { server?.close(); await fsp.rm(TESTS_DIR, { recursive: true, force: true }); });

test('GET /health returns ok', async () => {
  const { status, body } = await req('GET', '/health');
  assert.equal(status, 200); assert.equal(body.ok, true);
});
test('GET /api/tree returns dir node', async () => {
  const { status, body } = await req('GET', '/api/tree');
  assert.equal(status, 200); assert.equal(body.type, 'dir'); assert.equal(body.name, 'tests');
  assert.ok(Array.isArray(body.children));
});
test('PUT /api/scripts without CSRF returns 403', async () => {
  const { status, body } = await req('PUT', '/api/scripts/foo.js', { body: { content: 'x' } });
  assert.equal(status, 403); assert.equal(body.error, 'forbidden');
});
test('PUT /api/scripts with path traversal returns 400', async () => {
  const { status, body } = await req('PUT', '/api/scripts/..%2Fevil.js', { headers: CSRF, body: { content: 'x' } });
  assert.equal(status, 400); assert.equal(body.error, 'invalid_path');
});
test('PUT /api/scripts with invalid chars returns 400', async () => {
  const { status, body } = await req('PUT', '/api/scripts/foo%20bar.js', { headers: CSRF, body: { content: 'x' } });
  assert.equal(status, 400); assert.equal(body.error, 'invalid_path');
});
test('PUT /api/scripts too deep returns 400', async () => {
  const { status, body } = await req('PUT', '/api/scripts/a/b/c/d/e/f/deep.js', { headers: CSRF, body: { content: 'x' } });
  assert.equal(status, 400); assert.equal(body.error, 'too_deep');
});
test('PUT /api/scripts creates file and GET reads it back', async () => {
  const content = 'import http from "k6/http";';
  await req('PUT', '/api/scripts/hello.js', { headers: CSRF, body: { content } });
  const { status, body } = await req('GET', '/api/scripts/hello.js');
  assert.equal(status, 200); assert.equal(body, content);
});
test('GET /api/scripts on missing file returns 404', async () => {
  const { status, body } = await req('GET', '/api/scripts/missing.js');
  assert.equal(status, 404); assert.equal(body.error, 'not_found');
});
test('PUT /api/dirs creates directory', async () => {
  const { status, body } = await req('PUT', '/api/dirs/payments', { headers: CSRF });
  assert.equal(status, 200); assert.equal(body.created, true);
});
test('DELETE /api/scripts without CSRF returns 403', async () => {
  const { status } = await req('DELETE', '/api/scripts/hello.js');
  assert.equal(status, 403);
});
test('GET /api/reports returns dir node', async () => {
  const { status, body } = await req('GET', '/api/reports');
  assert.equal(status, 200); assert.equal(body.type, 'dir'); assert.equal(body.name, 'reports');
});
