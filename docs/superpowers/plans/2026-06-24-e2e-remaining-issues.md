# E2E Remaining Issues Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the existing seven Playwright Chromium scenarios pass reliably and verify the remaining MinIO folder rename concern.

**Architecture:** Add stable DOM targets to the operational UI, make folder-scoped create dialogs controlled from `FileExplorer`, and make E2E tests act on exact rows and short-lived k6 scripts. Preserve the current single-run lock and dashboard proxy architecture; only harden k6 output parsing if a focused unit test proves the current summary detector can miss split stream chunks.

**Tech Stack:** Next.js 15.5.19 App Router, React 19, TypeScript strict mode, Base UI dialog wrappers, Jest 30, Playwright 1.61, Docker Compose, MinIO, k6.

---

## File Structure

- Modify `src/components/file-explorer/FileItem.tsx`: add stable row test attributes.
- Modify `src/components/file-explorer/FolderItem.tsx`: add stable folder row test attributes.
- Modify `src/components/layout/AppHeader.tsx`: add a stable runner status test target.
- Modify `src/components/file-explorer/NewFileDialog.tsx`: support controlled `open` / `onOpenChange`, preserve toolbar trigger usage, allow trigger parent reset.
- Modify `src/components/file-explorer/NewFolderDialog.tsx`: support controlled `open` / `onOpenChange`, preserve toolbar trigger usage, allow trigger parent reset.
- Modify `src/components/file-explorer/FileExplorer.tsx`: replace pending dialog mounts with controlled dialog state and normalize folder delete URLs.
- Modify `src/components/file-explorer/__tests__/FileExplorer.test.tsx`: cover stable row targets and folder-scoped dialog creation.
- Create `src/components/layout/__tests__/AppHeader.test.tsx`: cover runner status target text.
- Modify `src/lib/k6.ts`: buffer stdout/stderr lines before summary detection.
- Modify `src/lib/__tests__/k6.test.ts`: prove summary detection works when `iteration_duration` is split across chunks.
- Modify `playwright.config.ts`: increase global timeout for Docker-backed k6 scenarios.
- Modify `e2e/k6-studio.spec.ts`: replace class selectors and global `.first()` actions with exact row locators, use short API-created scripts for run tests, and assert runner status through `data-testid`.
- Optionally modify `src/app/api/files/rename/route.ts`: only if Docker verification proves the current MinIO `copyObject` source format fails at runtime.

## Task 1: Stable DOM Targets

**Files:**
- Modify: `src/components/file-explorer/FileItem.tsx`
- Modify: `src/components/file-explorer/FolderItem.tsx`
- Modify: `src/components/layout/AppHeader.tsx`
- Modify: `src/components/file-explorer/__tests__/FileExplorer.test.tsx`
- Create: `src/components/layout/__tests__/AppHeader.test.tsx`

- [ ] **Step 1: Write failing tests for file/folder row targets**

Replace `src/components/file-explorer/__tests__/FileExplorer.test.tsx` with this expanded test file:

```tsx
/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen, waitFor } from "@testing-library/react";
import FileExplorer from "@/components/file-explorer/FileExplorer";

const fetchMock = global.fetch as jest.Mock;

function mockFilesTree(tree: unknown[]) {
  fetchMock.mockResolvedValue({
    ok: true,
    json: async () => ({
      files: [],
      tree,
    }),
  });
}

beforeEach(() => {
  fetchMock.mockReset();
});

describe("FileExplorer", () => {
  it("renders file list from API", async () => {
    mockFilesTree([
      { path: "script.js", name: "script.js", type: "file" },
    ]);

    render(<FileExplorer selectedFile={null} onSelectFile={jest.fn()} />);

    await waitFor(() => {
      expect(screen.getByText("script.js")).toBeInTheDocument();
    });
  });

  it("adds stable test targets to file and folder rows", async () => {
    mockFilesTree([
      {
        path: "auth/",
        name: "auth",
        type: "folder",
        children: [
          { path: "auth/login.ts", name: "login.ts", type: "file" },
        ],
      },
    ]);

    render(<FileExplorer selectedFile={null} onSelectFile={jest.fn()} />);

    await screen.findByText("auth");

    expect(screen.getByTestId("sidebar-folder-item")).toHaveAttribute(
      "data-path",
      "auth/"
    );
    expect(screen.getByTestId("sidebar-file-item")).toHaveAttribute(
      "data-path",
      "auth/login.ts"
    );
  });
});
```

