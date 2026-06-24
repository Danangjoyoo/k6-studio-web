# Task 8: Live Dashboard Tab

> [← Master Plan](./master.md)

**Goal:** Build `LiveDashboardTab` — an iframe that embeds k6's built-in web dashboard. When k6 runs with `--out web-dashboard`, it starts an HTTP server on port 5665. A Next.js catch-all proxy route forwards requests to that server so the user never leaves the UI.

**How the k6 web dashboard works:**
- `k6 run --out web-dashboard=export=<path>&port=5665 <script>` starts a dashboard HTTP server on port 5665.
- The dashboard is live during the test run and shows real-time metrics.
- `LiveDashboardTab` renders an iframe pointing at `/api/dashboard/` (the proxy).

**Files:**
- Create: `src/app/api/dashboard/[[...path]]/route.ts`
- Create: `src/components/tabs/LiveDashboardTab.tsx`
- Create: `src/components/tabs/__tests__/LiveDashboardTab.test.tsx`
- Modify: `src/lib/k6.ts` — add dashboard port to `buildK6Command`

**Interfaces produced (consumed by Task 9):**

```ts
// No props — self-contained
export default function LiveDashboardTab(): JSX.Element
```

---

- [ ] **Step 1: Write failing test**

Create `src/components/tabs/__tests__/LiveDashboardTab.test.tsx`:

```tsx
/**
 * @jest-environment jsdom
 */
import { render, screen, waitFor } from "@testing-library/react";
import LiveDashboardTab from "@/components/tabs/LiveDashboardTab";

global.fetch = jest.fn().mockResolvedValue({ ok: true }) as jest.Mock;

describe("LiveDashboardTab", () => {
  it("renders an iframe pointing to the dashboard proxy when available", async () => {
    render(<LiveDashboardTab />);
    await waitFor(() => {
      const iframe = screen.getByTitle("k6 Live Dashboard");
      expect(iframe).toBeInTheDocument();
      expect(iframe.getAttribute("src")).toBe("/api/dashboard/");
    });
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
npx jest src/components/tabs/__tests__/LiveDashboardTab.test.tsx
```

Expected: FAIL — `Cannot find module '@/components/tabs/LiveDashboardTab'`

- [ ] **Step 3: Implement the dashboard proxy API route**

Create `src/app/api/dashboard/[[...path]]/route.ts`:

```ts
export const dynamic = "force-dynamic";

const DASHBOARD_ORIGIN = `http://localhost:${
  process.env.K6_DASHBOARD_PORT ?? "5665"
}`;

type Params = { params: Promise<{ path?: string[] }> };

async function proxy(request: Request, pathSegments: string[]): Promise<Response> {
  const url = new URL(request.url);
  const target = `${DASHBOARD_ORIGIN}/${pathSegments.join("/")}${url.search}`;

  try {
    const upstream = await fetch(target, {
      method: request.method,
      headers: Object.fromEntries(request.headers),
      body:
        request.method !== "GET" && request.method !== "HEAD"
          ? request.body
          : undefined,
    });
    const body = await upstream.arrayBuffer();
    return new Response(body, {
      status: upstream.status,
      headers: upstream.headers,
    });
  } catch {
    return new Response("k6 dashboard is not running", { status: 503 });
  }
}

export async function GET(request: Request, { params }: Params) {
  const { path = [] } = await params;
  return proxy(request, path);
}

export async function POST(request: Request, { params }: Params) {
  const { path = [] } = await params;
  return proxy(request, path);
}
```

- [ ] **Step 4: Implement `src/components/tabs/LiveDashboardTab.tsx`**

```tsx
"use client";

import { useEffect, useState } from "react";

export default function LiveDashboardTab() {
  const [available, setAvailable] = useState<boolean | null>(null);

  useEffect(() => {
    fetch("/api/dashboard/")
      .then((res) => setAvailable(res.ok))
      .catch(() => setAvailable(false));
  }, []);

  if (available === null) {
    return (
      <div className="flex items-center justify-center h-full text-slate-400 text-sm">
        Checking dashboard…
      </div>
    );
  }

  if (!available) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-slate-400">
        <p className="text-sm">k6 dashboard is not running.</p>
        <p className="text-xs text-slate-500">
          Start a test from the Editor tab — the dashboard starts automatically.
        </p>
      </div>
    );
  }

  return (
    <iframe
      src="/api/dashboard/"
      className="w-full h-full border-0"
      title="k6 Live Dashboard"
    />
  );
}
```

- [ ] **Step 5: Run test to confirm it passes**

```bash
npx jest src/components/tabs/__tests__/LiveDashboardTab.test.tsx
```

Expected: PASS

- [ ] **Step 6: Update `src/lib/k6.ts` to include dashboard port in run args**

Open `src/lib/k6.ts` and replace `buildK6Command`:

```ts
export function buildK6Command(
  scriptPath: string,
  reportPath: string
): string[] {
  const port = process.env.K6_DASHBOARD_PORT ?? "5665";
  return [
    "run",
    "--out",
    `web-dashboard=export=${reportPath}&port=${port}`,
    scriptPath,
  ];
}
```

Re-run the k6 unit test:

```bash
npx jest src/lib/__tests__/k6.test.ts
```

Expected: PASS

- [ ] **Step 7: Smoke-test in browser**

```bash
docker compose up minio -d && npm run dev
```

1. Create and run a test from the Editor tab.
2. While the test is running, click the Live Dashboard tab.
3. Confirm the k6 dashboard renders inside the iframe with live metrics.
4. After the test finishes, switch to Live Dashboard tab again — "k6 dashboard is not running" is shown.

- [ ] **Step 8: Commit**

```bash
docker compose down
git add src/app/api/dashboard/ src/components/tabs/LiveDashboardTab.tsx src/components/tabs/__tests__/LiveDashboardTab.test.tsx src/lib/k6.ts
git commit -m "feat: add live dashboard tab with k6 web-dashboard proxy"
```
