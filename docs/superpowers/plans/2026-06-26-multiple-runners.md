# Multiple Runners Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Support concurrent k6 runs up to `TOTAL_RUNNERS`, with per-run dashboard ports and a clickable active-runner header list.

**Architecture:** Replace the single in-memory lock with a bounded runner-slot registry. Pass each acquired slot's dashboard port into k6 and into the dashboard proxy, expose active runs through status polling, and update UI gates to use the run list.

**Tech Stack:** Next.js App Router route handlers, React 19, TypeScript strict mode, MinIO, k6, Jest, React Testing Library.

---

### Task 1: Runner Slot Registry

**Files:**
- Modify: `src/lib/run-lock.ts`
- Modify: `src/lib/__tests__/run-lock.test.ts`

- [ ] Write failing tests for `TOTAL_RUNNERS`, concurrent acquisitions, duplicate namespace/script rejection, release by id, and `runs` status shape.
- [ ] Run `npx jest src/lib/__tests__/run-lock.test.ts --runInBand` and verify failure.
- [ ] Implement `ActiveRun`, `getRunnerCapacity`, `tryAcquire` returning `ActiveRun | null`, `release(runId?)`, `getRunById`, `getStatus`.
- [ ] Run focused tests and verify pass.
- [ ] Commit with `git commit -m "feat: add runner slot registry"`.

### Task 2: Per-Run Dashboard Ports

**Files:**
- Modify: `src/lib/k6.ts`
- Modify: `src/lib/__tests__/k6.test.ts`

- [ ] Write failing tests proving `getK6RunEnv(reportPath, 5667)` sets `K6_WEB_DASHBOARD_PORT` to `5667` and default behavior still uses env/base port.
- [ ] Run `npx jest src/lib/__tests__/k6.test.ts --runInBand` and verify failure.
- [ ] Add optional `dashboardPort?: number` to `getK6RunEnv` and `runK6`.
- [ ] Run focused tests and verify pass.
- [ ] Commit with `git commit -m "feat: pass dashboard port per k6 run"`.

### Task 3: Run API Capacity

**Files:**
- Modify: `src/app/api/run/route.ts`
- Modify: `src/app/api/run/__tests__/route.test.ts`

- [ ] Write failing route tests proving two runs can be acquired when `TOTAL_RUNNERS=2`, a third returns `409`, distinct dashboard ports are passed to `runK6`, and completing one run releases only its slot.
- [ ] Run `npx jest src/app/api/run/__tests__/route.test.ts --runInBand` and verify failure.
- [ ] Update `POST /api/run` to use the acquired run record, pass `dashboardPort` into `runK6`, wait for that port, and release by run id.
- [ ] Run focused tests and verify pass.
- [ ] Commit with `git commit -m "feat: allow configured concurrent runs"`.

### Task 4: Dashboard Proxy Run Selection

**Files:**
- Modify: `src/app/api/dashboard/[[...path]]/route.ts`
- Modify: `src/lib/dashboard-proxy.ts`
- Modify: `src/lib/__tests__/dashboard-proxy.test.ts`
- Create: `src/app/api/dashboard/[[...path]]/__tests__/route.test.ts`
- Modify: `src/components/tabs/LiveDashboardTab.tsx`
- Modify: `src/components/tabs/__tests__/LiveDashboardTab.test.tsx`

- [ ] Write failing tests for a `runId` dashboard URL and proxy port selection.
- [ ] Run dashboard proxy and live dashboard focused tests and verify failure.
- [ ] Make the dashboard route resolve `runId` to an active run's `dashboardPort`; fall back to the oldest run or base port.
- [ ] Update `LiveDashboardTab` to accept `runId` and build `/api/dashboard/ui/?runId=<id>&endpoint=/api/dashboard/?runId=<id>`.
- [ ] Run focused tests and verify pass.
- [ ] Commit with `git commit -m "feat: route dashboards by active run"`.

### Task 5: Workspace And Header UI

**Files:**
- Modify: `src/contexts/ScriptWorkspaceContext.tsx`
- Modify: `src/contexts/__tests__/ScriptWorkspaceContext.test.tsx`
- Modify: `src/components/tabs/EditorTab.tsx`
- Modify: `src/components/tabs/__tests__/EditorTab.test.tsx`
- Modify: `src/components/layout/AppHeader.tsx`
- Modify: `src/components/layout/__tests__/AppHeader.test.tsx`
- Modify: `src/components/layout/AppShell.tsx`
- Modify: `src/components/layout/__tests__/AppShell.test.tsx`

- [ ] Write failing tests that status polling stores `runs`, the editor allows another run when capacity remains, disables when full, and the header active-runner button opens a list of active scripts without showing the old separate running-script badge.
- [ ] Run focused tests and verify failure.
- [ ] Update context state to expose `globalRuns` and `runnerCapacity`.
- [ ] Update `EditorTab` gating to use selected-script-running and capacity-full conditions.
- [ ] Update `AppHeader` to remove `runningScript` prop and render a clickable active-runner popover.
- [ ] Update `AppShell` to derive the selected run id and pass active namespace scripts to file explorer.
- [ ] Run focused tests and verify pass.
- [ ] Commit with `git commit -m "feat: show active runner list"`.

### Task 6: Multi-Run Move Protection

**Files:**
- Modify: `src/lib/files-move.ts`
- Modify: `src/lib/__tests__/files-move.test.ts`
- Modify: `src/app/api/files/move/route.ts`
- Modify: `src/app/api/files/move/__tests__/route.test.ts`
- Modify: `src/app/api/files/rename/route.ts`
- Modify: `src/app/api/files/rename/__tests__/route.test.ts`
- Modify: `src/components/file-explorer/FileExplorer.tsx`
- Modify: `src/components/file-explorer/__tests__/FileExplorer.test.tsx`

- [ ] Write failing tests that movement is blocked for any active script in the namespace and not blocked for active scripts in another namespace.
- [ ] Run focused move/rename and file explorer tests and verify failure.
- [ ] Change movement checks from one running script to an array of running scripts.
- [ ] Update move and rename routes to pass all active runs in the target namespace.
- [ ] Update file explorer props to accept `globalRunningScripts`.
- [ ] Run focused tests and verify pass.
- [ ] Commit with `git commit -m "fix: protect all active runner files"`.

### Task 7: Final Verification

**Files:**
- No source edits unless verification exposes defects.

- [ ] Run `npx jest --runInBand`.
- [ ] Run `npx tsc --noEmit`.
- [ ] Run `npm run lint`.
- [ ] Run `npm run build`.
- [ ] Run `docker compose up --build -d`.
- [ ] Run focused Playwright smoke if source checks pass: `PLAYWRIGHT_BASE_URL=http://localhost:3000 npx playwright test e2e/k6-studio.spec.ts --project=chromium -g "history remains accessible after moving a script"`.