- [ ] **Step 2: Run the file explorer target test to verify it fails**

Run:

```bash
npx jest src/components/file-explorer/__tests__/FileExplorer.test.tsx --runInBand
```

Expected: FAIL because `sidebar-folder-item` and `sidebar-file-item` are not present yet.

- [ ] **Step 3: Add stable row targets**

In `src/components/file-explorer/FileItem.tsx`, add the attributes to the root clickable `div`:

```tsx
      <div
        role="button"
        tabIndex={0}
        data-testid="sidebar-file-item"
        data-path={path}
        style={{ paddingLeft: `${0.5 + depth * 1}rem` }}
```

In `src/components/file-explorer/FolderItem.tsx`, add the attributes to the folder row `div` that already has `role="button"`:

```tsx
        <div
          role="button"
          tabIndex={0}
          data-testid="sidebar-folder-item"
          data-path={path}
          style={{ paddingLeft: `${0.5 + depth * 1}rem` }}
```

- [ ] **Step 4: Write the AppHeader status target test**

Create `src/components/layout/__tests__/AppHeader.test.tsx`:

```tsx
/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import AppHeader from "@/components/layout/AppHeader";

describe("AppHeader", () => {
  it("exposes a stable active runner status target when idle", () => {
    render(<AppHeader activeRunners={0} runningScript={null} />);

    expect(screen.getByTestId("active-runner-status")).toHaveTextContent(
      "Active runner: 0/1"
    );
  });

  it("exposes a stable active runner status target when running", () => {
    render(<AppHeader activeRunners={1} runningScript="load.ts" />);

    expect(screen.getByTestId("active-runner-status")).toHaveTextContent(
      "Active runner: 1/1"
    );
    expect(screen.getByText("load.ts")).toBeInTheDocument();
  });
});
```

- [ ] **Step 5: Run the AppHeader test to verify it fails**

Run:

```bash
npx jest src/components/layout/__tests__/AppHeader.test.tsx --runInBand
```

Expected: FAIL because `active-runner-status` is not present yet.

- [ ] **Step 6: Add the AppHeader target**

In `src/components/layout/AppHeader.tsx`, add `data-testid` to the runner pill `div`:

```tsx
        <div
          data-testid="active-runner-status"
          className={cn(
            "flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[10px] font-medium uppercase tracking-wider transition-colors duration-200",
            isRunning
              ? "border-run/30 bg-run/10 text-run"
              : "border-border bg-panel-raised text-muted-foreground"
          )}
        >
```

- [ ] **Step 7: Run focused tests**

Run:

```bash
npx jest src/components/file-explorer/__tests__/FileExplorer.test.tsx src/components/layout/__tests__/AppHeader.test.tsx --runInBand
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/components/file-explorer/FileItem.tsx src/components/file-explorer/FolderItem.tsx src/components/layout/AppHeader.tsx src/components/file-explorer/__tests__/FileExplorer.test.tsx src/components/layout/__tests__/AppHeader.test.tsx
git commit -m "test: add stable explorer and runner targets"
```

## Task 2: Controlled Create Dialogs

**Files:**
- Modify: `src/components/file-explorer/NewFileDialog.tsx`
- Modify: `src/components/file-explorer/NewFolderDialog.tsx`
- Modify: `src/components/file-explorer/FileExplorer.tsx`
- Modify: `src/components/file-explorer/__tests__/FileExplorer.test.tsx`

- [ ] **Step 1: Add failing tests for folder-scoped creation**

Update the import from Testing Library in `src/components/file-explorer/__tests__/FileExplorer.test.tsx` to include `fireEvent` and `within`:

```tsx
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
```

Replace `mockFilesTree` with a queue-capable helper:

```tsx
function mockFilesTree(tree: unknown[]) {
  fetchMock.mockResolvedValue({
    ok: true,
    json: async () => ({
      files: [],
      tree,
    }),
  });
}

function mockFetchSequence(...responses: Array<{ ok?: boolean; json?: unknown }>) {
  fetchMock.mockReset();
  for (const response of responses) {
    fetchMock.mockResolvedValueOnce({
      ok: response.ok ?? true,
      json: async () => response.json ?? {},
    });
  }
}
```

