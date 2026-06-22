# k6 Studio v2 — Design Spec
**Date:** 2026-06-22  
**Supersedes:** docs/superpowers/specs/2026-06-22-k6-web-ui-design.md  
**FGD Round 1:** docs/superpowers/reviews/2026-06-22-k6-studio-v2-round1.md (all 9 personas APPROVE_WITH_CONCERNS, no BLOCKs)

---

## Overview

A browser-based k6 load test platform with two Docker Compose services: `web-ui` (editor + API gateway) and `k6` (load runner). No Docker socket mounting. Scripts are organized in a directory tree. Reports mirror the script tree and persist across restarts. One load test runs at a time; the Run button is disabled while a test is active.

---

## Goals

1. Edit, organize, and run k6 scripts in the browser — no terminal required after `docker compose up`.
2. Scripts persist in `./tests/` in a nested directory structure.
3. One named k6 service as a long-running runner; web-ui triggers runs over an internal HTTP API.
4. Live output streamed to the browser via SSE.
5. k6 web dashboard available at `localhost:5665` while a test runs.
6. Completed runs produce HTML + JSON + meta.json reports stored under `tests/reports/` mirroring the script path.
7. Reports browseable in the UI sidebar; clicking opens the self-contained HTML in a new tab.

## Non-Goals

- Concurrent test runs (one worker, one run at a time).
- User authentication (localhost-only tool).
- Run history beyond what files exist in `tests/reports/`.
- CI/CD integration.
- Script rename/move operations (v2).
- Run comparison / trend view (v2).
- `REPORT_RETENTION_DAYS` auto-cleanup (v2).

---

## Architecture

### Services

| Service | Image | Published ports | Internal port |
|---|---|---|---|
| `web-ui` | Custom (`node:20-alpine`) | `127.0.0.1:3000:3000` | 3000 |
| `k6` | Custom (k6 binary + `node:20-alpine`) | `127.0.0.1:5665:5665` | 8080 (runner API, not published) |

No Docker socket mount anywhere.

> **Image pinning:** For reproducible builds, pin both base images to immutable digests in production (e.g. `node:20.19-alpine3.21@sha256:<digest>`, `grafana/k6:0.55.0@sha256:<digest>`). See README for update procedure.

### Request flow

```
Browser
  │
  ├── GET  /                    → Monaco editor UI (web-ui static)
  ├── GET  /api/tree            → script tree     (web-ui)
  ├── GET  /api/scripts/**      → script CRUD     (web-ui)
  ├── GET  /api/reports         → reports tree    (web-ui)
  ├── GET  /reports/**          → static HTML     (web-ui serves tests/reports/)
  │
  └── POST /api/run             → web-ui proxies ──> k6:8080/run
      GET  /api/stream          → web-ui proxies ──> k6:8080/stream (SSE)
      POST /api/stop            → web-ui proxies ──> k6:8080/stop
      GET  /api/status          → web-ui proxies ──> k6:8080/status
      GET  /api/output          → web-ui proxies ──> k6:8080/output
```

### Volume strategy

Both services mount `./tests:/tests` (read-write). web-ui manages script files; k6 reads them and writes reports.

---

## docker-compose.yml

```yaml
services:
  web-ui:
    build: ./web-ui
    ports:
      - "127.0.0.1:3000:3000"
    volumes:
      - ./tests:/tests
    environment:
      - K6_RUNNER_URL=http://k6:8080
    depends_on:
      k6:
        condition: service_healthy
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost:3000/health"]
      interval: 10s
      retries: 3
      start_period: 5s

  k6:
    build: ./k6
    init: true
    ports:
      - "127.0.0.1:5665:5665"
    volumes:
      - ./tests:/tests
    environment:
      - K6_TARGET_URL=${K6_TARGET_URL:-http://host.docker.internal:8084/healthz}
    extra_hosts:
      - "host.docker.internal:host-gateway"
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost:8080/health"]
      interval: 10s
      retries: 3
      start_period: 5s
```

Notes:
- `K6_TARGET_URL` and `K6_EXTRA_HOSTS` are **not** in the web-ui env block — web-ui never reads them.
- `init: true` on k6 ensures Node.js is not PID 1; prevents zombie k6 subprocesses on OOM kill.

---

## Directory Layout

