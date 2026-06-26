# Test History Preview Tabs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add per-report persisted custom URL tabs to the test history preview while keeping the k6 summary report as a pinned tab.

**Architecture:** Store custom tabs in S3 sidecar JSON objects named `<report>.tabs.json`. Keep the report list and summary report API compatible, add a focused tabs metadata API, and extract the right preview pane into `TestHistoryReportPreview`.

**Tech Stack:** Next.js App Router route handlers, React 19 client components, TypeScript strict mode, MinIO S3-compatible storage, Jest, React Testing Library.

---

### Task 1: Report Tab Metadata Helpers

**Files:**
- Create: `src/lib/report-tabs.ts`
- Create: `src/lib/__tests__/report-tabs.test.ts`

- [ ] **Step 1: Write failing helper tests**

Create `src/lib/__tests__/report-tabs.test.ts`:

```ts
import {
  REPORT_TABS_SUFFIX,
  isReportTabsSidecar,
  reportTabsSidecarName,
  normalizeReportPreviewTabs,
} from "@/lib/report-tabs";

describe("report tab metadata helpers", () => {
  it("builds and detects report sidecar names", () => {
    expect(REPORT_TABS_SUFFIX).toBe(".tabs.json");
    expect(reportTabsSidecarName("api/smoke.ts-111.html")).toBe(
      "api/smoke.ts-111.html.tabs.json"
    );
    expect(isReportTabsSidecar("api/smoke.ts-111.html.tabs.json")).toBe(true);
    expect(isReportTabsSidecar("api/smoke.ts-111.html")).toBe(false);
  });

  it("normalizes http and https tabs with derived host titles", () => {
    expect(
      normalizeReportPreviewTabs([
        { id: "x", url: "https://grafana.example.local/d/a", title: "" },
        { id: "y", url: "http://localhost:3001/path", title: "Local board" },
      ])
    ).toEqual([
      {
        id: "x",
        url: "https://grafana.example.local/d/a",
        title: "grafana.example.local",
      },
      {
        id: "y",
        url: "http://localhost:3001/path",
        title: "Local board",
      },
    ]);
  });

  it("rejects non-http urls", () => {
    expect(() =>
      normalizeReportPreviewTabs([{ id: "x", url: "javascript:alert(1)" }])
    ).toThrow("Only http and https URLs are supported");
    expect(() =>
      normalizeReportPreviewTabs([{ id: "x", url: "/api/reports/a.html" }])
    ).toThrow("Only http and https URLs are supported");
  });
});
```

- [ ] **Step 2: Run helper tests and verify they fail**

Run:

```bash
npx jest src/lib/__tests__/report-tabs.test.ts --runInBand
```

Expected: fail because `@/lib/report-tabs` does not exist.

- [ ] **Step 3: Implement helpers**

Create `src/lib/report-tabs.ts`:

```ts
export const REPORT_TABS_SUFFIX = ".tabs.json";

export interface ReportPreviewCustomTab {
  id: string;
  url: string;
  title: string;
  updatedAt?: string;
}

export interface ReportPreviewTabsPayload {
  version: 1;
  tabs: ReportPreviewCustomTab[];
}

export class ReportTabsValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReportTabsValidationError";
  }
}

export function reportTabsSidecarName(reportName: string): string {
  return `${reportName}${REPORT_TABS_SUFFIX}`;
}

export function isReportTabsSidecar(name: string): boolean {
  return name.endsWith(REPORT_TABS_SUFFIX);
}

export function normalizeReportPreviewTabs(
  value: unknown
): ReportPreviewCustomTab[] {
  if (!Array.isArray(value)) {
    throw new ReportTabsValidationError("tabs must be an array");
  }

  return value.map((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new ReportTabsValidationError(`tab ${index} must be an object`);
    }
    const record = item as Record<string, unknown>;
    const id =
      typeof record.id === "string" && record.id.trim()
        ? record.id.trim()
        : `tab_${Date.now()}_${index}`;
    const url =
      typeof record.url === "string" ? normalizeHttpUrl(record.url) : null;
    if (!url) {
      throw new ReportTabsValidationError("Only http and https URLs are supported");
    }
    const title =
      typeof record.title === "string" && record.title.trim()
        ? record.title.trim()
        : new URL(url).hostname;
    const updatedAt =
      typeof record.updatedAt === "string" && record.updatedAt.trim()
        ? record.updatedAt.trim()
        : undefined;

    return { id, url, title, ...(updatedAt ? { updatedAt } : {}) };
  });
}

export function parseReportPreviewTabsPayload(value: unknown): ReportPreviewCustomTab[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const tabs = (value as { tabs?: unknown }).tabs;
  try {
    return normalizeReportPreviewTabs(tabs ?? []);
  } catch {
    return [];
  }
}

function normalizeHttpUrl(value: string): string | null {
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.toString();
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run helper tests and verify they pass**

Run:

```bash
npx jest src/lib/__tests__/report-tabs.test.ts --runInBand
```

Expected: 3 tests pass.

- [ ] **Step 5: Commit**

Run:

```bash
git add src/lib/report-tabs.ts src/lib/__tests__/report-tabs.test.ts
git commit -m "feat: add report tab metadata helpers"
```

### Task 2: Report Tabs API

**Files:**
- Create: `src/app/api/reports/[name]/tabs/route.ts`
- Create: `src/app/api/reports/[name]/tabs/__tests__/route.test.ts`

- [ ] **Step 1: Write failing route tests**

Create `src/app/api/reports/[name]/tabs/__tests__/route.test.ts`:

```ts
import { EventEmitter } from "events";
import { GET, PUT } from "@/app/api/reports/[name]/tabs/route";
import { REPORTS_BUCKET } from "@/lib/minio";

