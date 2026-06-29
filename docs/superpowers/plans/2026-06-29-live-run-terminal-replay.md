# Live Run Terminal Replay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let any tab viewing a currently running script see the live k6 terminal output, even if that tab did not call `/api/run`.

**Architecture:** Keep `/api/run` as the execution stream for the caller, and add an in-process run-output broker keyed by `runId`. The broker stores bounded replay messages and broadcasts new messages to a new replay SSE endpoint. `ScriptWorkspaceContext` subscribes to the replay stream when the selected script matches an active run it did not start locally, then writes those messages into the same per-script session state used by the terminal.

**Tech Stack:** Next.js App Router route handlers, React context, TypeScript, Jest, Server-Sent Events.

---

### Task 1: Server Replay Buffer

**Files:**
- Create: `src/lib/run-output.ts`
- Test: `src/lib/__tests__/run-output.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import {
  appendRunOutput,
  closeRunOutput,
  getRunOutputSnapshot,
  subscribeRunOutput,
  _resetRunOutput,
} from "@/lib/run-output";

describe("run-output", () => {
  beforeEach(() => _resetRunOutput());

  it("replays existing output and broadcasts future output", () => {
    const received: unknown[] = [];

    appendRunOutput("run_1", { line: "first" });
    const unsubscribe = subscribeRunOutput("run_1", (message) => {
      received.push(message);
    });
    appendRunOutput("run_1", { line: "second" });
    unsubscribe();
    appendRunOutput("run_1", { line: "third" });

    expect(getRunOutputSnapshot("run_1")).toEqual([
      { line: "first" },
      { line: "second" },
      { line: "third" },
    ]);
    expect(received).toEqual([{ line: "second" }]);
  });

  it("clears output after a run is closed", () => {
    appendRunOutput("run_1", { line: "first" });
    closeRunOutput("run_1");
    expect(getRunOutputSnapshot("run_1")).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/lib/__tests__/run-output.test.ts --runInBand`
Expected: FAIL because `@/lib/run-output` does not exist.

- [ ] **Step 3: Write minimal implementation**

Create a module with `appendRunOutput`, `subscribeRunOutput`, `getRunOutputSnapshot`, `closeRunOutput`, and `_resetRunOutput`. Store at most 1000 messages per run and call subscribers synchronously.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/lib/__tests__/run-output.test.ts --runInBand`
Expected: PASS.

### Task 2: Replay SSE Endpoint

**Files:**
- Create: `src/app/api/run/output/[runId]/route.ts`
- Test: `src/app/api/run/output/[runId]/__tests__/route.test.ts`
- Modify: `src/app/api/run/route.ts`

- [ ] **Step 1: Write the failing endpoint test**

The test imports `GET` from the new route, seeds `appendRunOutput("run_1", { line: "first" })`, calls `GET(new Request("http://localhost/api/run/output/run_1"), { params: Promise.resolve({ runId: "run_1" }) })`, reads the first SSE chunk, and expects `data: {"line":"first"}`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest --runTestsByPath 'src/app/api/run/output/[runId]/__tests__/route.test.ts' --runInBand`
Expected: FAIL because the route does not exist.

- [ ] **Step 3: Implement endpoint and publish events from `/api/run`**

Add `GET` that replays `getRunOutputSnapshot(runId)`, subscribes to future messages, and closes on `done`. In `/api/run`, wrap `send()` so every object sent to the caller is also appended to `appendRunOutput(activeRun.id, obj)`. Call `closeRunOutput(activeRun.id)` in the final cleanup after the final event is sent.

- [ ] **Step 4: Run endpoint and run-route tests**

Run:
- `npx jest --runTestsByPath 'src/app/api/run/output/[runId]/__tests__/route.test.ts' --runInBand`
- `npx jest src/app/api/run/__tests__/route.test.ts --runInBand`

Expected: PASS.

### Task 3: Client Auto-Subscription

**Files:**
- Modify: `src/contexts/ScriptWorkspaceContext.tsx`
- Test: `src/contexts/__tests__/ScriptWorkspaceContext.test.tsx`

- [ ] **Step 1: Write the failing context test**

The test mocks `/api/run/status` returning one active run and `/api/run/output/run_1` returning SSE frames. It renders `ScriptWorkspaceProvider`, waits for `getSession("a.js").lines` to contain the replayed line, then verifies `isRunning` clears after a `done` frame.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/contexts/__tests__/ScriptWorkspaceContext.test.tsx --runInBand`
Expected: FAIL because the context never fetches `/api/run/output/run_1`.

- [ ] **Step 3: Implement subscription**

Track output stream controllers by `run.id`. After `globalRuns` or the selected file changes, subscribe when the selected script matches an active run and there is no local `/api/run` controller for its namespace/script. Parse replay SSE frames with the same message handler used by `runScript`. Abort and remove subscriptions when the selected file changes or the selected run is no longer active.

- [ ] **Step 4: Run context test**

Run: `npx jest src/contexts/__tests__/ScriptWorkspaceContext.test.tsx --runInBand`
Expected: PASS.

### Task 4: Verification And Commit

**Files:**
- All changed files.

- [ ] **Step 1: Run focused tests**

Run:
- `npx jest src/lib/__tests__/run-output.test.ts --runInBand`
- `npx jest --runTestsByPath 'src/app/api/run/output/[runId]/__tests__/route.test.ts' --runInBand`
- `npx jest src/app/api/run/__tests__/route.test.ts --runInBand`
- `npx jest src/contexts/__tests__/ScriptWorkspaceContext.test.tsx --runInBand`

Expected: PASS.

- [ ] **Step 2: Run full verification**

Run:
- `npx jest --runInBand`
- `npm run lint`
- `npx tsc --noEmit`
- `npm run build`

Expected: all exit 0.

- [ ] **Step 3: Commit once**

```bash
git add docs/superpowers/plans/2026-06-29-live-run-terminal-replay.md src/lib/run-output.ts src/lib/__tests__/run-output.test.ts src/app/api/run/output/[runId]/route.ts src/app/api/run/output/[runId]/__tests__/route.test.ts src/app/api/run/route.ts src/contexts/ScriptWorkspaceContext.tsx src/contexts/__tests__/ScriptWorkspaceContext.test.tsx
git commit -m "fix: replay live run output across tabs"
```
