'use strict';

const express = require('express');
const { spawn } = require('node:child_process');
const { createServer } = require('node:http');
const fsp = require('node:fs/promises');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const TESTS_DIR = process.env.TESTS_DIR || '/tests';
const MAX_LINES = 10000;
const MAX_SSE_CLIENTS = 5;
const PING_INTERVAL_MS = 15000;
const SIGKILL_TIMEOUT_MS = 5000;

const SEGMENT_RE = /^[a-zA-Z0-9_-]+$/;
const SCRIPT_FILE_RE = /^[a-zA-Z0-9_-]+\.js$/;

let isRunning = false;
let currentScript = null;
let currentRunId = null;
let currentExitCode = null;
let currentStatus = 'idle'; // 'idle' | 'running' | 'stopping'
let stoppedByUser = false;
let subprocess = null;
let ringBuffer = [];
let ringTruncated = false;
const sseClients = [];
let pingTimer = null;

function buildTimestamp() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}` +
    `T${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}`;
}

function validateScriptName(name) {
  if (!name || typeof name !== 'string') return { valid: false, error: 'invalid_body' };
  const segments = name.split('/');
  if (segments.length > 5) return { valid: false, error: 'too_deep' };
  const file = segments[segments.length - 1];
  if (!SCRIPT_FILE_RE.test(file)) return { valid: false, error: 'invalid_path' };
  for (let i = 0; i < segments.length - 1; i++) {
    if (!SEGMENT_RE.test(segments[i])) return { valid: false, error: 'invalid_path' };
  }
  const resolved = path.resolve(TESTS_DIR, name);
  const base = path.resolve(TESTS_DIR);
  if (!resolved.startsWith(base + path.sep) && resolved !== base) {
    return { valid: false, error: 'invalid_path' };
  }
  return { valid: true, resolved };
}

function appendLine(line) {
  // Sanitize to prevent SSE protocol injection via embedded newlines
  const safe = line.replace(/[\r\n]/g, ' ');
  if (ringBuffer.length >= MAX_LINES) {
    ringBuffer.shift();
    ringTruncated = true;
  }
  ringBuffer.push(safe);
  for (const res of sseClients) {
    if (!res.writableEnded) res.write(`data: ${safe}\n\n`);
  }
}

function broadcastEvent(event, data) {
  const payload = JSON.stringify(data);
  for (const res of sseClients) {
    if (!res.writableEnded) {
      res.write(`event: ${event}\ndata: ${payload}\n\n`);
    }
  }
}

function addSseClient(res) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  // No ring-buffer replay here — frontend backlills via GET /output on reconnect

  if (sseClients.length >= MAX_SSE_CLIENTS) {
    const oldest = sseClients.shift();
    if (!oldest.writableEnded) {
      oldest.write('event: superseded\ndata: {}\n\n');
      oldest.end();
    }
  }
  sseClients.push(res);

  if (!pingTimer) {
    pingTimer = setInterval(() => {
      for (const c of sseClients) {
        if (!c.writableEnded) c.write(': ping\n\n');
      }
    }, PING_INTERVAL_MS);
  }

  res.on('close', () => {
    const idx = sseClients.indexOf(res);
    if (idx !== -1) sseClients.splice(idx, 1);
    if (sseClients.length === 0 && pingTimer) {
      clearInterval(pingTimer);
      pingTimer = null;
    }
  });
}

async function writeMetaSidecar(metaPath, runId, scriptName, startedAt, exitCode, endedAt, truncated, stopped) {
  const meta = {
    runId,
    script: scriptName,
    startedAt,
    endedAt,
    exitCode,
    thresholdsFailed: exitCode !== 0 && !stopped,
    truncated,
    stopped,
  };
  await fsp.writeFile(metaPath, JSON.stringify(meta, null, 2), 'utf8');
}

function resetState() {
  isRunning = false;
  currentScript = null;
  currentRunId = null;
  currentExitCode = null;
  currentStatus = 'idle';
  stoppedByUser = false;
  subprocess = null;
}

function stopSubprocess() {
  return new Promise((resolve) => {
    if (!subprocess) return resolve();
    stoppedByUser = true;
    currentStatus = 'stopping';
    let killed = false;
    const timer = setTimeout(() => {
      if (!killed) {
        subprocess?.kill('SIGKILL');
        killed = true;
      }
    }, SIGKILL_TIMEOUT_MS);

    subprocess.once('close', () => {
      clearTimeout(timer);
      resolve();
    });
    subprocess.kill('SIGTERM');
  });
}

const app = express();
app.use(express.json({ limit: '256kb' }));

app.get('/health', (_req, res) => res.json({ ok: true }));

app.get('/status', (_req, res) => {
  res.json({
    status: currentStatus,
    script: currentScript,
    runId: currentRunId,
    exitCode: currentExitCode,
  });
});

app.get('/output', (_req, res) => {
  res.json({ lines: [...ringBuffer], truncated: ringTruncated });
});

app.get('/stream', (_req, res) => {
  addSseClient(res);
});

app.post('/run', async (req, res) => {
  // Set flag synchronously before any await to prevent race condition
  if (isRunning) return res.status(409).json({ error: 'already_running' });
  isRunning = true;

  const { name } = req.body || {};
  if (!name || typeof name !== 'string') {
    isRunning = false;
    return res.status(400).json({ error: 'invalid_body' });
  }

  const validation = validateScriptName(name);
  if (!validation.valid) {
    isRunning = false;
    return res.status(400).json({ error: validation.error });
  }

  try {
    await fsp.access(validation.resolved, fs.constants.F_OK);
  } catch {
    isRunning = false;
    return res.status(404).json({ error: 'not_found' });
  }

  currentScript = name;
  currentRunId = crypto.randomUUID();
  currentExitCode = null;
  currentStatus = 'running';
  stoppedByUser = false;
  ringBuffer = [];
  ringTruncated = false;

  const ts = buildTimestamp();
  const startedAt = new Date().toISOString();
  const runId = currentRunId;

  const scriptBase = path.basename(name, '.js');
  const scriptDir = path.dirname(name);
  const reportDir = scriptDir === '.'
    ? path.join(TESTS_DIR, 'reports')
    : path.join(TESTS_DIR, 'reports', scriptDir);
  const htmlExport = path.join(reportDir, `${scriptBase}-${ts}.html`);
  const jsonOut = path.join(reportDir, `${scriptBase}-${ts}.json`);
  const metaOut = path.join(reportDir, `${scriptBase}-${ts}.meta.json`);

  try {
    await fsp.mkdir(reportDir, { recursive: true });
  } catch (err) {
    resetState();
    return res.status(500).json({ error: 'mkdir_failed', message: err.message });
  }

  res.json({ started: true, runId });

  // Explicit env allowlist — do not spread process.env to avoid leaking container secrets
  const k6Env = {
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    K6_WEB_DASHBOARD: 'true',
    K6_WEB_DASHBOARD_EXPORT: htmlExport,
    K6_RUN_TIMESTAMP: ts,
    K6_TARGET_URL: process.env.K6_TARGET_URL || '',
  };

  let spawnErr = null;
  try {
    subprocess = spawn('k6', ['run', '--out', `json=${jsonOut}`, validation.resolved], {
      env: k6Env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (err) {
    resetState();
    broadcastEvent('error', { message: err.message });
    return;
  }

  subprocess.on('error', (err) => {
    spawnErr = err;
    appendLine(`[error] spawn failed: ${err.message}`);
    broadcastEvent('error', { message: err.message });
  });

  const handleChunk = (chunk) => {
    const text = chunk.toString();
    for (const line of text.split(/\r?\n/)) {
      if (line) appendLine(line);
    }
  };

  subprocess.stdout.on('data', handleChunk);
  subprocess.stderr.on('data', handleChunk);

  subprocess.on('close', async (code) => {
    const endedAt = new Date().toISOString();
    currentExitCode = spawnErr ? 1 : (code ?? 1);
    const wasStopped = stoppedByUser;
    try {
      await writeMetaSidecar(metaOut, runId, name, startedAt, currentExitCode, endedAt, ringTruncated, wasStopped);
    } catch (e) {
      appendLine(`[warn] failed to write meta sidecar: ${e.message}`);
    }
    broadcastEvent('done', { exitCode: currentExitCode });
    resetState();
  });
});

app.post('/stop', async (_req, res) => {
  if (!subprocess) return res.json({ stopped: false });
  await stopSubprocess();
  res.json({ stopped: true });
});

function startServer(port) {
  return new Promise((resolve, reject) => {
    const server = createServer(app);
    server.listen(port, '0.0.0.0', () => resolve(server));
    server.on('error', reject);
  });
}

if (require.main === module) {
  const PORT = Number(process.env.PORT) || 8080;

  process.on('SIGTERM', async () => {
    if (subprocess) await stopSubprocess();
    process.exit(0);
  });
  process.on('SIGINT', async () => {
    if (subprocess) await stopSubprocess();
    process.exit(0);
  });

  startServer(PORT).then(() => {
    console.log(`k6 runner listening on :${PORT}`);
  }).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { startServer };
