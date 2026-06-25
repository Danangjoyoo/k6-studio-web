# Live Dashboard Iframe Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Live Dashboard tab mount the k6 dashboard iframe immediately for the selected running script, verify that real dashboard content renders, and improve file explorer navigation with scrolling and search.

**Architecture:** `LiveDashboardTab` controls iframe mounting and retry behavior. `src/lib/k6.ts` controls k6 dashboard environment defaults. `FileExplorer` owns local search and scroll layout for the sidebar. E2E coverage asserts live iframe content instead of iframe presence and verifies file search behavior.

**Tech Stack:** Next.js App Router, React 19, Jest, Testing Library, Playwright, k6 web dashboard.

---

### Task 1: k6 Dashboard Period

**Files:**
- Modify: `src/lib/k6.ts`
- Test: `src/lib/__tests__/k6.test.ts`

- [ ] **Step 1: Write failing tests for dashboard period**

Add these cases near the existing `getK6RunEnv` tests:

```ts
it("getK6RunEnv sets a fast dashboard update period by default", () => {
  const env = getK6RunEnv("/tmp/report.html");
  expect(env.K6_WEB_DASHBOARD_PERIOD).toBe("1s");
});

it("getK6RunEnv respects K6_WEB_DASHBOARD_PERIOD env override", () => {
  process.env.K6_WEB_DASHBOARD_PERIOD = "2s";
  const env = getK6RunEnv("/tmp/report.html");
  expect(env.K6_WEB_DASHBOARD_PERIOD).toBe("2s");
  delete process.env.K6_WEB_DASHBOARD_PERIOD;
});
```

- [ ] **Step 2: Run period tests and verify red**

Run:

```bash
npx jest src/lib/__tests__/k6.test.ts --runInBand
```

Expected: the new default period test fails because `K6_WEB_DASHBOARD_PERIOD` is not set.

- [ ] **Step 3: Implement dashboard period env**

Update `getK6RunEnv()`:

```ts
K6_WEB_DASHBOARD_PERIOD: process.env.K6_WEB_DASHBOARD_PERIOD ?? "1s",
```

- [ ] **Step 4: Run period tests and verify green**

Run:

```bash
npx jest src/lib/__tests__/k6.test.ts --runInBand
```

Expected: all tests in `k6.test.ts` pass.

- [ ] **Step 5: Commit task 1**

```bash
git add src/lib/k6.ts src/lib/__tests__/k6.test.ts
git commit -m "fix: speed up k6 dashboard updates"
```

### Task 2: Immediate Iframe Mount And Retry

**Files:**
- Modify: `src/components/tabs/LiveDashboardTab.tsx`
- Test: `src/components/tabs/__tests__/LiveDashboardTab.test.tsx`

- [ ] **Step 1: Write failing component tests**

Replace the current active-run test with tests that assert immediate mounting and retry:

```ts
it("renders the iframe immediately for the active selected run", () => {
  render(
    <LiveDashboardTab
      scriptName="smoke.js"
      isActiveRun={true}
      runEpoch={1}
    />
  );

  const iframe = screen.getByTitle("k6 Live Dashboard");
  expect(iframe).toBeInTheDocument();
  expect(iframe.getAttribute("src")).toBe("/api/dashboard/ui/?endpoint=/api/dashboard/");
  expect(global.fetch).not.toHaveBeenCalled();
});

it("does not render the iframe when the selected script is not actively running", () => {
  render(
    <LiveDashboardTab
      scriptName="other.js"
      isActiveRun={false}
      runEpoch={1}
    />
  );

  expect(screen.queryByTitle("k6 Live Dashboard")).not.toBeInTheDocument();
  expect(screen.getByText(/dashboard only available during a run/i)).toBeInTheDocument();
});

it("retries the iframe while the run remains active", () => {
  render(
    <LiveDashboardTab
      scriptName="smoke.js"
      isActiveRun={true}
      runEpoch={1}
    />
  );

  const first = screen.getByTitle("k6 Live Dashboard");
  const firstKeyedSrc = first.getAttribute("src");

  jest.advanceTimersByTime(2000);

  const second = screen.getByTitle("k6 Live Dashboard");
  expect(second).toBeInTheDocument();
  expect(second.getAttribute("src")).toBe(firstKeyedSrc);
});
```

