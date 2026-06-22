'use strict';

const express = require('express');
const { createServer } = require('node:http');
const fsp = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');

const PORT = Number(process.env.PORT) || 3000;
const TESTS_DIR = process.env.TESTS_DIR || '/tests';
const REPORTS_DIR = path.join(TESTS_DIR, 'reports');
const K6_RUNNER_URL = process.env.K6_RUNNER_URL || 'http://k6:8080';

const SEGMENT_RE = /^[a-zA-Z0-9_-]+$/;
const SCRIPT_FILE_RE = /^[a-zA-Z0-9_-]+\.js$/;
const MAX_DEPTH = 5;

function validatePath(rawPath, { isDir = false } = {}) {
  const decoded = decodeURIComponent(rawPath || '');
  const segments = decoded.split('/').filter(Boolean);

  if (segments.length > MAX_DEPTH) return { valid: false, error: 'too_deep' };

  for (let i = 0; i < segments.length - 1; i++) {
    if (!SEGMENT_RE.test(segments[i])) return { valid: false, error: 'invalid_path' };
  }

  const last = segments[segments.length - 1];
  if (!last) return { valid: false, error: 'invalid_path' };

  if (isDir) {
    if (!SEGMENT_RE.test(last)) return { valid: false, error: 'invalid_path' };
  } else {
    if (!SCRIPT_FILE_RE.test(last)) return { valid: false, error: 'invalid_path' };
  }

  const resolved = path.resolve(TESTS_DIR, ...segments);
  const base = path.resolve(TESTS_DIR);
  if (!resolved.startsWith(base + path.sep) && resolved !== base) {
    return { valid: false, error: 'invalid_path' };
  }
  return { valid: true, resolved, relPath: segments.join('/') };
}

async function buildTree(dir, name, excludeDir, depth = 0) {
  const node = { type: 'dir', name, children: [] };
  if (depth > MAX_DEPTH) return node;
  let entries;
  try { entries = await fsp.readdir(dir, { withFileTypes: true }); }
  catch { return node; }
  entries.sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of entries) {
    if (entry.name === excludeDir) continue;
    if (entry.isDirectory()) {
      node.children.push(await buildTree(path.join(dir, entry.name), entry.name, null, depth + 1));
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      const relPath = path.relative(TESTS_DIR, path.join(dir, entry.name));
      node.children.push({ type: 'file', name: entry.name, path: relPath });
    }
  }
  return node;
}

