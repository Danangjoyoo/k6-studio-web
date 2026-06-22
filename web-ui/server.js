'use strict';

const express = require('express');
const Docker = require('dockerode');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const { PassThrough } = require('stream');

const PORT = Number(process.env.PORT) || 3000;
const TESTS_DIR = '/tests';
const HOST_TESTS_PATH = process.env.HOST_TESTS_PATH;
const K6_IMAGE = process.env.K6_IMAGE;
const K6_TARGET_URL = process.env.K6_TARGET_URL || 'http://host.docker.internal:8084/healthz';
const MAX_LINES = 10000;
const SCRIPT_NAME_RE = /^[a-zA-Z0-9_-]+\.js$/;

const docker = new Docker({ socketPath: '/var/run/docker.sock' });
const app = express();

let isRunning = false;
let currentScript = null;
let containerId = null;
let exitCode = null;
let activeContainer = null;
let outputLines = [];
const sseClients = new Set();
let pingTimer = null;

function buildTimestamp() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}` +
    `T${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

function parseExtraHosts(value) {
  if (!value) return [];
  return value.split(',').map((entry) => entry.trim()).filter(Boolean);
}

function resolveScriptPath(name) {
  if (!SCRIPT_NAME_RE.test(name)) return null;
  const fullPath = path.resolve(TESTS_DIR, name);
  const base = path.resolve(TESTS_DIR);
  if (fullPath !== base && !fullPath.startsWith(base + path.sep)) return null;
  return fullPath;
}

function appendLine(line) {
  outputLines.push(line);
  if (outputLines.length > MAX_LINES) outputLines.shift();
  for (const res of sseClients) {
    if (!res.writableEnded) res.write(`data: ${line}\n\n`);
  }
}

function startPing() {
  if (pingTimer) return;
  pingTimer = setInterval(() => {
    for (const res of sseClients) {
      if (!res.writableEnded) res.write(': ping\n\n');
    }
  }, 15000);
}

function stopPing() {
  if (pingTimer) {
    clearInterval(pingTimer);
    pingTimer = null;
  }
}

function attachSseClient(res) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  for (const line of outputLines) {
    res.write(`data: ${line}\n\n`);
  }

  sseClients.add(res);
  startPing();

  res.on('close', () => {
    sseClients.delete(res);
    if (sseClients.size === 0) stopPing();
  });
}

function broadcastDone(code) {
  const payload = JSON.stringify({ exitCode: code });
  for (const res of sseClients) {
    if (!res.writableEnded) {
      res.write(`event: done\ndata: ${payload}\n\n`);
      res.end();
    }
  }
  sseClients.clear();
  stopPing();
}

function broadcastError(message) {
  const payload = JSON.stringify({ message });
  for (const res of sseClients) {
    if (!res.writableEnded) {
      res.write(`event: error\ndata: ${payload}\n\n`);
      res.end();
    }
  }
  sseClients.clear();
  stopPing();
}

async function listScripts() {
  const entries = await fsp.readdir(TESTS_DIR, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.js'))
    .map((entry) => entry.name)
    .sort();
}

async function cleanupOrphans() {
  const containers = await docker.listContainers({
    all: true,
    filters: { label: ['managed-by=k6-web-ui'] },
  });

  for (const info of containers) {
    const container = docker.getContainer(info.Id);
    await container.remove({ force: true });
    console.warn(`Removed orphan k6 container ${info.Id} (previous test terminated due to server restart)`);
  }
}

async function streamContainerLogs(container) {
  const logStream = await container.logs({
    follow: true,
    stdout: true,
    stderr: true,
    timestamps: false,
  });

  const stdout = new PassThrough();
  const stderr = new PassThrough();
  container.modem.demuxStream(logStream, stdout, stderr);

  const handleChunk = (chunk) => {
    const text = chunk.toString();
    for (const line of text.split(/\r?\n/)) {
      if (line) appendLine(line);
    }
  };

  stdout.on('data', handleChunk);
  stderr.on('data', handleChunk);

  return new Promise((resolve, reject) => {
    logStream.on('end', resolve);
    logStream.on('error', reject);
  });
}

async function startRun(name, res) {
  const scriptPath = resolveScriptPath(name);
  if (!scriptPath) {
    isRunning = false;
    return res.status(400).json({ error: 'invalid_name', reason: 'invalid_name' });
  }

  try {
    await fsp.access(scriptPath, fs.constants.F_OK);
  } catch {
    isRunning = false;
    return res.status(404).json({ error: 'not_found' });
  }

  outputLines = [];
  exitCode = null;
  currentScript = name;

  const runTimestamp = buildTimestamp();

  let container;
  try {
    container = await docker.createContainer({
      Image: K6_IMAGE,
      Cmd: ['run', `/tests/${name}`],
      Labels: { 'managed-by': 'k6-web-ui' },
      Env: [
        'K6_WEB_DASHBOARD=true',
        `K6_WEB_DASHBOARD_EXPORT=/tests/reports/summary-${runTimestamp}.html`,
        `K6_RUN_TIMESTAMP=${runTimestamp}`,
        `K6_TARGET_URL=${K6_TARGET_URL}`,
      ],
      HostConfig: {
        Binds: [`${HOST_TESTS_PATH}:/tests`],
        PortBindings: {
          '5665/tcp': [{ HostIp: '127.0.0.1', HostPort: '5665' }],
        },
        ExtraHosts: parseExtraHosts(process.env.K6_EXTRA_HOSTS),
        Resources: {
          NanoCpus: 2e9,
          Memory: 512 * 1024 * 1024,
        },
      },
    });
  } catch (err) {
    isRunning = false;
    currentScript = null;
    const message = String(err.message || err);
    if (/port is already allocated|address already in use/i.test(message)) {
      return res.status(503).json({ error: 'port_conflict', reason: 'port_conflict' });
    }
    if (/no such image|pull access denied|manifest unknown/i.test(message)) {
      return res.status(503).json({ error: 'image_not_found', message: 'Image not found — run `make pull`' });
    }
    return res.status(503).json({ error: 'docker_unavailable', reason: 'docker_unavailable', message });
  }

  activeContainer = container;
  containerId = container.id;

  try {
    await container.start();
  } catch (err) {
    isRunning = false;
    activeContainer = null;
    containerId = null;
    currentScript = null;
    try { await container.remove({ force: true }); } catch { /* ignore */ }
    const message = String(err.message || err);
    if (/port is already allocated|address already in use/i.test(message)) {
      return res.status(503).json({ error: 'port_conflict', reason: 'port_conflict' });
    }
    return res.status(503).json({ error: 'docker_unavailable', reason: 'docker_unavailable', message });
  }

  attachSseClient(res);

  const logsPromise = streamContainerLogs(container).catch((err) => {
    appendLine(`[error] log stream failed: ${err.message}`);
  });

  try {
    const result = await container.wait();
    await logsPromise.catch(() => {});
    exitCode = result.StatusCode;
    broadcastDone(exitCode);
  } catch (err) {
    appendLine(`[error] container wait failed: ${err.message}`);
    broadcastError(err.message);
  } finally {
    try { await container.remove({ force: true }); } catch { /* ignore */ }
    isRunning = false;
    activeContainer = null;
    containerId = null;
    currentScript = null;
  }
}

async function stopActiveContainer() {
  if (!activeContainer) return false;

  const container = activeContainer;
  try { await container.stop({ t: 5 }); } catch { /* already stopped */ }
  try { await container.remove({ force: true }); } catch { /* ignore */ }

  isRunning = false;
  activeContainer = null;
  containerId = null;
  currentScript = null;
  broadcastDone(exitCode ?? 137);
  return true;
}

async function shutdown() {
  if (activeContainer) {
    await stopActiveContainer();
  }
  process.exit(0);
}

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json({ limit: '256kb' }));

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

