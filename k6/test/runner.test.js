'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

function req(method, reqPath, body) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: '127.0.0.1',
      port: 18080,
      path: reqPath,
      method,
      headers: { 'Content-Type': 'application/json' },
    };
    const r = http.request(opts, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    r.on('error', reject);
    if (body) r.write(JSON.stringify(body));
    r.end();
  });
}

let server;
before(async () => {
  process.env.TESTS_DIR = '/tmp';
  const { startServer } = require('../runner.js');
  server = await startServer(18080);
});
after(() => server?.close());

test('GET /health returns ok', async () => {
  const { status, body } = await req('GET', '/health');
  assert.equal(status, 200);
  assert.equal(body.ok, true);
});

test('GET /status when idle', async () => {
  const { status, body } = await req('GET', '/status');
  assert.equal(status, 200);
  assert.equal(body.status, 'idle');
  assert.equal(body.script, null);
  assert.equal(body.runId, null);
  assert.equal(body.exitCode, null);
});

test('GET /output when idle returns empty lines', async () => {
  const { status, body } = await req('GET', '/output');
  assert.equal(status, 200);
  assert.deepEqual(body.lines, []);
  assert.equal(body.truncated, false);
});

test('POST /stop when idle is idempotent', async () => {
  const { status, body } = await req('POST', '/stop');
  assert.equal(status, 200);
  assert.equal(body.stopped, false);
});

test('POST /run with missing name returns 400', async () => {
  const { status, body } = await req('POST', '/run', {});
  assert.equal(status, 400);
  assert.equal(body.error, 'invalid_body');
});

test('POST /run with path traversal returns 400', async () => {
  const { status, body } = await req('POST', '/run', { name: '../evil.js' });
  assert.equal(status, 400);
  assert.equal(body.error, 'invalid_path');
});

test('POST /run with invalid segment returns 400', async () => {
  const { status, body } = await req('POST', '/run', { name: 'foo bar/test.js' });
  assert.equal(status, 400);
  assert.equal(body.error, 'invalid_path');
});

test('POST /run with nonexistent file returns 404', async () => {
  const { status, body } = await req('POST', '/run', { name: 'nonexistent-script.js' });
  assert.equal(status, 404);
  assert.equal(body.error, 'not_found');
});