function parseTimestampLabel(filename) {
  const m = filename.match(/(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})/);
  if (!m) return filename;
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${months[Number(m[2]) - 1]} ${Number(m[3])}, ${m[4]}:${m[5]}`;
}

async function buildReportsTree(dir, name, depth = 0) {
  const node = { type: 'dir', name, children: [] };
  if (depth > MAX_DEPTH) return node;
  let entries;
  try { entries = await fsp.readdir(dir, { withFileTypes: true }); }
  catch { return node; }
  // jsonUrl points to k6 NDJSON metrics stream (may 404 if run stopped before flush — spec-designed)
  const htmlFiles = entries
    .filter((e) => e.isFile() && e.name.endsWith('.html'))
    .sort((a, b) => b.name.localeCompare(a.name));
  const subDirs = entries
    .filter((e) => e.isDirectory())
    .sort((a, b) => a.name.localeCompare(b.name));

  for (const entry of subDirs) {
    node.children.push(await buildReportsTree(path.join(dir, entry.name), entry.name, depth + 1));
  }
  for (const entry of htmlFiles) {
    const base = entry.name.replace(/\.html$/, '');
    const relPath = path.relative(REPORTS_DIR, path.join(dir, entry.name));
    node.children.push({
      type: 'file',
      name: entry.name,
      path: relPath,
      htmlUrl: `/reports/${relPath}`,
      jsonUrl: `/reports/${base}.json`,
      metaUrl: `/reports/${base}.meta.json`,
      label: parseTimestampLabel(base),
    });
  }
  return node;
}

function proxyTo(targetPath, req, res) {
  const url = new URL(K6_RUNNER_URL);
  const opts = {
    hostname: url.hostname,
    port: url.port || 8080,
    path: targetPath,
    method: req.method,
    headers: { 'content-type': 'application/json' },
  };

  const proxyReq = http.request(opts, (proxyRes) => {
    res.status(proxyRes.statusCode);
    if (proxyRes.headers['content-type']) {
      res.setHeader('Content-Type', proxyRes.headers['content-type']);
    }
    if (proxyRes.headers['x-accel-buffering']) {
      res.setHeader('X-Accel-Buffering', proxyRes.headers['x-accel-buffering']);
    }
    res.setHeader('Cache-Control', 'no-cache');
    if (targetPath === '/stream') res.flushHeaders();
    proxyRes.pipe(res);
  });

  proxyReq.on('error', () => {
    if (!res.headersSent) {
      res.status(503).json({
        error: 'runner_unavailable',
        message: 'k6 runner unavailable — is the k6 service healthy?',
      });
    }
  });

  // Propagate browser disconnect upstream to avoid phantom SSE connections
  req.on('close', () => proxyReq.destroy());

  if (req.body && Object.keys(req.body).length) {
    proxyReq.write(JSON.stringify(req.body));
  }
  proxyReq.end();
}

const app = express();

// CSP on all responses
app.use((_req, res, next) => {
  res.setHeader('Content-Security-Policy',
    "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; worker-src blob:");
  next();
});

app.use(express.json({ limit: '256kb' }));

// CSRF guard for mutation methods
app.use((req, res, next) => {
  if (['POST', 'PUT', 'DELETE'].includes(req.method)) {
    if (req.headers['x-requested-with'] !== 'XMLHttpRequest') {
      return res.status(403).json({ error: 'forbidden' });
    }
  }
  next();
});

// 413 body-too-large mapping
app.use((err, _req, res, next) => {
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'payload_too_large' });
  next(err);
});

// Static reports with extra security headers
// allow-scripts required so the k6 self-contained HTML dashboard can render its charts
app.use('/reports', (_req, res, next) => {
  res.setHeader('Content-Security-Policy', 'sandbox allow-scripts');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  next();
}, express.static(REPORTS_DIR));

app.use(express.static(path.join(__dirname, 'public')));

app.get('/health', (_req, res) => res.json({ ok: true }));

app.get('/api/tree', async (_req, res) => {
  const tree = await buildTree(TESTS_DIR, 'tests', 'reports');
  res.json(tree);
});

app.get('/api/scripts/*', async (req, res) => {
  const v = validatePath(req.params[0]);
  if (!v.valid) return res.status(400).json({ error: v.error });
  try {
    const content = await fsp.readFile(v.resolved, 'utf8');
    res.type('text/plain').send(content);
  } catch (err) {
    if (err.code === 'ENOENT') return res.status(404).json({ error: 'not_found' });
    res.status(500).json({ error: 'read_failed' });
  }
});

app.put('/api/scripts/*', async (req, res) => {
  const v = validatePath(req.params[0]);
  if (!v.valid) {
    if (v.error === 'too_deep') return res.status(400).json({ error: 'too_deep', message: 'Maximum directory depth is 5 levels' });
    return res.status(400).json({ error: v.error });
  }
  const { content } = req.body || {};
  if (typeof content !== 'string') return res.status(400).json({ error: 'invalid_body' });
  await fsp.mkdir(path.dirname(v.resolved), { recursive: true });
  await fsp.writeFile(v.resolved, content, 'utf8');
  res.json({ saved: true });
});

app.delete('/api/scripts/*', async (req, res) => {
  // Accept both files and dirs; validate through shared path guard
  const raw = req.params[0] || '';
  const decoded = decodeURIComponent(raw);
  const segments = decoded.split('/').filter(Boolean);

  if (!segments.length) return res.status(400).json({ error: 'invalid_path' });

  const resolved = path.resolve(TESTS_DIR, ...segments);
  const base = path.resolve(TESTS_DIR);
  // Traversal guard
  if (!resolved.startsWith(base + path.sep) && resolved !== base) {
    return res.status(400).json({ error: 'invalid_path' });
  }
  // Segment validation
  for (const seg of segments) {
    if (!SEGMENT_RE.test(seg) && !SCRIPT_FILE_RE.test(seg)) {
      return res.status(400).json({ error: 'invalid_path' });
    }
  }

  // Check if a running script would be deleted (separator-aware prefix match)
  try {
    const runnerUrl = new URL(K6_RUNNER_URL);
    const statusRes = await new Promise((resolve, reject) => {
      const r = http.request({
        hostname: runnerUrl.hostname,
        port: runnerUrl.port || 8080,
        path: '/status',
        method: 'GET',
      }, (pr) => {
        let d = '';
        pr.on('data', (c) => { d += c; });
        pr.on('end', () => resolve(JSON.parse(d)));
      });
      r.on('error', reject);
      r.end();
    });
    if (statusRes.status !== 'idle' && statusRes.script) {
      const runningResolved = path.resolve(TESTS_DIR, statusRes.script);
      if (runningResolved === resolved || runningResolved.startsWith(resolved + path.sep)) {
        return res.status(409).json({ error: 'script_running' });
      }
    }
  } catch { /* runner unreachable — proceed with delete */ }

  try {
    const stat = await fsp.stat(resolved);
    if (stat.isDirectory()) {
      await fsp.rm(resolved, { recursive: true });
    } else {
      await fsp.unlink(resolved);
    }
    res.json({ deleted: true });
  } catch (err) {
    if (err.code === 'ENOENT') return res.status(404).json({ error: 'not_found' });
    res.status(500).json({ error: 'delete_failed' });
  }
});

app.put('/api/dirs/*', async (req, res) => {
  const v = validatePath(req.params[0], { isDir: true });
  if (!v.valid) {
    if (v.error === 'too_deep') return res.status(400).json({ error: 'too_deep', message: 'Maximum directory depth is 5 levels' });
    return res.status(400).json({ error: v.error });
  }
  await fsp.mkdir(v.resolved, { recursive: true });
  res.json({ created: true });
});

app.get('/api/reports', async (_req, res) => {
  const tree = await buildReportsTree(REPORTS_DIR, 'reports');
  res.json(tree);
});

app.post('/api/run', (req, res) => proxyTo('/run', req, res));
app.post('/api/stop', (req, res) => proxyTo('/stop', req, res));
app.get('/api/status', (req, res) => proxyTo('/status', req, res));
app.get('/api/output', (req, res) => proxyTo('/output', req, res));
app.get('/api/stream', (req, res) => proxyTo('/stream', req, res));

function startServer(port) {
  return new Promise((resolve, reject) => {
    const server = createServer(app);
    server.listen(port, '0.0.0.0', () => resolve(server));
    server.on('error', reject);
  });
}

if (require.main === module) {
  process.on('SIGTERM', () => process.exit(0));
  process.on('SIGINT', () => process.exit(0));

  startServer(PORT).then(() => {
    console.log(`k6 web-ui listening on http://localhost:${PORT}`);
  }).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { startServer };
