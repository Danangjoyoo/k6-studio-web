# Task 10 Report: Dockerfile + Deployment

**Status:** ✅ Complete  
**Branch:** `feat/k6-studio-web`  
**Base:** `267ddaa` (Task 9)  
**Commit:** `70700b9` — `feat: add production Dockerfile bundling k6 with Next.js standalone`

---

## Deliverables

| File | Action | Notes |
|------|--------|-------|
| `k6-studio-web/Dockerfile` | Created | 3-stage build: deps → builder → runner; bundles k6 v0.51.0 |
| `k6-studio-web/.dockerignore` | Created | Excludes node_modules, .next, env files, docs |
| `k6-studio-web/next.config.ts` | Modified | Added `output: "standalone"` |
| `k6-studio-web/docker-compose.yml` | Modified | Added `K6_BIN: "/usr/local/bin/k6"` |

### Dockerfile extras (beyond brief)

Added `ENV HOSTNAME=0.0.0.0` in the runner stage. Without this, Next.js standalone binds to the container hostname IP instead of all interfaces, making port 3000 unreachable from the host.

---

## Verification Results

### Local build
```
npm run build
✓ Compiled successfully
.next/standalone/server.js — present
```

### Docker image
```
docker build -t k6-studio-web:local .
✓ Build succeeded (node:20-alpine base)

docker run --rm k6-studio-web:local k6 version
k6 v0.51.0 (commit/33d3caa7d1, go1.22.3, linux/amd64)
```

### Full stack (`docker compose up --build -d`)

| Test | Result |
|------|--------|
| `curl http://localhost:3000` | HTTP 200, k6 Studio HTML |
| `curl http://localhost:9000/minio/health/live` | HTTP 200 |
| `POST /api/files` (create script) | `{"name":"docker-test.js"}` |
| `GET /api/files` | Script listed |
| `POST /api/run` (SSE) | `exitCode: 0`, k6 metrics streamed |
| `GET /api/reports` | HTML report uploaded to MinIO |

### k6 run output (excerpt)
```
data: {"line":"default ✓ [ 100% ] 1 VUs  00m00.2s/10m0s  1/1 iters, 1 per VU"}
data: {"done":true,"exitCode":0,"reportName":"docker-test.js-1782276796932.html"}
```

---

## Concerns

1. **HOSTNAME binding** — Required `HOSTNAME=0.0.0.0` fix not in original brief; document for future deployments.
2. **Port conflict** — A local `next dev` process on port 3000 intercepted requests during initial testing; ensure port is free before compose smoke tests.
3. **Platform** — k6 binary is `linux-amd64` only; ARM hosts (Apple Silicon without Rosetta emulation) would need a different k6 tarball.
4. **MinIO persistence** — `minio_data` volume retains scripts/reports across restarts (expected; leftover test files visible in list).

---

## Tear-down

```
docker compose down
```

Stack removed cleanly after verification.