Append these tests inside `describe("FileExplorer", () => { ... })`:

```tsx
  it("opens one folder-scoped script dialog and creates the script under that folder", async () => {
    mockFetchSequence(
      {
        json: {
          files: [],
          tree: [
            { path: "auth/", name: "auth", type: "folder", children: [] },
          ],
        },
      },
      { json: { name: "auth/login.ts" } },
      {
        json: {
          files: [],
          tree: [
            {
              path: "auth/",
              name: "auth",
              type: "folder",
              children: [
                { path: "auth/login.ts", name: "login.ts", type: "file" },
              ],
            },
          ],
        },
      }
    );

    render(<FileExplorer selectedFile={null} onSelectFile={jest.fn()} />);

    const folderRow = await screen.findByTestId("sidebar-folder-item");
    fireEvent.click(
      within(folderRow).getByRole("button", { name: "New script here" })
    );

    expect(screen.getAllByRole("button", { name: /new script/i })).toHaveLength(1);

    fireEvent.change(await screen.findByPlaceholderText("my-test.ts"), {
      target: { value: "login" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/files",
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining('"name":"auth/login.ts"'),
        })
      );
    });
  });

  it("normalizes folder delete URLs to a single trailing slash", async () => {
    mockFetchSequence(
      {
        json: {
          files: [],
          tree: [
            { path: "auth/", name: "auth", type: "folder", children: [] },
          ],
        },
      },
      { json: {} },
      { json: { files: [], tree: [] } }
    );

    render(<FileExplorer selectedFile={null} onSelectFile={jest.fn()} />);

    const folderRow = await screen.findByTestId("sidebar-folder-item");
    fireEvent.click(
      within(folderRow).getByRole("button", { name: "Delete folder" })
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/files/auth/", {
        method: "DELETE",
      });
    });
  });
```

- [ ] **Step 2: Run the new FileExplorer tests to verify failure**

Run:

```bash
npx jest src/components/file-explorer/__tests__/FileExplorer.test.tsx --runInBand
```

Expected: FAIL because the current mount-on-demand folder dialog adds a second `New script` trigger when opened from a folder row.

- [ ] **Step 3: Make `NewFileDialog` controlled-compatible**

Replace `src/components/file-explorer/NewFileDialog.tsx` with:

```tsx
"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

interface NewFileDialogProps {
  onCreate: (name: string) => Promise<void>;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onTriggerClick?: () => void;
  showTrigger?: boolean;
}

export function resolveScriptFilename(name: string): string {
  const trimmed = name.trim();
  if (trimmed.endsWith(".ts") || trimmed.endsWith(".js")) {
    return trimmed;
  }
  return `${trimmed}.ts`;
}

export default function NewFileDialog({
  onCreate,
  open,
  onOpenChange,
  onTriggerClick,
  showTrigger = true,
}: NewFileDialogProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const [name, setName] = useState("");
  const isControlled = open !== undefined;
  const dialogOpen = isControlled ? open : internalOpen;

  function handleOpenChange(next: boolean) {
    if (!isControlled) setInternalOpen(next);
    onOpenChange?.(next);
    if (!next) setName("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    const filename = resolveScriptFilename(name);
    await onCreate(filename);
    handleOpenChange(false);
  }

  return (
    <Dialog open={dialogOpen} onOpenChange={handleOpenChange}>
      {showTrigger && (
        <DialogTrigger
          render={
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-xs focus-visible:ring-run/40"
              onClick={onTriggerClick}
            />
          }
        >
          <Plus className="h-3.5 w-3.5" />
          New script
        </DialogTrigger>
      )}
      <DialogContent className="border-border bg-panel-raised">
        <DialogHeader>
          <DialogTitle>New script</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <Input
            placeholder="my-test.ts"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="font-mono text-sm"
            autoFocus
          />
          <Button type="submit">Create</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 4: Make `NewFolderDialog` controlled-compatible**

Replace `src/components/file-explorer/NewFolderDialog.tsx` with:

```tsx
"use client";