```
k6-local/
├── docker-compose.yml
├── .env.example
├── .gitignore
├── README.md
├── web-ui/
│   ├── Dockerfile
│   ├── .dockerignore         ← node_modules/, .env
│   ├── package.json
│   ├── server.js
│   └── public/
│       ├── index.html
│       └── monaco-editor/       (copied from npm at build time)
├── k6/
│   ├── Dockerfile
│   ├── .dockerignore         ← node_modules/, .env
│   ├── package.json
│   └── runner.js
└── tests/                    ← pre-create with: mkdir -p tests/reports
    ├── healthz.js
    ├── payments/
    │   └── refund.js
    └── reports/
        ├── healthz-20260622T134001.html
        ├── healthz-20260622T134001.json
        ├── healthz-20260622T134001.meta.json
        └── payments/
            ├── refund-20260622T140812.html
            ├── refund-20260622T140812.json
            └── refund-20260622T140812.meta.json
```

**Bootstrap prerequisite:** `mkdir -p tests/reports` must be run before `docker compose up` (documented in README). If omitted, Docker creates the directory owned by root:root on Linux, which may break writes on non-root container users in future.

---

## k6 Service (`k6/`)

### Dockerfile

```dockerfile
FROM grafana/k6:0.55.0 AS k6bin
FROM node:20-alpine
COPY --from=k6bin /usr/local/bin/k6 /usr/local/bin/k6
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --production
COPY runner.js .
EXPOSE 8080
CMD ["node", "runner.js"]
```

### runner.js — HTTP API

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | `{ok: true}` |
| `POST` | `/run` | Body: `{name}` — starts k6; 409 if already running |
| `POST` | `/stop` | Kills running subprocess; idempotent |
| `GET` | `/status` | `{status, script, runId, exitCode}` — status is `idle \| running \| stopping` |
| `GET` | `/output` | `{lines: string[], truncated: boolean}` — ring buffer (10k lines) |
| `GET` | `/stream` | SSE: replays ring buffer then live; ping heartbeat; event:done |

### Path validation (runner layer)

Before accepting any `name` from `/run`, runner.js validates:
- Each path segment matches `SEGMENT = /^[a-zA-Z0-9_-]+$/`
- Final segment matches `SCRIPT_FILE = /^[a-zA-Z0-9_-]+\.js$/`
- Resolved absolute path starts with `/tests/`
- Violation → `400 {error: "invalid_path"}`

### Run execution

1. **Atomic concurrency guard:** `isRunning === true` → return `409 {error: "already_running"}` immediately.
2. Set `isRunning = true` synchronously; generate `runId` (UUID or `crypto.randomUUID()`).
3. Build `RUN_TIMESTAMP` = `YYYYMMDDTHHmmss` in **UTC**.
4. Derive report paths from script name (e.g. `payments/refund.js`):
   - `scriptDir` = dirname relative to `/tests/` — empty string `""` for root-level scripts
   - `scriptBase` = basename without `.js` (e.g. `refund`)
   - `reportDir` = scriptDir is `""` → `/tests/reports/` else `/tests/reports/<scriptDir>/` — created with `mkdir -p`
   - `htmlExport` = `<reportDir><scriptBase>-<ts>.html`
   - `jsonOut` = `<reportDir><scriptBase>-<ts>.json`
   - `metaOut` = `<reportDir><scriptBase>-<ts>.meta.json`
5. Record `startedAt = new Date().toISOString()` (UTC).
6. Clear ring buffer; set `truncated = false`.
7. Spawn: `k6 run --out json=<jsonOut> /tests/<name>` with env:
   - `K6_WEB_DASHBOARD=true`
   - `K6_WEB_DASHBOARD_EXPORT=<htmlExport>`
   - `K6_RUN_TIMESTAMP=<ts>`
   - `K6_TARGET_URL=<from process.env>`

   Note: `--out json=<file>` is k6's built-in NDJSON metrics format (schema: https://k6.io/docs/results-output/real-time/json). `K6_WEB_DASHBOARD_EXPORT` is k6's built-in env var for writing the self-contained HTML dashboard.
8. Capture stdout+stderr, append to ring buffer (10k line cap; evict oldest when full, set `truncated = true`), broadcast to SSE clients.
9. On `subprocess.on('error')` or `subprocess.on('close')`: record `exitCode`; write `metaOut`; broadcast `event: done`; set `isRunning = false`.

### Meta sidecar (`<base>-<ts>.meta.json`)

Written after every run (clean exit, stop, or crash):

```json
{
  "runId": "<uuid>",
  "script": "payments/refund.js",
  "startedAt": "2026-06-22T05:08:12.000Z",
  "exitCode": 0,
  "thresholdsFailed": false
}
```

`thresholdsFailed` = `exitCode !== 0` (k6 exits non-zero when thresholds fail).