app.get('/api/scripts', async (_req, res) => {
  try {
    const scripts = await listScripts();
    res.json(scripts);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/scripts/:name', async (req, res) => {
  const scriptPath = resolveScriptPath(req.params.name);
  if (!scriptPath) return res.status(400).json({ error: 'invalid_name', reason: 'invalid_name' });

  try {
    const content = await fsp.readFile(scriptPath, 'utf8');
    res.type('text/plain').send(content);
  } catch (err) {
    if (err.code === 'ENOENT') return res.status(404).json({ error: 'not_found' });
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/scripts/:name', async (req, res) => {
  const scriptPath = resolveScriptPath(req.params.name);
  if (!scriptPath) return res.status(400).json({ error: 'invalid_name', reason: 'invalid_name' });

  const content = req.body?.content;
  if (typeof content !== 'string') {
    return res.status(400).json({ error: 'invalid_body', message: 'content must be a string' });
  }

  try {
    await fsp.mkdir(path.dirname(scriptPath), { recursive: true });
    await fsp.writeFile(scriptPath, content, 'utf8');
    res.json({ saved: true, name: req.params.name });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/scripts/:name', async (req, res) => {
  const scriptPath = resolveScriptPath(req.params.name);
  if (!scriptPath) return res.status(400).json({ error: 'invalid_name', reason: 'invalid_name' });

  if (isRunning && currentScript === req.params.name) {
    return res.status(409).json({ error: 'script_running', reason: 'script_running' });
  }

  try {
    await fsp.unlink(scriptPath);
    res.json({ deleted: true, name: req.params.name });
  } catch (err) {
    if (err.code === 'ENOENT') return res.status(404).json({ error: 'not_found' });
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/status', (_req, res) => {
  res.json({
    status: isRunning ? 'running' : 'idle',
    script: currentScript,
    containerId,
    exitCode,
  });
});

app.get('/api/output', (_req, res) => {
  res.json({ lines: outputLines });
});

app.get('/api/stream', (req, res) => {
  if (!isRunning) return res.status(404).json({ error: 'not_running' });
  attachSseClient(res);
});

app.post('/api/run', async (req, res) => {
  if (isRunning) {
    return res.status(409).json({ error: 'already_running', reason: 'already_running' });
  }

  const name = req.body?.name;
  if (!name || typeof name !== 'string') {
    return res.status(400).json({ error: 'invalid_body', message: 'name is required' });
  }

  const normalized = name.endsWith('.js') ? name : `${name}.js`;
  isRunning = true;
  await startRun(normalized, res);
});

app.post('/api/stop', async (_req, res) => {
  if (!isRunning || !activeContainer) {
    return res.json({ stopped: false });
  }

  const stopped = await stopActiveContainer();
  res.json({ stopped });
});

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

async function main() {
  if (!HOST_TESTS_PATH) {
    console.error('HOST_TESTS_PATH is required');
    process.exit(1);
  }

  if (!K6_IMAGE) {
    console.error('K6_IMAGE is required');
    process.exit(1);
  }

  try {
    await fsp.access(TESTS_DIR, fs.constants.F_OK);
  } catch {
    console.error(`Tests directory not found at ${TESTS_DIR}`);
    process.exit(1);
  }

  try {
    await docker.listContainers({});
  } catch (err) {
    console.error(`Docker daemon unavailable: ${err.message}`);
    process.exit(1);
  }

  await cleanupOrphans();

  app.listen(PORT, () => {
    console.log(`k6 web-ui listening on http://localhost:${PORT}`);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