import { useState } from "react";
import { FolderPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

interface NewFolderDialogProps {
  onCreate: (path: string) => Promise<void>;
  parentPath?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onTriggerClick?: () => void;
  showTrigger?: boolean;
}

export default function NewFolderDialog({
  onCreate,
  parentPath,
  open,
  onOpenChange,
  onTriggerClick,
  showTrigger = true,
}: NewFolderDialogProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const [name, setName] = useState("");
  const isControlled = open !== undefined;
  const dialogOpen = isControlled ? open : internalOpen;

  function handleOpenChange(next: boolean) {
    if (!isControlled) setInternalOpen(next);
    onOpenChange?.(next);
    if (!next) setName("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    const fullPath = parentPath
      ? `${parentPath.replace(/\/$/, "")}/${trimmed}`
      : trimmed;
    await onCreate(fullPath);
    handleOpenChange(false);
  }

  return (
    <Dialog open={dialogOpen} onOpenChange={handleOpenChange}>
      {showTrigger && (
        <DialogTrigger
          render={
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-xs"
              onClick={onTriggerClick}
            />
          }
        >
          <FolderPlus className="h-3.5 w-3.5" />
          New folder
        </DialogTrigger>
      )}
      <DialogContent className="border-border bg-panel-raised">
        <DialogHeader>
          <DialogTitle>
            {parentPath ? `New folder in ${parentPath}` : "New folder"}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <Input
            placeholder="folder-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="font-mono text-sm"
            autoFocus
          />
          <Button type="submit">Create</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 5: Replace pending dialog state in `FileExplorer`**

In `src/components/file-explorer/FileExplorer.tsx`, replace:

```tsx
  // Pending "create in folder" — holds the parent path while the dialog opens
  const [pendingScriptParent, setPendingScriptParent] = useState<string | null>(null);
  const [pendingFolderParent, setPendingFolderParent] = useState<string | null>(null);
```

with:

```tsx
  const [scriptDialogOpen, setScriptDialogOpen] = useState(false);
  const [scriptDialogParent, setScriptDialogParent] = useState<string | null>(null);
  const [folderDialogOpen, setFolderDialogOpen] = useState(false);
  const [folderDialogParent, setFolderDialogParent] = useState<string | null>(null);
```

Add these helpers after `fetchTree`:

```tsx
  function openScriptDialog(parentPath: string | null) {
    setScriptDialogParent(parentPath);
    setScriptDialogOpen(true);
  }

  function handleScriptDialogOpenChange(open: boolean) {
    setScriptDialogOpen(open);
    if (!open) setScriptDialogParent(null);
  }

  function openFolderDialog(parentPath: string | null) {
    setFolderDialogParent(parentPath);
    setFolderDialogOpen(true);
  }

  function handleFolderDialogOpenChange(open: boolean) {
    setFolderDialogOpen(open);
    if (!open) setFolderDialogParent(null);
  }
```

Update `handleCreateScript` to close the controlled dialog:

```tsx
  async function handleCreateScript(name: string, parentPath?: string) {
    const fullName = parentPath
      ? `${parentPath.replace(/\/$/, "")}/${name}`
      : name;
    await fetch("/api/files", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: fullName, content: DEFAULT_SCRIPT }),
    });
    await fetchTree();
    onSelectFile(fullName);
    handleScriptDialogOpenChange(false);
  }
```

Update `handleCreateFolder` to close the controlled dialog:

```tsx
  async function handleCreateFolder(path: string) {
    await fetch("/api/files/folder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path }),
    });
    await fetchTree();
    handleFolderDialogOpenChange(false);
  }
```

Normalize folder delete:

```tsx
  async function handleDeleteFolder(path: string) {
    const prefix = `${path.replace(/\/+$/, "")}/`;
    await fetch(`/api/files/${prefix}`, { method: "DELETE" });
    await fetchTree();
  }
```

Change folder callbacks inside `renderTree`:

```tsx
            onCreateScript={(parentPath) => openScriptDialog(parentPath)}
            onCreateFolder={(parentPath) => openFolderDialog(parentPath)}
```

Replace the toolbar `actions` block with controlled dialogs:

```tsx
        actions={
          <div className="flex items-center gap-1">
            <NewFileDialog
              open={scriptDialogOpen}
              onOpenChange={handleScriptDialogOpenChange}
              onTriggerClick={() => setScriptDialogParent(null)}
              onCreate={(name) =>
                handleCreateScript(name, scriptDialogParent ?? undefined)
              }
            />
            <NewFolderDialog
              open={folderDialogOpen}
              onOpenChange={handleFolderDialogOpenChange}
              onTriggerClick={() => setFolderDialogParent(null)}
              parentPath={folderDialogParent ?? undefined}
              onCreate={(path) => handleCreateFolder(path)}
            />
          </div>
        }
```

Delete the old hidden dialog block at the bottom:

```tsx
      {/* Hidden dialogs for folder-scoped creation */}
      {pendingScriptParent !== null && (
        <NewFileDialog
          key={`script-${pendingScriptParent}`}
          onCreate={(name) => handleCreateScript(name, pendingScriptParent)}
          defaultOpen
          onClose={() => setPendingScriptParent(null)}
        />
      )}
      {pendingFolderParent !== null && (
        <NewFolderDialog
          key={`folder-${pendingFolderParent}`}
          onCreate={(path) => handleCreateFolder(path)}
          parentPath={pendingFolderParent}
          defaultOpen
          onClose={() => setPendingFolderParent(null)}
        />
      )}
```

- [ ] **Step 6: Run focused dialog tests**

Run:

```bash
npx jest src/components/file-explorer/__tests__/FileExplorer.test.tsx --runInBand
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/components/file-explorer/NewFileDialog.tsx src/components/file-explorer/NewFolderDialog.tsx src/components/file-explorer/FileExplorer.tsx src/components/file-explorer/__tests__/FileExplorer.test.tsx
git commit -m "fix: control file explorer create dialogs"
```

## Task 3: k6 Output Line Buffering

**Files:**
- Modify: `src/lib/k6.ts`
- Modify: `src/lib/__tests__/k6.test.ts`

- [ ] **Step 1: Add a failing unit test for split summary lines**

Append this test inside `describe("runK6 process lifecycle", () => { ... })` in `src/lib/__tests__/k6.test.ts`:

```ts
    it("detects a summary line split across stdout chunks and starts grace shutdown", async () => {
      jest.useFakeTimers();
      const child = makeFakeChild();
      spawnMock.mockReturnValue(child);

      const promise = runK6("/tmp/s.js", "/tmp/r.html", () => {});

      child.stdout.emit("data", Buffer.from("     iteration_"));
      child.stdout.emit("data", Buffer.from("duration.............: avg=29ms\n"));

      jest.advanceTimersByTime(2000);
      expect(child.kill).toHaveBeenCalledWith("SIGTERM");

      child.emit("close", 0);
      await expect(promise).resolves.toBe(0);
      jest.useRealTimers();
    });
```

- [ ] **Step 2: Run the k6 unit test to verify failure**

Run:

```bash
npx jest src/lib/__tests__/k6.test.ts --runInBand
```

Expected: FAIL because current `handleData` checks each raw chunk fragment independently and can miss `iteration_duration` when the chunk boundary splits that token.

- [ ] **Step 3: Buffer stdout and stderr lines before detection**

In `src/lib/k6.ts`, replace the current `handleData` function and stream listeners:

```ts
    function handleData(chunk: Buffer) {
      for (const line of chunk.toString("utf-8").split("\n")) {
        const trimmed = line.trim();
        if (trimmed) {
          onLine(line);
          if (isK6SummaryLine(trimmed)) {
            triggerGrace();
          }
        }
      }
    }

    child.stdout?.on("data", handleData);
    child.stderr?.on("data", handleData);
```

with:

```ts
    let stdoutBuffer = "";
    let stderrBuffer = "";

    function emitLine(line: string) {
      const trimmed = line.trim();
      if (!trimmed) return;
      onLine(line);
      if (isK6SummaryLine(trimmed)) {
        triggerGrace();
      }
    }

    function handleData(chunk: Buffer, streamName: "stdout" | "stderr") {
      const text =
        (streamName === "stdout" ? stdoutBuffer : stderrBuffer) +
        chunk.toString("utf-8");
      const lines = text.split(/\r?\n/);
      const remainder = lines.pop() ?? "";

      if (streamName === "stdout") {
        stdoutBuffer = remainder;
      } else {
        stderrBuffer = remainder;
      }

      for (const line of lines) {
        emitLine(line);
      }
    }

    function flushBufferedLines() {
      if (stdoutBuffer.trim()) emitLine(stdoutBuffer);
      if (stderrBuffer.trim()) emitLine(stderrBuffer);
      stdoutBuffer = "";
      stderrBuffer = "";
    }

    child.stdout?.on("data", (chunk: Buffer) => handleData(chunk, "stdout"));
    child.stderr?.on("data", (chunk: Buffer) => handleData(chunk, "stderr"));
```

Then change the close handler from:

```ts
    child.on("close", (code) => finish(code ?? 1));
```

to:

```ts
    child.on("close", (code) => {
      flushBufferedLines();
      finish(code ?? 1);
    });
```

- [ ] **Step 4: Run focused k6 tests**

Run:

```bash
npx jest src/lib/__tests__/k6.test.ts --runInBand
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/k6.ts src/lib/__tests__/k6.test.ts
git commit -m "fix: detect split k6 summary output"
```

## Task 4: Playwright E2E Selector and Runtime Fixes

**Files:**
- Modify: `e2e/k6-studio.spec.ts`
- Modify: `playwright.config.ts`

- [ ] **Step 1: Confirm targeted Playwright failures before editing**

Run the previously failing non-runner UI tests:

```bash
npx playwright test e2e/k6-studio.spec.ts --project=chromium --grep "create script at root|create folder then create a nested script"
```

Expected before this task's edits: at least one of the two scenarios fails or is flaky because the test actions use global `.first()` button locators.

- [ ] **Step 2: Increase the Playwright timeout**

In `playwright.config.ts`, change:

```ts
  timeout: 90_000,
```

to:

```ts
  timeout: 180_000,
```

- [ ] **Step 3: Replace E2E helpers with stable row/status helpers**

In `e2e/k6-studio.spec.ts`, replace the top helper section with:

```ts
import { test, expect, type Page } from "@playwright/test";

const BASE = "http://localhost:3000";

const SHORT_K6_SCRIPT = `import http from 'k6/http';
import { sleep } from 'k6';

export const options = {
  vus: 1,
  iterations: 1,
};

export default function () {
  http.get('https://test.k6.io');
  sleep(0.1);
}
`;

function fileRow(page: Page, path: string) {
  return page.locator(`[data-testid="sidebar-file-item"][data-path="${path}"]`);
}

function folderRow(page: Page, path: string) {
  return page.locator(`[data-testid="sidebar-folder-item"][data-path="${path}"]`);
}

function runnerStatus(page: Page) {
  return page.getByTestId("active-runner-status");
}

async function waitForRunner(page: Page, activeRunners: 0 | 1, timeout = 90_000) {
  await expect(runnerStatus(page)).toHaveText(
    `Active runner: ${activeRunners}/1`,
    { timeout }
  );
}

async function waitForApp(page: Page) {
  await page.goto(BASE);
  await expect(page.locator("header")).toBeVisible();
  await waitForRunner(page, 0);
}

async function createScript(page: Page, name: string) {
  await page.getByRole("button", { name: /new script/i }).first().click();
  await page.getByPlaceholder("my-test.ts").fill(name);
  await page.getByRole("button", { name: "Create" }).click();
  await expect(fileRow(page, name)).toBeVisible({ timeout: 8000 });
}

async function createScriptViaApi(
  page: Page,
  name: string,
  content = SHORT_K6_SCRIPT
) {
  const response = await page.request.post(`${BASE}/api/files`, {
    data: { name, content },
  });
  expect(response.ok()).toBeTruthy();
  await page.reload();
  await expect(fileRow(page, name)).toBeVisible({ timeout: 8000 });
}

async function createFolder(page: Page, name: string) {
  await page.getByRole("button", { name: /new folder/i }).first().click();
  await page.getByPlaceholder("folder-name").fill(name);
  await page.getByRole("button", { name: "Create" }).click();
  await expect(folderRow(page, `${name}/`)).toBeVisible({ timeout: 5000 });
}

async function selectFile(page: Page, name: string, contentMarker?: string) {
  const fileLoad = page.waitForResponse((response) => {
    return (
      response.request().method() === "GET" &&
      response.url().endsWith(`/api/files/${name}`)
    );
  });

  await fileRow(page, name).click();
  await fileLoad;

  if (contentMarker) {
    await expect(page.locator(".monaco-editor")).toContainText(contentMarker, {
      timeout: 15000,
    });
  }
}
```

- [ ] **Step 4: Update the root delete test**

Replace the body of `test("create script at root, then delete it", ...)` with:

```ts
    await waitForApp(page);
    const name = `e2e-root-${Date.now()}.ts`;
    await createScript(page, name);

    const row = fileRow(page, name);
    await row.hover();
    await row.getByRole("button", { name: "Delete script" }).click();

    await expect(fileRow(page, name)).toHaveCount(0, { timeout: 15000 });
```

- [ ] **Step 5: Update the nested script test**

Replace the body of `test("create folder then create a nested script inside it", ...)` with:

```ts
    await waitForApp(page);
    const folder = `e2e-folder-${Date.now()}`;
    await createFolder(page, folder);

    const row = folderRow(page, `${folder}/`);
    await row.hover();
    await row
      .getByRole("button", { name: "New script here" })
      .click({ force: true });

    await page.getByPlaceholder("my-test.ts").fill("nested.ts");
    await page.getByRole("button", { name: "Create" }).click();

    await expect(fileRow(page, `${folder}/nested.ts`)).toBeVisible({
      timeout: 8000,
    });
```

- [ ] **Step 6: Update the rename test selectors**

Replace the selector usage in `test("double-click renames a script", ...)` with:

```ts
    await waitForApp(page);
    const name = `rename-src-${Date.now()}.ts`;
    const newBaseName = `rename-dst-${Date.now()}`;
    await createScript(page, name);

    await fileRow(page, name).dblclick();
    const input = page.locator("input.w-28").first();
    await input.clear();
    await input.fill(newBaseName);
    await input.press("Enter");

    await expect(fileRow(page, newBaseName)).toBeVisible({ timeout: 5000 });
```

- [ ] **Step 7: Update run tests to use short API-created scripts and runner status target**

Replace the run-lock test body with:

```ts
    await waitForApp(page);
    const name = `lock-test-${Date.now()}.ts`;
    await createScriptViaApi(page, name);
    await selectFile(page, name, "iterations");

    await page.getByRole("button", { name: /run test/i }).click();
    await waitForRunner(page, 1, 10000);
    await waitForRunner(page, 0, 60000);
```

Replace the double-run test body with:

```ts
    test.setTimeout(180_000);
    await waitForApp(page);
    const name = `double-run-${Date.now()}.ts`;
    await createScriptViaApi(page, name);
    await selectFile(page, name, "iterations");

    await page.getByRole("button", { name: /run test/i }).click();
    await waitForRunner(page, 1, 10000);
    await waitForRunner(page, 0, 60000);

    await page.getByRole("button", { name: /run test/i }).click();
    await waitForRunner(page, 1, 10000);
    await page.getByRole("tab", { name: /live dashboard/i }).click();
    await expect(page.locator("iframe[title='k6 Live Dashboard']")).toBeVisible({
      timeout: 35000,
    });
    await waitForRunner(page, 0, 60000);
```

Replace the terminal-stop test body with:

```ts
    await waitForApp(page);
    const name = `term-stop-${Date.now()}.ts`;
    await createScriptViaApi(page, name);
    await selectFile(page, name, "iterations");

    await page.getByRole("button", { name: /run test/i }).click();
    await waitForRunner(page, 0, 60000);
    await expect(page.getByRole("button", { name: /run test/i })).toBeEnabled({
      timeout: 5000,
    });
```

- [ ] **Step 8: Run targeted Playwright tests**

Run:

```bash
npx playwright test e2e/k6-studio.spec.ts --project=chromium --grep "create script at root|create folder then create a nested script|dashboard renders on second consecutive run|terminal stops streaming"
```

Expected: PASS when the app is available on `http://localhost:3000`.

- [ ] **Step 9: Commit**

```bash
git add e2e/k6-studio.spec.ts playwright.config.ts
git commit -m "fix: stabilize k6 studio e2e tests"
```

## Task 5: Docker-Backed MinIO Rename Verification

**Files:**
- Optionally modify: `src/app/api/files/rename/route.ts`

- [ ] **Step 1: Start the Docker stack**

Run:

```bash
docker compose up --build -d
```

Expected: the app and MinIO containers start successfully.

- [ ] **Step 2: Verify the app is reachable**

Run:

```bash
curl -sf http://localhost:3000/api/files
```

Expected: JSON response containing `files` and `tree`.

- [ ] **Step 3: Create a folder and child object through the API**

Use a unique timestamp in the shell:

```bash
STAMP="$(date +%s)"
FOLDER="rename-src-${STAMP}"
TARGET="rename-dst-${STAMP}"
curl -sf -X POST http://localhost:3000/api/files/folder -H 'Content-Type: application/json' -d "{\"path\":\"${FOLDER}\"}"
curl -sf -X POST http://localhost:3000/api/files -H 'Content-Type: application/json' -d "{\"name\":\"${FOLDER}/child.ts\",\"content\":\"export default function () { return null; }\"}"
curl -sf -X POST http://localhost:3000/api/files/rename -H 'Content-Type: application/json' -d "{\"from\":\"${FOLDER}\",\"to\":\"${TARGET}\",\"type\":\"folder\"}"
curl -sf http://localhost:3000/api/files -o /tmp/k6-studio-files.json
FOLDER="${FOLDER}" TARGET="${TARGET}" node -e "const fs=require('fs'); const data=JSON.parse(fs.readFileSync('/tmp/k6-studio-files.json','utf8')); const names=JSON.stringify(data); if (!names.includes(process.env.TARGET + '/child.ts')) throw new Error('renamed child missing'); if (names.includes(process.env.FOLDER + '/child.ts')) throw new Error('old child still present'); console.log('folder rename verified')"
```

Expected: the final command prints `folder rename verified`.

- [ ] **Step 4: If the rename check fails with copyObject source errors, switch to MinIO copy option objects**

If Step 3 fails because `copyObject` rejects or cannot find the source object, replace `src/app/api/files/rename/route.ts` imports with:

```ts
import { NextResponse } from "next/server";
import {
  CopyDestinationOptions,
  CopySourceOptions,
} from "minio";
import { getMinioClient, SCRIPTS_BUCKET, ensureBuckets } from "@/lib/minio";
```

Add this helper before `export async function POST`:

```ts
async function copyScriptObject(
  client: ReturnType<typeof getMinioClient>,
  from: string,
  to: string
) {
  await client.copyObject(
    new CopySourceOptions({
      Bucket: SCRIPTS_BUCKET,
      Object: from,
    }),
    new CopyDestinationOptions({
      Bucket: SCRIPTS_BUCKET,
      Object: to,
    })
  );
}
```

Replace file copy:

```ts
    await client.copyObject(SCRIPTS_BUCKET, to, `/${SCRIPTS_BUCKET}/${from}`);
```

with:

```ts
    await copyScriptObject(client, from, to);
```

Replace folder copy:

```ts
      await client.copyObject(SCRIPTS_BUCKET, newKey, `/${SCRIPTS_BUCKET}/${key}`);
```

with:

```ts
      await copyScriptObject(client, key, newKey);
```

Then run:

```bash
npx tsc --noEmit
docker compose up --build -d
```

Expected: TypeScript passes, the Docker stack rebuilds, and Step 3 prints `folder rename verified`.

- [ ] **Step 5: Commit rename route only if it changed**

If Step 4 changed `src/app/api/files/rename/route.ts`, run:

```bash
git add src/app/api/files/rename/route.ts
git commit -m "fix: use explicit MinIO copy options for rename"
```

If Step 3 passed without code changes, do not create a commit for this task.

## Task 6: Full Verification

**Files:**
- No source edits unless verification reveals a new concrete failure.

- [ ] **Step 1: Run the full Jest suite**

Run:

```bash
npx jest
```

Expected: all Jest tests pass.

- [ ] **Step 2: Run TypeScript verification**

Run:

```bash
npx tsc --noEmit
```

Expected: exits with code 0 and no TypeScript errors.

- [ ] **Step 3: Run the full Playwright Chromium suite**

Run:

```bash
npx playwright test --project=chromium
```

Expected: all seven E2E tests pass.

- [ ] **Step 4: Check final git status**

Run:

```bash
git status --short
```

Expected: only pre-existing unrelated dirty work remains, plus no unstaged files from this implementation.

- [ ] **Step 5: Final handoff**

Report:

- Jest result.
- TypeScript result.
- Playwright result.
- Docker/MinIO rename verification result.
- Any files changed by this implementation.