const mockEnsureBuckets = jest.fn();
const mockClient = {
  getObject: jest.fn(),
  putObject: jest.fn(),
};

jest.mock("@/lib/minio", () => ({
  getMinioClient: () => mockClient,
  REPORTS_BUCKET: "k6-reports",
  ensureBuckets: () => mockEnsureBuckets(),
}));

function objectBody(content: string) {
  const stream = new EventEmitter();
  queueMicrotask(() => {
    stream.emit("data", Buffer.from(content, "utf-8"));
    stream.emit("end");
  });
  return stream;
}

beforeEach(() => {
  mockEnsureBuckets.mockReset();
  mockClient.getObject.mockReset();
  mockClient.putObject.mockReset();
});

describe("report tabs metadata route", () => {
  it("returns saved custom tabs from the namespace sidecar", async () => {
    mockClient.getObject.mockResolvedValue(
      objectBody(
        JSON.stringify({
          version: 1,
          tabs: [{ id: "tab_1", url: "https://grafana.example/d/a", title: "" }],
        })
      )
    );

    const response = await GET(
      new Request("http://localhost/api/reports/api%2Fsmoke.ts-1.html/tabs?namespace=team-a"),
      { params: Promise.resolve({ name: "api/smoke.ts-1.html" }) }
    );

    expect(response.status).toBe(200);
    expect(mockClient.getObject).toHaveBeenCalledWith(
      REPORTS_BUCKET,
      "team-a/api/smoke.ts-1.html.tabs.json"
    );
    await expect(response.json()).resolves.toEqual({
      tabs: [
        {
          id: "tab_1",
          url: "https://grafana.example/d/a",
          title: "grafana.example",
        },
      ],
    });
  });

  it("returns an empty tab list when the sidecar is missing", async () => {
    mockClient.getObject.mockRejectedValue(new Error("missing"));

    const response = await GET(
      new Request("http://localhost/api/reports/smoke.ts-1.html/tabs?namespace=team-a"),
      { params: Promise.resolve({ name: "smoke.ts-1.html" }) }
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ tabs: [] });
  });

  it("writes validated custom tabs to the namespace sidecar", async () => {
    const response = await PUT(
      new Request("http://localhost/api/reports/smoke.ts-1.html/tabs?namespace=team-a", {
        method: "PUT",
        body: JSON.stringify({
          tabs: [{ id: "tab_1", url: "https://grafana.example/d/a", title: "" }],
        }),
      }),
      { params: Promise.resolve({ name: "smoke.ts-1.html" }) }
    );

    expect(response.status).toBe(200);
    expect(mockClient.putObject).toHaveBeenCalledWith(
      REPORTS_BUCKET,
      "team-a/smoke.ts-1.html.tabs.json",
      expect.any(Buffer),
      expect.objectContaining({ "Content-Type": "application/json" })
    );
    const saved = JSON.parse(mockClient.putObject.mock.calls[0][2].toString("utf-8"));
    expect(saved).toEqual({
      version: 1,
      tabs: [
        {
          id: "tab_1",
          url: "https://grafana.example/d/a",
          title: "grafana.example",
          updatedAt: expect.any(String),
        },
      ],
    });
  });

  it("rejects invalid URL schemes", async () => {
    const response = await PUT(
      new Request("http://localhost/api/reports/smoke.ts-1.html/tabs?namespace=team-a", {
        method: "PUT",
        body: JSON.stringify({ tabs: [{ id: "tab_1", url: "file:///tmp/a" }] }),
      }),
      { params: Promise.resolve({ name: "smoke.ts-1.html" }) }
    );

    expect(response.status).toBe(400);
    expect(mockClient.putObject).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run route tests and verify they fail**

Run:

```bash
npx jest src/app/api/reports/[name]/tabs/__tests__/route.test.ts --runInBand
```

Expected: fail because the route file does not exist.

- [ ] **Step 3: Implement route**

Create `src/app/api/reports/[name]/tabs/route.ts` with GET and PUT handlers that:

- Read namespace using `getNamespaceFromRequest`.
- Use `reportTabsSidecarName(name)` and `toNamespacedKey(namespace, sidecarName)`.
- On GET, return `{ tabs: [] }` when `getObject` throws or JSON is malformed.
- On PUT, parse `{ tabs }`, validate with `normalizeReportPreviewTabs`, add `updatedAt` to each saved tab, and `putObject` the JSON buffer with content type `application/json`.
- Return `400` for namespace or tab validation errors.

- [ ] **Step 4: Run route tests and verify they pass**

Run:

```bash
npx jest src/app/api/reports/[name]/tabs/__tests__/route.test.ts --runInBand
```

Expected: 4 tests pass.

- [ ] **Step 5: Commit**

Run:

```bash
git add src/app/api/reports/[name]/tabs/route.ts src/app/api/reports/[name]/tabs/__tests__/route.test.ts
git commit -m "feat: persist report preview tabs"
```

### Task 3: Report List And Move/Rename Sidecars

**Files:**
- Modify: `src/app/api/reports/route.ts`
- Modify: `src/app/api/reports/__tests__/route.test.ts`
- Modify: `src/lib/files-move.ts`
- Modify: `src/lib/__tests__/files-move.test.ts`

- [ ] **Step 1: Write failing tests**

Add a report-list test to `src/app/api/reports/__tests__/route.test.ts` that includes `team-a/api/smoke.ts-111.html.tabs.json` in the object stream and expects it not to appear in `reports`.

Add `src/lib/__tests__/files-move.test.ts` tests if the file already exists; otherwise create it with focused tests for `buildMovePlan` and `buildRenamePlan`:

```ts
import { buildMovePlan, buildRenamePlan } from "@/lib/files-move";

describe("report tab sidecar moves", () => {
  it("moves report tab sidecars with a moved file report", () => {
    const plan = buildMovePlan({
      items: [{ path: "src/a.ts", type: "file" }],
      targetFolder: "dest",
      existingScriptObjectKeys: ["src/a.ts"],
      existingReportObjectKeys: [
        "src/a.ts-111.html",
        "src/a.ts-111.html.tabs.json",
      ],
    });

    expect(plan.reportObjectMoves).toEqual([
      { from: "src/a.ts-111.html", to: "dest/a.ts-111.html" },
      {
        from: "src/a.ts-111.html.tabs.json",
        to: "dest/a.ts-111.html.tabs.json",
      },
    ]);
  });

  it("moves report tab sidecars with a folder rename", () => {
    const plan = buildRenamePlan({
      from: "src",
      to: "renamed",
      type: "folder",
      existingScriptObjectKeys: ["src/a.ts"],
      existingReportObjectKeys: [
        "src/a.ts-111.html",
        "src/a.ts-111.html.tabs.json",
      ],
    });

    expect(plan.reportObjectMoves).toEqual([
      { from: "src/a.ts-111.html", to: "renamed/a.ts-111.html" },
      {
        from: "src/a.ts-111.html.tabs.json",
        to: "renamed/a.ts-111.html.tabs.json",
      },
    ]);
  });
});
```

- [ ] **Step 2: Run focused tests and verify they fail**

Run:

```bash
npx jest src/app/api/reports/__tests__/route.test.ts src/lib/__tests__/files-move.test.ts --runInBand
```

Expected: fail because sidecars are listed and sidecar report moves are not planned.

- [ ] **Step 3: Implement filtering and move planning**

In `src/app/api/reports/route.ts`, import `isReportTabsSidecar` and skip sidecar objects before adding to `reports`.

In `src/lib/files-move.ts`, update report matching so both these suffixes move:

```text
-<timestamp>.html
-<timestamp>.html.tabs.json
```

Use a shared matcher equivalent to:

```ts
const REPORT_HISTORY_SUFFIX_PATTERN = /^-\d+\.html(?:\.tabs\.json)?$/;
```

- [ ] **Step 4: Run focused tests and verify they pass**

Run:

```bash
npx jest src/app/api/reports/__tests__/route.test.ts src/lib/__tests__/files-move.test.ts --runInBand
```

Expected: all focused tests pass.

- [ ] **Step 5: Commit**

Run:

```bash
git add src/app/api/reports/route.ts src/app/api/reports/__tests__/route.test.ts src/lib/files-move.ts src/lib/__tests__/files-move.test.ts
git commit -m "fix: move report tab sidecars with history"
```

### Task 4: Tabbed Report Preview UI

**Files:**
- Create: `src/components/tabs/TestHistoryReportPreview.tsx`
- Create: `src/components/tabs/__tests__/TestHistoryReportPreview.test.tsx`
- Modify: `src/components/tabs/TestHistoryTab.tsx`
- Modify: `src/components/tabs/__tests__/TestHistoryTab.test.tsx`

- [ ] **Step 1: Write failing preview tests**

Create tests covering:

- Summary tab renders pinned without a close button.
- `+` creates a draft tab and focuses a URL input.
- Submitting an `https://` URL writes to `/api/reports/<report>/tabs?namespace=<namespace>`.
- Closing a custom tab persists the remaining tabs.
- Back/forward history affects iframe URL locally but is not included in the saved payload.

Use role names:

```tsx
screen.getByRole("tab", { name: "Summary" });
screen.getByRole("button", { name: "Add preview tab" });
screen.getByLabelText("Preview tab URL");
screen.getByRole("button", { name: "Close tab grafana.example" });
screen.getByRole("button", { name: "Back" });
screen.getByRole("button", { name: "Forward" });
screen.getByRole("button", { name: "Reload" });
```

- [ ] **Step 2: Run preview tests and verify they fail**

Run:

```bash
npx jest src/components/tabs/__tests__/TestHistoryReportPreview.test.tsx src/components/tabs/__tests__/TestHistoryTab.test.tsx --runInBand
```

Expected: fail because `TestHistoryReportPreview` does not exist and `TestHistoryTab` still renders a direct iframe.

- [ ] **Step 3: Implement preview component**

Implement `TestHistoryReportPreview` with props:

```ts
interface TestHistoryReportPreviewProps {
  namespace: string;
  reportName: string | null;
}
```

Behavior:

- If `reportName` is null, render the existing select-report empty state.
- If `reportName` exists, render a tab strip with pinned `Summary`.
- Fetch custom tabs from `/api/reports/${encodeURIComponent(reportName)}/tabs?namespace=${encodeURIComponent(namespace)}`.
- Render the summary iframe using `/api/reports/${encodeURIComponent(reportName)}?namespace=${encodeURIComponent(namespace)}`.
- Add draft tabs locally with generated ids.
- Persist only after URL submit.
- Save URL edits and tab closes with PUT.
- Track `history: string[]` and `historyIndex: number` in component state only.

- [ ] **Step 4: Integrate into `TestHistoryTab`**

Replace the direct right-side iframe/empty-state block with:

```tsx
<TestHistoryReportPreview namespace={namespace} reportName={selected} />
```

Keep report list fetching and selected report behavior unchanged.

- [ ] **Step 5: Run component tests and verify they pass**

Run:

```bash
npx jest src/components/tabs/__tests__/TestHistoryReportPreview.test.tsx src/components/tabs/__tests__/TestHistoryTab.test.tsx --runInBand
```

Expected: all focused component tests pass.

- [ ] **Step 6: Commit**

Run:

```bash
git add src/components/tabs/TestHistoryReportPreview.tsx src/components/tabs/__tests__/TestHistoryReportPreview.test.tsx src/components/tabs/TestHistoryTab.tsx src/components/tabs/__tests__/TestHistoryTab.test.tsx
git commit -m "feat: add tabbed test history preview"
```

### Task 5: Final Verification

**Files:**
- No source edits unless verification exposes defects.

- [ ] **Step 1: Run full Jest**

Run:

```bash
npx jest --runInBand
```

Expected: all test suites pass.

- [ ] **Step 2: Run TypeScript**

Run:

```bash
npx tsc --noEmit
```

Expected: exit code 0.

- [ ] **Step 3: Run lint**

Run:

```bash
npm run lint
```

Expected: exit code 0.

- [ ] **Step 4: Run production build**

Run:

```bash
npm run build
```

Expected: exit code 0.

- [ ] **Step 5: Rebuild Docker app**

Run:

```bash
docker compose up --build -d
```

Expected: app and MinIO containers are up.
