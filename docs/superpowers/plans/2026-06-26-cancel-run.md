# Cancel Run Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a confirmed Cancel run action that stops the selected active k6 process and prevents cancelled runs from being recorded in test history.

**Architecture:** Store an internal cancellation handler per active `runId` in `src/lib/run-lock.ts`. Expose `POST /api/run/cancel` to call that handler, have `/api/run` register its `AbortController`, and have the client call cancellation through `ScriptWorkspaceContext`.

**Tech Stack:** Next.js App Router route handlers, React 19, TypeScript, Jest, existing Base UI dialog primitives.

---

### Task 1: Run Registry Cancellation

**Files:**
- Modify: `src/lib/run-lock.ts`
- Test: `src/lib/__tests__/run-lock.test.ts`

- [ ] **Step 1: Write failing tests**

Add tests that import `cancelRun` and `registerCancelHandler`, acquire a run, register a handler, call `cancelRun(run.id)`, assert the handler ran, then release the run and assert cancellation is no longer available.

- [ ] **Step 2: Run tests to verify RED**

Run: `npx jest src/lib/__tests__/run-lock.test.ts --runInBand`

Expected: FAIL because `cancelRun` and `registerCancelHandler` are not exported.

- [ ] **Step 3: Implement registry**

Add an internal `cancelHandlers` map, export `registerCancelHandler(runId, handler)` and `cancelRun(runId)`, and clear handlers in `release()` and `_reset()`.

- [ ] **Step 4: Run tests to verify GREEN**

Run: `npx jest src/lib/__tests__/run-lock.test.ts --runInBand`

Expected: PASS.

### Task 2: Cancel API And Report Skipping

**Files:**
- Modify: `src/app/api/run/route.ts`
- Create: `src/app/api/run/cancel/route.ts`
- Test: `src/app/api/run/__tests__/route.test.ts`
- Test: `src/app/api/run/__tests__/cancel-route.test.ts`

- [ ] **Step 1: Write failing tests**

Add route tests proving:
- `POST /api/run/cancel` returns `400` without `runId`.
- `POST /api/run/cancel` returns `404` for an unknown `runId`.
- cancelling a known run calls the registered handler and returns `{ cancelled: true }`.
- an aborted `/api/run` stream emits `done: true`, `cancelled: true`, `exitCode: null`, `reportName: null`, and does not call `putObject`.

- [ ] **Step 2: Run tests to verify RED**

Run: `npx jest src/app/api/run/__tests__/route.test.ts src/app/api/run/__tests__/cancel-route.test.ts --runInBand`

Expected: FAIL because the cancel endpoint and cancelled SSE behavior do not exist.

- [ ] **Step 3: Implement API behavior**

In `/api/run`, register the run’s `AbortController` with the run registry. Track `cancelled`, skip report upload after cancellation, and emit the cancelled `done` frame. In `/api/run/cancel`, parse `runId`, call `cancelRun(runId)`, and return `400`, `404`, or `200` as appropriate.

- [ ] **Step 4: Run tests to verify GREEN**

Run: `npx jest src/app/api/run/__tests__/route.test.ts src/app/api/run/__tests__/cancel-route.test.ts --runInBand`

Expected: PASS.

### Task 3: Client Context Cancellation

**Files:**
- Modify: `src/contexts/ScriptWorkspaceContext.tsx`
- Test: `src/contexts/__tests__/ScriptWorkspaceContext.test.tsx`

- [ ] **Step 1: Write failing tests**

Add tests proving `cancelRun(runId)` posts to `/api/run/cancel`, appends a cancellation line to the matching script session, and handles failed cancellation with an error line.

- [ ] **Step 2: Run tests to verify RED**

Run: `npx jest src/contexts/__tests__/ScriptWorkspaceContext.test.tsx --runInBand`

Expected: FAIL because the context does not expose `cancelRun`.

- [ ] **Step 3: Implement context method**

Add `cancelRun(runId: string) => Promise<void>` to `ScriptWorkspaceValue`. Resolve the active run from `globalRuns`, post `{ runId }`, and update the matching namespaced session lines.

- [ ] **Step 4: Run tests to verify GREEN**

Run: `npx jest src/contexts/__tests__/ScriptWorkspaceContext.test.tsx --runInBand`

Expected: PASS.

### Task 4: Editor Cancel Button And Confirmation

**Files:**
- Modify: `src/components/tabs/EditorTab.tsx`
- Test: `src/components/tabs/__tests__/EditorTab.test.tsx`

- [ ] **Step 1: Write failing tests**

Add tests proving:
- `Cancel run` is disabled when selected script is idle.
- `Cancel run` is enabled when selected script has an active run.
- clicking `Cancel run` opens a confirmation dialog.
- confirming calls `cancelRun(activeRun.id)`.

- [ ] **Step 2: Run tests to verify RED**

Run: `npx jest src/components/tabs/__tests__/EditorTab.test.tsx --runInBand`

Expected: FAIL because the button and confirmation do not exist.

- [ ] **Step 3: Implement UI**

Add a destructive-outline `Cancel run` button with an `OctagonX` icon. Use existing dialog primitives for confirmation text explaining cancelled runs are not recorded in history. Disable the button unless the selected script has an active run in the current namespace.

- [ ] **Step 4: Run tests to verify GREEN**

Run: `npx jest src/components/tabs/__tests__/EditorTab.test.tsx --runInBand`

Expected: PASS.

### Task 5: Full Verification

**Files:**
- Verify all touched files.

- [ ] **Step 1: Focused tests**

Run the four focused Jest commands from Tasks 1-4.

- [ ] **Step 2: Broad checks**

Run:
- `npx jest --runInBand`
- `npx tsc --noEmit`
- `npm run lint`
- `npm run build`
- `git diff --check`

Expected: all exit 0.
