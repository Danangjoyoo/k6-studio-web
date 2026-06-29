# Live Dashboard Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Prevent the k6 live dashboard iframe from staying blank when opened immediately after starting a run.

**Architecture:** Keep mounting the iframe immediately, but use the dashboard `/events` SSE endpoint as the readiness signal instead of the static `/ui/` HTML. If the first event readiness check fails and a later check succeeds, remount the iframe exactly once so k6's dashboard React app creates a fresh EventSource connection. Normalize Docker dashboard routing paths so `/k6/api/dashboard/...` upgrade traffic maps to the same target as `/api/dashboard/...`.

**Tech Stack:** Next.js App Router, React 19, Jest/jsdom, Node CommonJS helper tests, Docker Compose.

---

### Task 1: Live Dashboard Event Readiness

**Files:**
- Modify: `src/components/tabs/LiveDashboardTab.tsx`
- Modify: `src/components/tabs/__tests__/LiveDashboardTab.test.tsx`

- [x] **Step 1: Write failing tests**

Add tests proving the component probes `/events`, remounts once after delayed event readiness, and stops remounting after readiness.

```tsx
it("probes the run events stream before remounting a previously blank iframe", async () => {
  const ready = eventStreamResponse();
  (global.fetch as jest.Mock)
    .mockResolvedValueOnce({ ok: false })
    .mockResolvedValueOnce(ready);

  render(
    <LiveDashboardTab
      scriptName="smoke.js"
      isActiveRun={true}
      runEpoch={1}
      runId="run_1"
    />
  );

  const first = screen.getByTitle("k6 Live Dashboard");
  expect(global.fetch).toHaveBeenCalledWith(
    "/k6/api/dashboard/run/run_1/events",
    expect.objectContaining({ cache: "no-store" })
  );

  await advanceRetryTimer(2000);

  const second = screen.getByTitle("k6 Live Dashboard");
  expect(second).not.toBe(first);

  await advanceRetryTimer(6000);
  expect(screen.getByTitle("k6 Live Dashboard")).toBe(second);
});
```

- [x] **Step 2: Verify the tests fail**

Run:

```bash
npx jest --runInBand src/components/tabs/__tests__/LiveDashboardTab.test.tsx
```

Expected: FAIL because the component currently probes `/ui/`, not `/events`.

- [x] **Step 3: Implement event readiness**

Update `LiveDashboardTab.tsx` so:
- `dashboardSrc(runId)` remains the iframe source.
- `dashboardEventsSrc(runId)` returns `/k6/api/dashboard/events` or `/k6/api/dashboard/run/<id>/events`.
- The readiness probe fetches `dashboardEventsSrc(runId)`.
- A successful probe requires an OK response and at least one readable chunk from the SSE body.
- If readiness was delayed, bump `retryKey` once to remount the iframe.
- After readiness succeeds, stop probing so the iframe does not blink during the run.

- [x] **Step 4: Verify focused tests pass**

Run:

```bash
npx jest --runInBand src/components/tabs/__tests__/LiveDashboardTab.test.tsx
```

Expected: PASS.

### Task 2: Docker Dashboard Route Normalization

**Files:**
- Modify: `scripts/docker-dashboard-routing.cjs`
- Modify: `scripts/__tests__/docker-dashboard-routing.test.js`

- [x] **Step 1: Write failing tests**

Add assertions that `/k6/api/dashboard/run/<id>/ws` resolves and strips to `/ws`, and `/k6/api/dashboard/ws` falls back to the base dashboard port.

```js
expect(
  resolveDashboardTarget("/k6/api/dashboard/run/run_1790000000000_4_3/ws", [
    { id: "run_1790000000000_4_3", dashboardPort: 5668 },
  ])
).toBe("http://127.0.0.1:5668");
expect(
  stripDashboardPrefix("/k6/api/dashboard/run/run_1790000000000_4_3/ws?x=1")
).toBe("/ws?x=1");
expect(stripDashboardPrefix("/k6/api/dashboard/ws")).toBe("/ws");
```

- [x] **Step 2: Verify the tests fail**

Run:

```bash
npx jest --runInBand scripts/__tests__/docker-dashboard-routing.test.js
```

Expected: FAIL because `/k6/api/dashboard` is not currently recognized.

- [x] **Step 3: Implement normalization**

Add a fixed `APP_BASE_PATH = "/k6"` in `scripts/docker-dashboard-routing.cjs` and normalize parsed pathnames before extracting run ids or stripping the dashboard prefix.

- [x] **Step 4: Verify focused tests pass**

Run:

```bash
npx jest --runInBand scripts/__tests__/docker-dashboard-routing.test.js
```

Expected: PASS.

### Task 3: Full Verification

**Files:**
- No additional production files.

- [x] **Step 1: Run focused tests**

```bash
npx jest --runInBand src/components/tabs/__tests__/LiveDashboardTab.test.tsx scripts/__tests__/docker-dashboard-routing.test.js
```

- [x] **Step 2: Run full test suite**

```bash
npx jest --runInBand
```

- [x] **Step 3: Run TypeScript and lint**

```bash
npx tsc --noEmit
npm run lint
```

- [x] **Step 4: Run production build**

```bash
npm run build
```

- [x] **Step 5: Run Docker Compose build/start**

```bash
docker compose up --build -d
```

- [x] **Step 6: Verify base path still responds**

```bash
curl -i -sS http://localhost:3000/ | sed -n '1,12p'
curl -i -sS http://localhost:3000/k6 | sed -n '1,12p'
curl -i -sS http://localhost:3000/k6/api/run/status | sed -n '1,12p'
```

Expected: `/` redirects to `/k6`, `/k6` returns `200`, and `/k6/api/run/status` returns `200` JSON.