If a retry key is exposed through `key` rather than `src`, assert by rerender behavior instead of DOM attributes.

- [ ] **Step 2: Run component tests and verify red**

Run:

```bash
npx jest src/components/tabs/__tests__/LiveDashboardTab.test.tsx --runInBand
```

Expected: the immediate iframe test fails because the component waits for the readiness probe.

- [ ] **Step 3: Implement immediate iframe render**

In `LiveDashboardTab.tsx`:

- Remove `available`, `checking`, `timedOut`, `startedAt`, and the `/api/dashboard/ui/` probe.
- Add `retryKey` state initialized to `0`.
- Reset retry key when `isActiveRun`, `scriptName`, or `runEpoch` changes.
- While active, increment `retryKey` every 2000ms.
- Render the iframe whenever `isActiveRun` is true.
- Use `key={`${scriptName}-${runEpoch}-${retryKey}`}`.

- [ ] **Step 4: Run component tests and verify green**

Run:

```bash
npx jest src/components/tabs/__tests__/LiveDashboardTab.test.tsx --runInBand
```

Expected: all `LiveDashboardTab` tests pass.

- [ ] **Step 5: Commit task 2**

```bash
git add src/components/tabs/LiveDashboardTab.tsx src/components/tabs/__tests__/LiveDashboardTab.test.tsx
git commit -m "fix: mount live dashboard iframe immediately"
```

### Task 3: E2E Dashboard Content Assertion

**Files:**
- Modify: `e2e/k6-studio.spec.ts`

- [ ] **Step 1: Write failing E2E assertion**

In `dashboard renders on second consecutive run`, after the iframe is visible, add a frame locator assertion:

```ts
const dashboardFrame = page.frameLocator("iframe[title='k6 Live Dashboard']");
await expect(dashboardFrame.getByText("Iteration Rate")).toBeVisible({
  timeout: 30000,
});
await expect(dashboardFrame.getByText("Loading...")).toHaveCount(0, {
  timeout: 30000,
});
```

- [ ] **Step 2: Run the E2E test**

Run:

```bash
npx playwright test e2e/k6-studio.spec.ts --project=chromium -g "dashboard renders on second consecutive run"
```

Expected before implementation: this may fail or be slow with the old probing/default period behavior. After Tasks 1 and 2 it should pass.

- [ ] **Step 3: Verify the complete E2E suite**

Run:

```bash
npx playwright test --project=chromium
```

Expected: 7 passed.

- [ ] **Step 4: Commit task 3**

```bash
git add e2e/k6-studio.spec.ts
git commit -m "test: assert live dashboard iframe content"
```

### Task 4: File Explorer Scroll And Search

**Files:**
- Modify: `src/components/file-explorer/FileExplorer.tsx`
- Test: `src/components/file-explorer/__tests__/FileExplorer.test.tsx`

- [ ] **Step 1: Write failing file explorer tests**

Add tests to `FileExplorer.test.tsx`:

```ts
it("renders a search box under the create toolbar", async () => {
  mockFilesTree([
    { path: "script.js", name: "script.js", type: "file" },
  ]);

  render(<FileExplorer selectedFile={null} onSelectFile={jest.fn()} />);

  expect(
    await screen.findByRole("searchbox", { name: /search scripts/i })
  ).toBeInTheDocument();
});

it("filters files by name and keeps matching folder ancestors", async () => {
  mockFilesTree([
    {
      path: "auth/",
      name: "auth",
      type: "folder",
      children: [
        { path: "auth/login.ts", name: "login.ts", type: "file" },
        { path: "auth/logout.ts", name: "logout.ts", type: "file" },
      ],
    },
    { path: "checkout.ts", name: "checkout.ts", type: "file" },
  ]);

  render(<FileExplorer selectedFile={null} onSelectFile={jest.fn()} />);

  fireEvent.change(
    await screen.findByRole("searchbox", { name: /search scripts/i }),
    { target: { value: "login" } }
  );

  expect(screen.getByText("auth")).toBeInTheDocument();
  expect(screen.getByText("login.ts")).toBeInTheDocument();
  expect(screen.queryByText("logout.ts")).not.toBeInTheDocument();
  expect(screen.queryByText("checkout.ts")).not.toBeInTheDocument();
});

it("uses a constrained scroll region for long file trees", async () => {
  mockFilesTree([
    { path: "script.js", name: "script.js", type: "file" },
  ]);

  render(<FileExplorer selectedFile={null} onSelectFile={jest.fn()} />);

  expect(await screen.findByTestId("file-explorer-scroll")).toHaveClass(
    "min-h-0"
  );
});
```

