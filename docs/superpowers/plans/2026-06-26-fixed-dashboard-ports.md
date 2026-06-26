# Fixed Dashboard Ports Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove `K6_DASHBOARD_PORT` configuration and allocate k6 dashboard ports from fixed internal runner slots `5665..5684`.

**Architecture:** `run-lock` owns runner capacity and fixed port allocation. `k6` receives an explicit dashboard port from the acquired run, while its default remains the fixed base for direct unit use. Docker config exposes the fixed range and the Docker WebSocket proxy resolves run-scoped dashboard URLs instead of hard-coding port `5665`.

**Tech Stack:** Next.js App Router, React 19, TypeScript strict mode, Node HTTP proxy, Docker Compose, Jest.

---

### Task 1: Fixed Runner Slot Bounds

**Files:**
- Modify: `src/lib/run-lock.ts`
- Modify: `src/lib/__tests__/run-lock.test.ts`

- [ ] Write failing tests that `TOTAL_RUNNERS=25` clamps to `20`, runner index `19` gets dashboard port `5684`, and `K6_DASHBOARD_PORT` does not change dashboard port assignment.
- [ ] Run `npx jest src/lib/__tests__/run-lock.test.ts --runInBand` and confirm the new tests fail.
- [ ] Add fixed constants for base port `5665`, max runners `20`, and last port `5684`; clamp `getRunnerCapacity()` to max 20; remove `K6_DASHBOARD_PORT` parsing.
- [ ] Run `npx jest src/lib/__tests__/run-lock.test.ts --runInBand` and confirm it passes.

### Task 2: k6 Env Default

**Files:**
- Modify: `src/lib/k6.ts`
- Modify: `src/lib/__tests__/k6.test.ts`

- [ ] Write a failing test that setting `process.env.K6_DASHBOARD_PORT = "5999"` does not change `getK6RunEnv("/tmp/report.html").K6_WEB_DASHBOARD_PORT`.
- [ ] Run `npx jest src/lib/__tests__/k6.test.ts --runInBand` and confirm failure.
- [ ] Change `getK6RunEnv()` to default to fixed port `5665` unless an explicit `dashboardPort` argument is passed.
- [ ] Run `npx jest src/lib/__tests__/k6.test.ts --runInBand` and confirm it passes.

### Task 3: Runtime Config Cleanup

**Files:**
- Modify: `.env.example`
- Modify: `.env.local`
- Modify: `docker-compose.yml`
- Modify: `Dockerfile`
- Modify: `src/lib/__tests__/runtime-config.test.ts`

- [ ] Write failing tests that env templates and Compose do not contain `K6_DASHBOARD_PORT`, Compose publishes `5665-5684:5665-5684`, Compose still passes `TOTAL_RUNNERS`, and Dockerfile exposes `5665-5684`.
- [ ] Run `npx jest src/lib/__tests__/runtime-config.test.ts --runInBand` and confirm failure.
- [ ] Remove `K6_DASHBOARD_PORT` from env templates and Compose; change Compose port publication to `5665-5684:5665-5684`; change Dockerfile `EXPOSE` to `3000 5665-5684`.
- [ ] Run `npx jest src/lib/__tests__/runtime-config.test.ts --runInBand` and confirm it passes.

### Task 4: Docker Dashboard WebSocket Routing

**Files:**
- Modify: `scripts/docker-server.mjs`
- Create: `scripts/__tests__/docker-server.test.js`
- Modify: `jest.config.ts` if needed to include the script test.

- [ ] Write failing tests for exported helper functions that parse `/api/dashboard/run/<runId>/ws` and resolve the matching `dashboardPort`, while unscoped dashboard URLs fall back to `5665`.
- [ ] Run `npx jest scripts/__tests__/docker-server.test.js --runInBand` and confirm failure.
- [ ] Refactor `scripts/docker-server.mjs` so helper functions are exported under test and the upgrade handler routes dashboard WebSocket upgrades by run id to the matching fixed port.
- [ ] Run `npx jest scripts/__tests__/docker-server.test.js --runInBand` and confirm it passes.

### Task 5: Focused Integration Checks

**Files:**
- Modify only if tests expose defects.

- [ ] Run `npx jest src/lib/__tests__/run-lock.test.ts src/lib/__tests__/k6.test.ts src/lib/__tests__/runtime-config.test.ts src/app/api/run/__tests__/route.test.ts 'src/app/api/dashboard/[[...path]]/__tests__/route.test.ts' scripts/__tests__/docker-server.test.js --runInBand`.
- [ ] Fix any failures with test-first changes.

### Task 6: Final Verification

**Files:**
- Modify only if verification exposes defects.

- [ ] Run `npx jest --runInBand`.
- [ ] Run `npx tsc --noEmit`.
- [ ] Run `npm run lint`.
- [ ] Run `npm run build`.
- [ ] Run `docker compose up --build -d`.
- [ ] Run `curl -sS http://localhost:3000/api/run/status` and confirm the response is valid JSON.
