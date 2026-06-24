# Task 9: Main Layout Integration

> [← Master Plan](./master.md)

**Goal:** Wire all components into the final application layout. `AppShell` renders the `FileExplorer` on the left and a tab strip (`Editor` | `Live Dashboard` | `Test History`) on the right. `src/app/page.tsx` renders `AppShell`. This replaces all temporary smoke-test page.tsx files from earlier tasks.

**Consumes (from Tasks 3–8):**
- `FileExplorerProps` — `{ selectedFile: string | null; onSelectFile: (name: string) => void }`
- `EditorTabProps` — `{ filename: string | null }`
- `LiveDashboardTab` — no props
- `TestHistoryTab` — no props

**Files:**
- Create: `src/components/layout/AppShell.tsx`
- Modify: `src/app/page.tsx` — replace placeholder with `<AppShell />`
- Modify: `src/app/layout.tsx` — set dark background, remove default padding

**Interfaces produced:** None (this is the root composition layer).

---

- [ ] **Step 1: Write failing test for AppShell**

Create `src/components/layout/__tests__/AppShell.test.tsx`:

```tsx
/**
 * @jest-environment jsdom
 */
import { render, screen } from "@testing-library/react";
import AppShell from "@/components/layout/AppShell";

jest.mock("@/components/file-explorer/FileExplorer", () => ({
  __esModule: true,
  default: () => <div data-testid="file-explorer" />,
}));

jest.mock("@/components/tabs/EditorTab", () => ({
  __esModule: true,
  default: () => <div data-testid="editor-tab" />,
}));

jest.mock("@/components/tabs/LiveDashboardTab", () => ({
  __esModule: true,
  default: () => <div data-testid="live-dashboard-tab" />,
}));

jest.mock("@/components/tabs/TestHistoryTab", () => ({
  __esModule: true,
  default: () => <div data-testid="test-history-tab" />,
}));

describe("AppShell", () => {
  it("renders file explorer and tab navigation", () => {
    render(<AppShell />);
    expect(screen.getByTestId("file-explorer")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /editor/i })).toBeInTheDocument();
    expect(
      screen.getByRole("tab", { name: /live dashboard/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("tab", { name: /test history/i })
    ).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
npx jest src/components/layout/__tests__/AppShell.test.tsx
```

Expected: FAIL — `Cannot find module '@/components/layout/AppShell'`

- [ ] **Step 3: Implement `src/components/layout/AppShell.tsx`**

```tsx
"use client";

import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import FileExplorer from "@/components/file-explorer/FileExplorer";
import EditorTab from "@/components/tabs/EditorTab";
import LiveDashboardTab from "@/components/tabs/LiveDashboardTab";
import TestHistoryTab from "@/components/tabs/TestHistoryTab";

export default function AppShell() {
  const [selectedFile, setSelectedFile] = useState<string | null>(null);

  return (
    <div className="flex h-screen bg-slate-950 text-slate-100 overflow-hidden">
      {/* Left sidebar — file explorer */}
      <aside className="w-56 shrink-0 overflow-hidden">
        <FileExplorer
          selectedFile={selectedFile}
          onSelectFile={setSelectedFile}
        />
      </aside>

      {/* Right area — tabs */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Tabs defaultValue="editor" className="flex flex-col h-full">
          <TabsList className="shrink-0 rounded-none border-b border-slate-700 bg-slate-900 justify-start px-2 h-9">
            <TabsTrigger
              value="editor"
              className="text-xs h-7 data-[state=active]:bg-slate-700"
            >
              Editor
            </TabsTrigger>
            <TabsTrigger
              value="live-dashboard"
              className="text-xs h-7 data-[state=active]:bg-slate-700"
            >
              Live Dashboard
            </TabsTrigger>
            <TabsTrigger
              value="test-history"
              className="text-xs h-7 data-[state=active]:bg-slate-700"
            >
              Test History
            </TabsTrigger>
          </TabsList>

          <TabsContent
            value="editor"
            className="flex-1 mt-0 overflow-hidden data-[state=inactive]:hidden"
          >
            <EditorTab filename={selectedFile} />
          </TabsContent>

          <TabsContent
            value="live-dashboard"
            className="flex-1 mt-0 overflow-hidden data-[state=inactive]:hidden"
          >
            <LiveDashboardTab />
          </TabsContent>

          <TabsContent
            value="test-history"
            className="flex-1 mt-0 overflow-hidden data-[state=inactive]:hidden"
          >
            <TestHistoryTab />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
```

- [ ] **Step 4: Run test to confirm it passes**

```bash
npx jest src/components/layout/__tests__/AppShell.test.tsx
```

Expected: PASS

- [ ] **Step 5: Update `src/app/layout.tsx`**

Open `src/app/layout.tsx`. Replace the `<body>` className to remove default white background:

```tsx
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "k6 Studio",
  description: "k6 load test management UI",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.className} bg-slate-950 text-slate-100 antialiased`}>
        {children}
      </body>
    </html>
  );
}
```

- [ ] **Step 6: Update `src/app/page.tsx`**

Replace the file entirely:

```tsx
import AppShell from "@/components/layout/AppShell";

export default function Page() {
  return <AppShell />;
}
```

- [ ] **Step 7: Run full test suite**

```bash
npx jest --passWithNoTests
```

Expected: All tests pass. No TypeScript errors.

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 8: End-to-end smoke test in browser**

```bash
docker compose up minio -d && npm run dev
```

Walk through the complete user journey:

1. Open `http://localhost:3000`.
2. Click **+ New Script** in the file explorer — dialog opens, type `load-test`, click Create.
3. `load-test.js` appears in the sidebar and is auto-selected; Monaco editor opens with the default script.
4. Edit the script (e.g., change `vus: 10` to `vus: 1`).
5. Click **Run** — terminal streams k6 output; Run button shows "Running…".
6. Switch to **Live Dashboard** tab — k6 dashboard renders in the iframe.
7. Wait for test to finish — switch back to **Editor** tab, terminal shows exit code.
8. Switch to **Test History** tab — a new report appears; click it, HTML renders.
9. Click **Save** — status shows "saved".

- [ ] **Step 9: Commit**

```bash
docker compose down
git add src/components/layout/ src/app/page.tsx src/app/layout.tsx
git commit -m "feat: wire full application layout with sidebar and tab navigation"
```
