# Task 7: Test History Tab

> [← Master Plan](./master.md)

**Goal:** Build `TestHistoryTab` — a two-panel view that lists HTML reports from the `k6-reports` MinIO bucket on the left and renders the selected report in an iframe on the right.

**Consumes (from Task 2):**
- `GET /api/reports` → `{ reports: { name: string; size: number; lastModified: string }[] }`
- `GET /api/reports/[name]` → HTML string (`Content-Type: text/html`)

**Files:**
- Create: `src/components/tabs/TestHistoryTab.tsx`
- Create: `src/components/tabs/__tests__/TestHistoryTab.test.tsx`

**Interfaces produced (consumed by Task 9):**

```ts
// No props — TestHistoryTab fetches its own data
export default function TestHistoryTab(): JSX.Element
```

---

- [ ] **Step 1: Write failing test**

Create `src/components/tabs/__tests__/TestHistoryTab.test.tsx`:

```tsx
/**
 * @jest-environment jsdom
 */
import { render, screen, waitFor } from "@testing-library/react";
import TestHistoryTab from "@/components/tabs/TestHistoryTab";

global.fetch = jest.fn().mockResolvedValue({
  ok: true,
  json: async () => ({
    reports: [
      {
        name: "smoke.js-1719200000000.html",
        size: 40000,
        lastModified: "2024-06-24T00:00:00.000Z",
      },
    ],
  }),
}) as jest.Mock;

describe("TestHistoryTab", () => {
  it("renders report list from API", async () => {
    render(<TestHistoryTab />);
    await waitFor(() => {
      expect(
        screen.getByText("smoke.js-1719200000000.html")
      ).toBeInTheDocument();
    });
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
npx jest src/components/tabs/__tests__/TestHistoryTab.test.tsx
```

Expected: FAIL — `Cannot find module '@/components/tabs/TestHistoryTab'`

- [ ] **Step 3: Implement `src/components/tabs/TestHistoryTab.tsx`**

```tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { FileText, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ReportInfo {
  name: string;
  size: number;
  lastModified: string;
}

export default function TestHistoryTab() {
  const [reports, setReports] = useState<ReportInfo[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchReports = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/reports");
    const data = (await res.json()) as { reports: ReportInfo[] };
    setReports(
      [...data.reports].sort(
        (a, b) =>
          new Date(b.lastModified).getTime() -
          new Date(a.lastModified).getTime()
      )
    );
    setLoading(false);
  }, []);

  useEffect(() => {
    void fetchReports();
  }, [fetchReports]);

  return (
    <div className="flex h-full">
      <div className="w-72 flex flex-col border-r border-slate-700 bg-slate-900">
        <div className="flex items-center justify-between px-3 py-2 border-b border-slate-700">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
            Reports
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => void fetchReports()}
            disabled={loading}
          >
            <RefreshCw
              className={`h-3 w-3 ${loading ? "animate-spin" : ""}`}
            />
          </Button>
        </div>
        <ScrollArea className="flex-1">
          {reports.length === 0 && !loading && (
            <p className="text-xs text-slate-500 px-3 py-4">
              No reports yet. Run a test to generate one.
            </p>
          )}
          {reports.map((r) => (
            <div
              key={r.name}
              className={`flex items-start gap-2 px-3 py-2 cursor-pointer text-xs border-b border-slate-800 ${
                selected === r.name
                  ? "bg-slate-700 text-white"
                  : "text-slate-300 hover:bg-slate-800"
              }`}
              onClick={() => setSelected(r.name)}
            >
              <FileText className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <div className="min-w-0">
                <p className="truncate font-medium">{r.name}</p>
                <p className="text-slate-500">
                  {new Date(r.lastModified).toLocaleString()}
                </p>
              </div>
            </div>
          ))}
        </ScrollArea>
      </div>

      <div className="flex-1 bg-white">
        {selected ? (
          <iframe
            key={selected}
            src={`/api/reports/${encodeURIComponent(selected)}`}
            className="w-full h-full border-0"
            title={selected}
            sandbox="allow-scripts allow-same-origin"
          />
        ) : (
          <div className="flex items-center justify-center h-full text-slate-400 text-sm bg-slate-950">
            Select a report to view
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to confirm it passes**

```bash
npx jest src/components/tabs/__tests__/TestHistoryTab.test.tsx
```

Expected: PASS

- [ ] **Step 5: Smoke-test in browser**

Temporarily update `src/app/page.tsx`:

```tsx
import TestHistoryTab from "@/components/tabs/TestHistoryTab";

export default function Page() {
  return (
    <div className="h-screen">
      <TestHistoryTab />
    </div>
  );
}
```

```bash
docker compose up minio -d && npm run dev
```

1. Run a k6 test with `curl -N -X POST http://localhost:3000/api/run -H "Content-Type: application/json" -d '{"filename":"smoke.js"}'` to upload a report.
2. Reload the page — report appears in the left panel.
3. Click the report — HTML renders in the iframe on the right.

- [ ] **Step 6: Commit**

```bash
docker compose down
git checkout src/app/page.tsx
git add src/components/tabs/TestHistoryTab.tsx src/components/tabs/__tests__/TestHistoryTab.test.tsx
git commit -m "feat: add test history tab with report list and iframe viewer"
```