If the run was forcibly killed (SIGKILL path), `exitCode` will be non-zero and no HTML report is generated (k6 doesn't flush HTML on SIGKILL). The sidebar shows `"(no report)"` for runs where `meta.json` exists but `.html` does not.

### SSE protocol

```
data: <buffered line>\n\n                 — ring buffer replay on connect (all existing lines)
data: <live line>\n\n                     — each new stdout/stderr line
: ping\n\n                                — every 15s
event: done\ndata: {"exitCode": N}\n\n    — on subprocess exit
event: error\ndata: {"message": "..."}\n\n — on spawn failure
```

**SSE implementation requirements:**
- `res.setHeader('Content-Type', 'text/event-stream')`
- `res.setHeader('X-Accel-Buffering', 'no')` — disables nginx proxy buffering
- `res.setHeader('Cache-Control', 'no-cache')`
- Call `res.flushHeaders()` immediately after headers are set
- Disable Express compression on the SSE route
- Cap concurrent SSE clients at **5**; if a 6th connects, drop the oldest client

Client disconnect does NOT abort the run. Output continues buffering.

### Stop sequence

`status = 'stopping'` → `subprocess.kill('SIGTERM')` → wait 5s → `subprocess.kill('SIGKILL')` if still alive → clear state. Idempotent if not running.

### Graceful shutdown

`process.on('SIGTERM'/'SIGINT')` → stop subprocess if running → `process.exit(0)`.

---

## web-ui Service (`web-ui/`)

### server.js responsibilities

- Serves `public/` static files (Monaco editor).
- Script CRUD and directory management over the `/tests/` tree.
- Reports tree listing from `tests/reports/`.
- Serves `tests/reports/` as static at `/reports/*` with security headers.
- Proxies all run/stop/status/output/stream calls to `http://k6:8080`.
- No Dockerode. No Docker socket.
- Body size limit: **256 KB** on all request bodies.
- CSRF guard: `X-Requested-With: XMLHttpRequest` required on all POST/PUT/DELETE; return `403` if absent.
- CSP on all responses: `Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-eval'; style-src 'self' 'unsafe-inline'`
- Additional headers on `/reports/*` static responses: `Content-Security-Policy: sandbox`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`

### web-ui Backend API

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | `{ok: true}` |
| `GET` | `/api/tree` | Full script tree rooted at `/tests/`, excluding `reports/` subdir |
| `GET` | `/api/scripts/*path` | Read file content (`text/plain`) |
| `PUT` | `/api/scripts/*path` | Write file; creates parent dirs as needed |
| `DELETE` | `/api/scripts/*path` | Delete file or directory recursively; 409 if script is running (checks `/api/status` proxy) |
| `PUT` | `/api/dirs/*path` | Create directory (and parents) |
| `GET` | `/api/reports` | Report tree rooted at `tests/reports/` (HTML files only, with sibling JSON/meta URLs) |
| `GET` | `/reports/*` | Serve raw HTML report (static, with security headers) |
| `POST` | `/api/run` | Proxy → k6:8080/run |
| `POST` | `/api/stop` | Proxy → k6:8080/stop |
| `GET` | `/api/status` | Proxy → k6:8080/status |
| `GET` | `/api/output` | Proxy → k6:8080/output |
| `GET` | `/api/stream` | Proxy SSE → k6:8080/stream |

### Path validation

Applied to all `*path` parameters at the web-ui layer (and mirrored at the k6 runner layer):

- Each **directory segment** must match: `SEGMENT = /^[a-zA-Z0-9_-]+$/`
- The **final segment** of a script path must match: `SCRIPT_FILE = /^[a-zA-Z0-9_-]+\.js$/`
- The **final segment** of a directory path must match: `SEGMENT = /^[a-zA-Z0-9_-]+$/`
- Resolved absolute path must start with the scripts base dir (`/tests/`, never `..`)
- Maximum **5 directory levels** deep; violation → `400 {error: "too_deep", message: "Maximum directory depth is 5 levels"}`
- Any other violation → `400 {error: "invalid_path"}`

### Tree response shape

```json
{
  "type": "dir",
  "name": "tests",
  "children": [
    {
      "type": "dir",
      "name": "payments",
      "children": [
        { "type": "file", "name": "refund.js", "path": "payments/refund.js" }
      ]
    },
    { "type": "file", "name": "healthz.js", "path": "healthz.js" }
  ]
}
```

`GET /api/reports` returns the same shape, listing only `.html` files. Each file node also includes:
- `"htmlUrl": "/reports/<path>.html"`
- `"jsonUrl": "/reports/<path>.json"` (may 404 if run was stopped before json flush)
- `"metaUrl": "/reports/<path>.meta.json"`
- `"label"` — human-readable timestamp, e.g. `"Jun 22, 14:08"` (parsed from filename UTC timestamp)

---

## Frontend (`public/index.html`)

### Layout

```
┌──────────────────────────────────────────────────────────┐
│ k6 Studio   payments/refund.js • Unsaved          [?]    │
│ [Save] | [▶ Run] [■ Stop] [Dashboard ↗]                  │
├─────────────────┬────────────────────────────────────────┤
│ Scripts                                                   │
│ [+ Script] [+ Folder]                                    │
│  📁 payments ▼  │   Monaco Editor                        │
│    📄 refund.js ×│   (aria-label="Script editor.         │
│  📄 healthz.js × │    Press F1 for command palette.")    │
├─────────────────┤                                        │
│ Reports         │                                        │
│  📁 payments ▼  │                                        │
│    📄 Jun 22, 14:08 ↗│                                   │
│  📄 Jun 22, 13:40 ↗  ├────────────────────────────────  │
│                 │ Output  [Clear]      ● Running         │
│                 │ > running 10 VUs...                    │
└─────────────────┴───────────────────────────────────────┘
```

- `[?]` button has `aria-label="Keyboard shortcuts"`.
- `×` delete buttons have `aria-label="Delete <name>"`.
- `📁` and `📄` emoji have `aria-hidden="true"`.
- Status badge shows text (`Running` / `Stopping` / `Idle`) plus color — never color-only.
- `[Dashboard ↗]` button: when no test is running, tooltip = `"Dashboard is only active while a test is running"`.
- Report sidebar entries: visible label is `"Jun 22, 14:08"`; full filename in `title` attribute; `aria-label="Open <filename> in new tab"`.
- `role="status"` on toast container.
- `aria-live="assertive"` region (visually hidden) for state change announcements only (run started, run stopped, error). Output panel has `aria-live="off"`.
- Editor container: `aria-label="Script editor. Press F1 for command palette."`.

Monaco loads via AMD loader:
```html
<script src="./monaco-editor/vs/loader.js"></script>
<script>
  require.config({ paths: { vs: './monaco-editor/vs' } });
  require(['vs/editor/editor.main'], () => { ... });
</script>
```

### Sidebar keyboard model

The script and reports trees use a **roving tabindex** pattern:
- One tree item in the tabindex at a time (`tabindex="0"`); all others `tabindex="-1"`.
- `ArrowDown` / `ArrowUp` — move focus to next/previous visible item.
- `ArrowRight` — expand collapsed folder; if already open, move to first child.
- `ArrowLeft` — collapse expanded folder; if already collapsed, move to parent.
- `Enter` or `Space` — activate (open file in editor, or open report in new tab).
- `Delete` — trigger delete confirmation for focused item.
- Focus on `×` delete button via `Tab` within each row; `×` is focusable but outside roving tabindex.

### Script tree behaviour

- `GET /api/tree` on load; re-fetched after any CRUD.
- Folders collapsible; state in `localStorage` keyed by path.
- Click file → load into editor; dirty-check modal if unsaved (autofocus `[Save & Switch]`).
- `×` on file → delete confirmation modal; focus on `[Cancel]`; on close return focus to trigger.
- `×` on folder → confirmation: `"Delete folder '<name>/' and all its contents?"`; focus `[Cancel]`; on close return focus to trigger.
- `[+ Script]` → modal: path input → creates file with boilerplate → reloads tree.
- `[+ Folder]` → modal: path input → creates directory → reloads tree.

### Reports tree behaviour

- `GET /api/reports` on load; re-fetched after each run completes.
- Same collapsible tree as scripts; sorted newest-first within each directory.
- Visible label: human-readable `"Jun 22, 14:08"`; `title` = full filename.
- If `meta.json` exists but `.html` does not (SIGKILL stop): shows `"(no report)"` — not clickable.
- Click report entry → `window.open(htmlUrl, '_blank', 'noopener')`.

### Run button state machine

```
idle       → [Run clicked]    → starting… (Run disabled, Stop enabled)
starting…  → SSE opens        → running
running    → event:done       → idle      (Run re-enabled, reports refreshed)
running    → event:error      → idle
running    → [Stop clicked]   → stopping… (Stop disabled while stopping)
stopping…  → event:done       → idle
```

- On page load: `GET /api/status` → if `status !== 'idle'` → disable Run immediately.
- Poll `GET /api/status` every 2s while not idle (handles browser refresh mid-run).
- Run button tooltip while disabled: `"A test is already running"`.
- `POST /api/run` returns `409` → toast (`role="status"`): `"A test is already running"`.

### Keyboard shortcuts

| Shortcut | Action |
|---|---|
| `Cmd/Ctrl+S` | Save current script |
| `Cmd/Ctrl+Enter` | Run current script |
| `Escape` | Close modal / stop run prompt |
| `F1` (in editor) | Monaco command palette |

### New script boilerplate

```javascript
import http from 'k6/http';
import { check, sleep } from 'k6';

const TARGET_URL = __ENV.K6_TARGET_URL || 'http://host.docker.internal:8084/healthz';

export const options = {
  vus: 10,
  duration: '30s',
  thresholds: {
    http_req_duration: ['p(95)<500'],
    http_req_failed: ['rate<0.01'],
    http_reqs: ['rate>0'],
  },
};

export default function () {
  const res = http.get(TARGET_URL);
  check(res, {
    'status is 200': (r) => r.status === 200,
    'response time < 1s': (r) => r.timings.duration < 1000,
  });
  sleep(1);
}
```

`handleSummary` is NOT in the boilerplate — the JSON metrics file is written by the runner via k6's `--out json=<file>` CLI flag.

---

## Report file naming

| Script | HTML report | JSON report | Meta sidecar |
|---|---|---|---|
| `healthz.js` | `tests/reports/healthz-<ts>.html` | `tests/reports/healthz-<ts>.json` | `tests/reports/healthz-<ts>.meta.json` |
| `payments/refund.js` | `tests/reports/payments/refund-<ts>.html` | `tests/reports/payments/refund-<ts>.json` | `tests/reports/payments/refund-<ts>.meta.json` |

Timestamp `<ts>`: `YYYYMMDDTHHmmss` in **UTC**.

Report retention: no automatic cleanup. Manual: `rm -rf tests/reports/`. Auto-retention (`REPORT_RETENTION_DAYS`) is deferred to v2.

---

## Error handling

| Scenario | Behaviour |
|---|---|
| `POST /run` while running | k6 returns `409`; web-ui forwards; UI toast: `"A test is already running"` |
| Script not found | `404`; output panel: `"Script not found"` |
| k6 service unreachable | `503`; output panel: `"k6 runner unavailable — is the k6 service healthy?"` |
| Spawn failure | SSE `event: error`; output panel shows message |
| Threshold failure | Exit code non-zero; `event: done {exitCode: N}`; status badge shows `Stopped` in red |
| Path traversal | `400 {error: "invalid_path"}` |
| Path too deep (>5 levels) | `400 {error: "too_deep", message: "Maximum directory depth is 5 levels"}` |
| DELETE dir containing running script | web-ui checks `/api/status`; `409 {error: "script_running"}` |
| CSRF guard violation | `403 {error: "forbidden"}` — missing `X-Requested-With` header |
| Body too large | `413 {error: "payload_too_large"}` — body exceeds 256 KB |
| k6 crash mid-run | `on('error')` / `on('close')` resets `isRunning`; `event: done {exitCode: 1}` broadcast |
| Run stopped via SIGKILL (timeout) | No HTML report; sidebar shows `"(no report)"` for that entry |

---

## .env.example

```
# Target URL injected into k6 scripts as K6_TARGET_URL env var.
# Override this with the actual service you want to load-test.
# Example: http://host.docker.internal:8084/healthz
K6_TARGET_URL=http://host.docker.internal:8084/healthz

# Note: k6 container runs in UTC. Timestamps in report filenames are UTC.
# Note: extra_hosts (host.docker.internal) is configured in docker-compose.yml directly.
```

---

## Success criteria

- `mkdir -p tests/reports && docker compose up --build` → both services healthy; `http://localhost:3000` shows UI with Monaco editor.
- Create directory `payments/` and script `payments/refund.js` via UI → appears in sidebar tree.
- Run a script → output streams live; Run button disabled; Stop works; status badge shows `Running`.
- Run completes → `<base>-<ts>.html`, `<base>-<ts>.json`, and `<base>-<ts>.meta.json` appear in `tests/reports/<path>/`; report entry in sidebar shows human-readable timestamp; click opens HTML in new tab.
- `localhost:5665` dashboard accessible while test runs.
- Browser refresh mid-run → Run button disabled; ring buffer replayed from SSE reconnect.
- Second `POST /api/run` while running → 409 → toast shown.
- `docker compose restart k6` → new run works cleanly.
- Delete button on each sidebar item has accessible label; keyboard navigation moves through tree with arrow keys.
- Missing `X-Requested-With` header on PUT/POST/DELETE → 403.
- Path with `..` or invalid characters → 400.
- Script path with 6+ directory levels → 400 with `"too_deep"` error.