- [ ] **Step 2: Run file explorer tests and verify red**

Run:

```bash
npx jest src/components/file-explorer/__tests__/FileExplorer.test.tsx --runInBand
```

Expected: the new searchbox and scroll test fail because those UI targets do not exist yet.

- [ ] **Step 3: Implement local tree filtering**

In `FileExplorer.tsx`:

- Add `const [query, setQuery] = useState("");`.
- Add helper `filterTree(nodes: FileNode[], query: string): FileNode[]` below `countFiles()`.
- Match case-insensitively against `node.name` and `node.path`.
- For folders, keep the folder if it matches directly or any child matches.

Implementation:

```ts
function filterTree(nodes: FileNode[], query: string): FileNode[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return nodes;

  const result: FileNode[] = [];
  for (const node of nodes) {
    const selfMatches =
      node.name.toLowerCase().includes(normalized) ||
      node.path.toLowerCase().includes(normalized);

    if (node.type === "folder") {
      const children = filterTree(node.children ?? [], query);
      if (selfMatches || children.length > 0) {
        result.push({ ...node, children: selfMatches ? node.children : children });
      }
    } else if (selfMatches) {
      result.push(node);
    }
  }
  return result;
}
```

- [ ] **Step 4: Implement search input and scroll constraints**

In `FileExplorer.tsx`:

- Import `Search` from `lucide-react`.
- Change outer wrapper to `className="flex h-full min-h-0 flex-col"`.
- Add a full-width search row immediately after `PanelHeader`.
- Use `role="searchbox"`, `aria-label="Search scripts"`, and a compact input style matching the sidebar.
- Render `filteredTree` in the scroll area.
- Add `data-testid="file-explorer-scroll"` and `className="min-h-0 flex-1 px-1 py-1"` to `ScrollArea`.

- [ ] **Step 5: Run file explorer tests and verify green**

Run:

```bash
npx jest src/components/file-explorer/__tests__/FileExplorer.test.tsx --runInBand
```

Expected: all `FileExplorer` tests pass.

- [ ] **Step 6: Commit task 4**

```bash
git add src/components/file-explorer/FileExplorer.tsx src/components/file-explorer/__tests__/FileExplorer.test.tsx
git commit -m "feat: add file explorer search"
```

### Task 5: E2E File Search Coverage

**Files:**
- Modify: `e2e/k6-studio.spec.ts`

- [ ] **Step 1: Write failing E2E search coverage**

Add a helper:

```ts
async function searchFiles(page: Page, query: string) {
  await page.getByRole("searchbox", { name: /search scripts/i }).fill(query);
}
```

Add an assertion to the nested script test after creating `nested.ts`:

```ts
await searchFiles(page, "nested");
await expect(fileRow(page, `${folder}/nested.ts`)).toBeVisible({
  timeout: 8000,
});
await expect(folderRow(page, `${folder}/`)).toBeVisible();
```

- [ ] **Step 2: Run focused E2E search test**

Run:

```bash
npx playwright test e2e/k6-studio.spec.ts --project=chromium -g "create folder then create a nested script inside it"
```

Expected: passes after Task 4.

- [ ] **Step 3: Commit task 5**

```bash
git add e2e/k6-studio.spec.ts
git commit -m "test: cover file explorer search"
```

### Task 6: Final Verification

**Files:**
- No code changes expected.

- [ ] **Step 1: Run full Jest suite**

```bash
npx jest --runInBand
```

Expected: all suites pass.

- [ ] **Step 2: Run TypeScript**

```bash
npx tsc --noEmit
```

Expected: no output and exit 0.

- [ ] **Step 3: Run lint**

```bash
npm run lint
```

Expected: exit 0. Existing warnings, if any, should be reported.

- [ ] **Step 4: Run full Chromium E2E**

```bash
npx playwright test --project=chromium
```

Expected: all tests pass.

- [ ] **Step 5: Check runtime status**

```bash
curl -sS http://localhost:3000/api/run/status
docker compose exec -T app ps -ef | rg 'k6|node|next'
```

Expected: `activeRunners:0` and no live k6 child process after E2E completes.
