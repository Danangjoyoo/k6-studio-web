# File Explorer Progressive Selection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace always-visible explorer move checkboxes with progressive controls plus `Cmd/Ctrl+click`, `Shift+click`, and keyboard selection.

**Architecture:** Keep the server move API unchanged. Move folder expansion state into `FileExplorer` so it can compute a deterministic visible row order for range selection, while `FileItem` and `FolderItem` stay responsible for row rendering, checkbox display, drag/drop callbacks, and keyboard handling.

**Tech Stack:** Next.js App Router, React 19, TypeScript strict mode, Tailwind CSS 4, Jest with React Testing Library, Playwright.

---

## File Structure

- Modify `src/components/file-explorer/FileItem.tsx`
  - Add progressive checkbox visibility props.
  - Add row keyboard selection support.
  - Preserve file open, inline rename, delete, and drag behavior.
- Modify `src/components/file-explorer/FolderItem.tsx`
  - Add optional controlled open state.
  - Add progressive checkbox visibility props.
  - Add row click and keyboard selection hooks.
  - Preserve folder actions, rename, delete, drag, and drop behavior.
- Modify `src/components/file-explorer/FileExplorer.tsx`
  - Track expanded folders centrally.
  - Compute visible rows from the filtered tree.
  - Implement `Cmd/Ctrl+click`, `Shift+click`, and `Space` selection.
  - Pass progressive checkbox visibility to row components.
- Modify `src/components/file-explorer/__tests__/RowItems.test.tsx`
  - Cover row-level progressive checkbox and keyboard behavior.
- Modify `src/components/file-explorer/__tests__/FileExplorer.test.tsx`
  - Replace always-visible checkbox assumptions with modifier/range/keyboard selection tests.
  - Keep drag, active-run, search, scroll, and move tests aligned with the new selection interaction.
- Modify `e2e/k6-studio.spec.ts`
  - Update active-run protection to check disabled move control after hover and keep the no-move drag assertion.

---

### Task 1: Row Components Progressive Controls

**Files:**
- Modify: `src/components/file-explorer/FileItem.tsx`
- Modify: `src/components/file-explorer/FolderItem.tsx`
- Test: `src/components/file-explorer/__tests__/RowItems.test.tsx`

- [ ] **Step 1: Write failing row tests**

In `src/components/file-explorer/__tests__/RowItems.test.tsx`, replace the first two checkbox tests and add the keyboard/controlled-open cases below.

```tsx
it("file row keeps the checkbox mounted but visually hidden until selection controls are active", () => {
  renderFileItem({
    isSelectionChecked: false,
    onSelectionChange: jest.fn(),
  });

  const row = screen.getByTestId("sidebar-file-item");
  const control = within(row).getByTestId("row-selection-control");
  const checkbox = within(row).getByRole("checkbox", {
    name: "Select login.ts",
  });

  expect(checkbox).not.toBeChecked();
  expect(control).toHaveAttribute("data-selection-visible", "false");
  expect(control).toHaveClass("opacity-0");
});

it("selected file row shows the checkbox and exposes aria-selected", () => {
  renderFileItem({
    isSelectionChecked: true,
    onSelectionChange: jest.fn(),
  });

  const row = screen.getByTestId("sidebar-file-item");
  const control = within(row).getByTestId("row-selection-control");

  expect(row).toHaveAttribute("aria-selected", "true");
  expect(control).toHaveAttribute("data-selection-visible", "true");
  expect(control).toHaveClass("opacity-100");
});

it("file row checkbox toggles callback and does not select the file", () => {
  const onClick = jest.fn();
  const onSelectionChange = jest.fn();
  renderFileItem({
    onClick,
    isSelectionChecked: false,
    showSelectionControl: true,
    onSelectionChange,
  });

  const row = screen.getByTestId("sidebar-file-item");
  const checkbox = within(row).getByRole("checkbox", {
    name: "Select login.ts",
  });

  fireEvent.click(checkbox);

  expect(onSelectionChange).toHaveBeenCalledWith(true, "src/login.ts");
  expect(onClick).not.toHaveBeenCalled();
});

it("folder row checkbox toggles callback and does not expand or collapse", () => {
  const onSelectionChange = jest.fn();
  const onToggleOpen = jest.fn();
  renderFolderItem({
    isOpen: true,
    onToggleOpen,
    isSelectionChecked: false,
    showSelectionControl: true,
    onSelectionChange,
  });

  const row = screen.getByTestId("sidebar-folder-item");
  const checkbox = within(row).getByRole("checkbox", {
    name: "Select src",
  });

  fireEvent.click(checkbox);

  expect(onSelectionChange).toHaveBeenCalledWith(true, "src/");
  expect(onToggleOpen).not.toHaveBeenCalled();
  expect(screen.getByText("child content")).toBeInTheDocument();
});

it("space toggles row selection while enter keeps the primary action", () => {
  const onClick = jest.fn();
  const onSelectionToggle = jest.fn();
  renderFileItem({
    onClick,
    onSelectionToggle,
    onSelectionChange: jest.fn(),
  });

  const fileRow = screen.getByTestId("sidebar-file-item");
  fireEvent.keyDown(fileRow, { key: " ", code: "Space" });
  fireEvent.keyDown(fileRow, { key: "Enter", code: "Enter" });

  expect(onSelectionToggle).toHaveBeenCalledWith("src/login.ts");
  expect(onClick).toHaveBeenCalledTimes(1);
});

it("controlled folder rows call onToggleOpen for primary actions", () => {
  const onToggleOpen = jest.fn();
  renderFolderItem({
    isOpen: true,
    onToggleOpen,
  });

  const folderRow = screen.getByTestId("sidebar-folder-item");
  fireEvent.click(folderRow);
  fireEvent.keyDown(folderRow, { key: "Enter", code: "Enter" });

  expect(onToggleOpen).toHaveBeenCalledTimes(2);
  expect(screen.getByText("child content")).toBeInTheDocument();
});
```

- [ ] **Step 2: Run row tests and confirm failure**

Run:

```bash
npx jest src/components/file-explorer/__tests__/RowItems.test.tsx --runInBand
```

Expected: FAIL because `row-selection-control`, `showSelectionControl`, `onSelectionToggle`, `isOpen`, and `onToggleOpen` are not implemented yet.

- [ ] **Step 3: Implement progressive controls in `FileItem`**

In `src/components/file-explorer/FileItem.tsx`, update the props and row keyboard/checkbox rendering.

```tsx
interface FileItemProps {
  name: string;
  path: string;
  depth?: number;
  isSelected: boolean;
  onClick: (event: React.MouseEvent<HTMLDivElement>) => void;
  onDelete: () => void;
  onRename: (newPath: string) => Promise<void>;
  isSelectionChecked?: boolean;
  isSelectionDisabled?: boolean;
  showSelectionControl?: boolean;
  onSelectionChange?: (checked: boolean, path: string) => void;
  onSelectionToggle?: (path: string) => void;
  isDragEnabled?: boolean;
  isDragDisabled?: boolean;
  isDropActive?: boolean;
  isDropDisabled?: boolean;
  onRowDragStart?: (path: string, event: React.DragEvent<HTMLDivElement>) => void;
  onRowDragOver?: (path: string, event: React.DragEvent<HTMLDivElement>) => void;
  onRowDrop?: (path: string, event: React.DragEvent<HTMLDivElement>) => void;
  onRowDragEnd?: (path: string, event: React.DragEvent<HTMLDivElement>) => void;
  onRowDragLeave?: (path: string, event: React.DragEvent<HTMLDivElement>) => void;
}
```

Use this visibility helper inside the component:

```tsx
const selectionVisible =
  Boolean(showSelectionControl) || Boolean(isSelectionChecked);
```

Set selected accessibility state on the root row:

```tsx
aria-selected={isSelectionChecked ? true : undefined}
onClick={onClick}
onKeyDown={(e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    onClick(e as unknown as React.MouseEvent<HTMLDivElement>);
    return;
  }
  if (e.key === " " && onSelectionToggle && !isSelectionDisabled) {
    e.preventDefault();
    onSelectionToggle(path);
  }
}}
```

Replace the checkbox wrapper with:

```tsx
<span
  data-testid="row-selection-control"
  data-selection-visible={selectionVisible ? "true" : "false"}
  className={cn(
    "flex h-4 w-4 shrink-0 items-center justify-center transition-opacity",
    selectionVisible
      ? "pointer-events-auto opacity-100"
      : "pointer-events-none opacity-0 group-hover:pointer-events-auto group-hover:opacity-100 group-focus:pointer-events-auto group-focus:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100"
  )}
  onClick={(e) => e.stopPropagation()}
  onDoubleClick={(e) => e.stopPropagation()}
  onKeyDown={(e) => e.stopPropagation()}
>
  <input
    type="checkbox"
    aria-label={`Select ${name}`}
    checked={Boolean(isSelectionChecked)}
    disabled={isSelectionDisabled}
    className={cn(
      "h-3.5 w-3.5 rounded border-border accent-primary",
      isSelectionDisabled && "cursor-not-allowed opacity-50"
    )}
    onChange={handleSelectionChange}
  />
</span>
```

- [ ] **Step 4: Implement controlled open and progressive controls in `FolderItem`**

In `src/components/file-explorer/FolderItem.tsx`, add these props:

```tsx
  isOpen?: boolean;
  onToggleOpen?: () => void;
  onRowClick?: (event: React.MouseEvent<HTMLDivElement>) => void;
  showSelectionControl?: boolean;
  onSelectionToggle?: (path: string) => void;
```

Replace the open state with a controlled fallback:

```tsx
const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen);
const open = isOpen ?? uncontrolledOpen;

function toggleOpen() {
  if (onToggleOpen) {
    onToggleOpen();
    return;
  }
  setUncontrolledOpen((value) => !value);
}

function handleRowClick(event: React.MouseEvent<HTMLDivElement>) {
  if (editing) return;
  if (onRowClick) {
    onRowClick(event);
    return;
  }
  toggleOpen();
}
```

Use this visibility helper inside the component:

```tsx
const selectionVisible =
  Boolean(showSelectionControl) || Boolean(isSelectionChecked);
```

Set selected accessibility state on the root folder row:

```tsx
aria-selected={isSelectionChecked ? true : undefined}
```

Replace the folder checkbox wrapper with:

```tsx
<span
  data-testid="row-selection-control"
  data-selection-visible={selectionVisible ? "true" : "false"}
  className={cn(
    "flex h-4 w-4 shrink-0 items-center justify-center transition-opacity",
    selectionVisible
      ? "pointer-events-auto opacity-100"
      : "pointer-events-none opacity-0 group-hover:pointer-events-auto group-hover:opacity-100 group-focus:pointer-events-auto group-focus:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100"
  )}
  onClick={(e) => e.stopPropagation()}
  onDoubleClick={(e) => e.stopPropagation()}
  onKeyDown={(e) => e.stopPropagation()}
>
  <input
    type="checkbox"
    aria-label={`Select ${name}`}
    checked={Boolean(isSelectionChecked)}
    disabled={isSelectionDisabled}
    className={cn(
      "h-3.5 w-3.5 rounded border-border accent-primary",
      isSelectionDisabled && "cursor-not-allowed opacity-50"
    )}
    onChange={handleSelectionChange}
  />
</span>
```

The folder row keyboard handler should be:

```tsx
onKeyDown={(e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    toggleOpen();
    return;
  }
  if (e.key === " " && onSelectionToggle && !isSelectionDisabled) {
    e.preventDefault();
    onSelectionToggle(path);
  }
}}
```

- [ ] **Step 5: Run row tests and confirm pass**

Run:

```bash
npx jest src/components/file-explorer/__tests__/RowItems.test.tsx --runInBand
```

Expected: PASS.

- [ ] **Step 6: Commit row component changes**

Run:

```bash
git add src/components/file-explorer/FileItem.tsx src/components/file-explorer/FolderItem.tsx src/components/file-explorer/__tests__/RowItems.test.tsx
git commit -m "feat: add progressive explorer row selection controls"
```

---

### Task 2: Explorer Modifier And Range Selection

**Files:**
- Modify: `src/components/file-explorer/FileExplorer.tsx`
- Test: `src/components/file-explorer/__tests__/FileExplorer.test.tsx`

- [ ] **Step 1: Write failing explorer selection tests**

In `src/components/file-explorer/__tests__/FileExplorer.test.tsx`, replace `renders row checkboxes and selects multiple items without selecting file rows` with:

```tsx
it("ctrl-click toggles move selection without selecting file rows", async () => {
  const onSelectFile = jest.fn();
  mockFilesTree(scriptsTree());

  render(<FileExplorer selectedFile={null} onSelectFile={onSelectFile} />);

  const fileRow = await rowByPath("src/a.ts");
  const folderRow = await rowByPath("other/");

  fireEvent.click(fileRow, { ctrlKey: true });
  fireEvent.click(folderRow, { ctrlKey: true });

  expect(within(fileRow).getByRole("checkbox", { name: "Select a.ts" })).toBeChecked();
  expect(within(folderRow).getByRole("checkbox", { name: "Select other" })).toBeChecked();
  expect(onSelectFile).not.toHaveBeenCalled();
});
```

Add these helpers near the existing test helpers:

```tsx
async function rowByPath(rowPath: string) {
  await screen.findByText(rowPath.split("/").filter(Boolean).pop() ?? rowPath);
  const testId = rowPath.endsWith("/") ? "sidebar-folder-item" : "sidebar-file-item";
  const row = screen
    .getAllByTestId(testId)
    .find((item) => item.getAttribute("data-path") === rowPath);
  if (!row) throw new Error(`row not found: ${rowPath}`);
  return row;
}

async function ctrlClickRow(rowPath: string) {
  fireEvent.click(await rowByPath(rowPath), { ctrlKey: true });
}
```

Add range and keyboard tests:

```tsx
it("shift-click selects a visible range and drag posts selected files", async () => {
  moveFetchSequence(scriptsTree());

  render(<FileExplorer selectedFile={null} onSelectFile={jest.fn()} />);

  const first = await rowByPath("src/a.ts");
  const second = await rowByPath("src/b.ts");
  fireEvent.click(first, { ctrlKey: true });
  fireEvent.click(second, { shiftKey: true });
  await dragRowToFolder("src/a.ts", "dest/");

  await waitFor(() => {
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/files/move",
      expect.objectContaining({ method: "POST" })
    );
  });
  expect(lastFetchBody()).toEqual({
    items: [
      { path: "src/a.ts", type: "file" },
      { path: "src/b.ts", type: "file" },
    ],
    targetFolder: "dest",
  });
});

it("space toggles move selection for a focused file row", async () => {
  mockFilesTree(scriptsTree());

  render(<FileExplorer selectedFile={null} onSelectFile={jest.fn()} />);

  const fileRow = await rowByPath("src/a.ts");
  fireEvent.keyDown(fileRow, { key: " ", code: "Space" });

  expect(within(fileRow).getByRole("checkbox", { name: "Select a.ts" })).toBeChecked();
});

it("shift-click range skips running-script rows", async () => {
  mockFilesTree(activeRunTree());

  render(
    <FileExplorer
      selectedFile={null}
      onSelectFile={jest.fn()}
      globalRunningScript="suite/run.ts"
    />
  );

  const suiteRow = await rowByPath("suite/");
  const otherRow = await rowByPath("other.ts");
  fireEvent.click(suiteRow, { ctrlKey: true });
  fireEvent.click(otherRow, { shiftKey: true });

  expect(within(suiteRow).getByRole("checkbox", { name: "Select suite" })).toBeDisabled();
  expect(within(screen.getByText("run.ts").closest("[data-testid='sidebar-file-item']") as HTMLElement).getByRole("checkbox", { name: "Select run.ts" })).toBeDisabled();
  expect(within(otherRow).getByRole("checkbox", { name: "Select other.ts" })).toBeChecked();
});
```

Update existing bulk-selection setup in this file:

```tsx
await selectCheckbox("Select a.ts");
await selectCheckbox("Select other");
```

to:

```tsx
await ctrlClickRow("src/a.ts");
await ctrlClickRow("other/");
```

For tests that intentionally use checkboxes, pass through hover/visible behavior by keeping `selectCheckbox` but make it focus the row first:

```tsx
async function selectCheckbox(name: string) {
  const checkbox = await screen.findByRole("checkbox", { name });
  const row = checkbox.closest("[data-testid='sidebar-file-item'],[data-testid='sidebar-folder-item']");
  if (row) fireEvent.focus(row);
  fireEvent.click(checkbox);
}
```

- [ ] **Step 2: Run explorer tests and confirm failure**

Run:

```bash
npx jest src/components/file-explorer/__tests__/FileExplorer.test.tsx --runInBand
```

Expected: FAIL because modifier clicks, range selection, centralized expansion state, and row keyboard selection are not wired in `FileExplorer`.

- [ ] **Step 3: Add centralized expansion and visible-row helpers**

In `src/components/file-explorer/FileExplorer.tsx`, update the React import:

```tsx
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
```

Add state:

```tsx
const [expandedFolders, setExpandedFolders] = useState<Set<string>>(() => new Set());
const [lastSelectionKey, setLastSelectionKey] = useState<string | null>(null);
```

Inside `fetchTree`, after `setTree(nextTree)`, add newly discovered folders as open by default:

```tsx
setExpandedFolders((current) => {
  const next = new Set(current);
  for (const folderPath of flattenFolderPaths(nextTree)) {
    next.add(folderPath);
  }
  return next;
});
```

Add helpers below `flattenSelectionKeys`:

```tsx
interface VisibleMoveRow extends MoveSelection {
  key: string;
  disabled: boolean;
}

function flattenFolderPaths(nodes: FileNode[]): string[] {
  const paths: string[] = [];
  for (const node of nodes) {
    if (node.type !== "folder") continue;
    const folderPath = normalizeFolderPath(node.path);
    paths.push(folderPath);
    paths.push(...flattenFolderPaths(node.children ?? []));
  }
  return paths;
}

function collectVisibleMoveRows(
  nodes: FileNode[],
  expandedFolders: Set<string>,
  runningScript: string | null
): VisibleMoveRow[] {
  const rows: VisibleMoveRow[] = [];
  for (const node of nodes) {
    if (node.type === "folder") {
      const item: MoveSelection = {
        path: normalizeFolderPath(node.path),
        type: "folder",
      };
      rows.push({
        ...item,
        key: selectionKey(item),
        disabled: isMovementDisabled(item, runningScript),
      });
      if (expandedFolders.has(item.path)) {
        rows.push(
          ...collectVisibleMoveRows(
            node.children ?? [],
            expandedFolders,
            runningScript
          )
        );
      }
    } else {
      const item: MoveSelection = { path: node.path, type: "file" };
      rows.push({
        ...item,
        key: selectionKey(item),
        disabled: isMovementDisabled(item, runningScript),
      });
    }
  }
  return rows;
}
```

Create visible rows after `filteredTree`:

```tsx
const filteredTree = filterTree(tree, query);
const visibleMoveRows = useMemo(
  () => collectVisibleMoveRows(filteredTree, expandedFolders, globalRunningScript),
  [filteredTree, expandedFolders, globalRunningScript]
);
const showSelectionControls = Object.keys(selection).length > 0;
```

- [ ] **Step 4: Add modifier, range, and keyboard selection handlers**

In `FileExplorer`, add:

```tsx
function toggleMoveSelection(item: MoveSelection) {
  if (isMovementDisabled(item, globalRunningScript)) return;
  const key = selectionKey(item);
  setMoveStatus(null);
  setLastSelectionKey(key);
  setSelection((current) => {
    const next = { ...current };
    if (next[key]) delete next[key];
    else next[key] = item;
    return next;
  });
}

function selectVisibleRange(item: MoveSelection) {
  if (isMovementDisabled(item, globalRunningScript)) return;
  const itemKey = selectionKey(item);
  const startKey = lastSelectionKey ?? itemKey;
  const startIndex = visibleMoveRows.findIndex((row) => row.key === startKey);
  const endIndex = visibleMoveRows.findIndex((row) => row.key === itemKey);
  if (startIndex === -1 || endIndex === -1) {
    toggleMoveSelection(item);
    return;
  }

  const [from, to] =
    startIndex < endIndex ? [startIndex, endIndex] : [endIndex, startIndex];
  setMoveStatus(null);
  setLastSelectionKey(itemKey);
  setSelection((current) => {
    const next = { ...current };
    for (const row of visibleMoveRows.slice(from, to + 1)) {
      if (row.disabled) continue;
      next[row.key] = { path: row.path, type: row.type };
    }
    return next;
  });
}

function handleRowSelectionIntent(
  item: MoveSelection,
  disabled: boolean,
  event: React.MouseEvent<HTMLDivElement>,
  primaryAction: () => void
) {
  if (event.shiftKey) {
    event.preventDefault();
    event.stopPropagation();
    if (!disabled) selectVisibleRange(item);
    return;
  }
  if (event.metaKey || event.ctrlKey) {
    event.preventDefault();
    event.stopPropagation();
    if (!disabled) toggleMoveSelection(item);
    return;
  }
  primaryAction();
}

function toggleFolderOpen(path: string) {
  const folderPath = normalizeFolderPath(path);
  setExpandedFolders((current) => {
    const next = new Set(current);
    if (next.has(folderPath)) next.delete(folderPath);
    else next.add(folderPath);
    return next;
  });
}
```

- [ ] **Step 5: Pass the new row props during render**

For folder rows in `renderTree`, pass controlled open and modifier click props:

```tsx
const folderPath = normalizeFolderPath(node.path);
const disabled = isMovementDisabled(item, globalRunningScript);
const isOpen = expandedFolders.has(folderPath);
```

Add these props to the existing `<FolderItem>` element:

```tsx
isOpen={isOpen}
onToggleOpen={() => toggleFolderOpen(node.path)}
onRowClick={(event) =>
  handleRowSelectionIntent(item, disabled, event, () => toggleFolderOpen(node.path))
}
onSelectionToggle={() => toggleMoveSelection(item)}
showSelectionControl={showSelectionControls}
```

Replace the existing folder children expression with:

```tsx
{isOpen && node.children && node.children.length > 0
  ? renderTree(node.children, depth + 1)
  : isOpen && (
    <p
      className="py-1 font-mono text-[10px] text-muted-foreground"
      style={{ paddingLeft: `${1.5 + (depth + 1) * 1}rem` }}
    >
      Empty folder
    </p>
  )}
```

For file rows, pass modifier click and keyboard selection:

Add these props to the existing `<FileItem>` element:

```tsx
onClick={(event) =>
  handleRowSelectionIntent(item, disabled, event, () => onSelectFile(node.path))
}
onSelectionToggle={() => toggleMoveSelection(item)}
showSelectionControl={showSelectionControls}
```

- [ ] **Step 6: Run explorer tests and confirm pass**

Run:

```bash
npx jest src/components/file-explorer/__tests__/FileExplorer.test.tsx --runInBand
```

Expected: PASS.

- [ ] **Step 7: Commit explorer selection changes**

Run:

```bash
git add src/components/file-explorer/FileExplorer.tsx src/components/file-explorer/__tests__/FileExplorer.test.tsx
git commit -m "feat: support explorer modifier range selection"
```

---

### Task 3: E2E Active-Run Selection Assertion

**Files:**
- Modify: `e2e/k6-studio.spec.ts`

- [ ] **Step 1: Write the E2E expectation for progressive controls**

In the `running script cannot be moved` test, replace the always-visible checkbox assertion:

```ts
await expect(
  fileRow(page, script).locator("input[type='checkbox']")
).toBeDisabled();
```

with:

```ts
const runningMoveControl = fileRow(page, script).getByTestId("row-selection-control");
await expect(runningMoveControl).toHaveCSS("opacity", "0");
await fileRow(page, script).hover();
const runningMoveCheckbox = fileRow(page, script).locator("input[type='checkbox']");
await expect(runningMoveControl).toHaveCSS("opacity", "1");
await expect(runningMoveCheckbox).toBeDisabled();
```

- [ ] **Step 2: Run the focused E2E test and confirm failure before implementation is complete**

If Task 2 has not been implemented yet, run:

```bash
PLAYWRIGHT_BASE_URL=http://localhost:3000 npx playwright test e2e/k6-studio.spec.ts --project=chromium -g "running script cannot be moved"
```

Expected: FAIL before the progressive row opacity implementation because the move control is not hidden by default. If the app is not running, start it with Docker Compose before the final E2E run in Task 4.

- [ ] **Step 3: Keep the drag protection assertion unchanged**

Leave this block in place:

```ts
await expectNoMoveRequestDuring(page, async () => {
  try {
    await fileRow(page, script).dragTo(folderRow(page, `${folder}/`), {
      timeout: 2000,
    });
  } catch {
    // A disabled drag source may reject before any browser drag events fire.
  }
});
await expect(fileRow(page, script)).toBeVisible();
await expect(fileRow(page, `${folder}/${script}`)).toHaveCount(0);
```

- [ ] **Step 4: Commit E2E assertion update**

Run:

```bash
git add e2e/k6-studio.spec.ts
git commit -m "test: update active run explorer selection e2e"
```

---

### Task 4: Zero-Width Hidden Selection Controls

**Files:**
- Modify: `src/components/file-explorer/FileItem.tsx`
- Modify: `src/components/file-explorer/FolderItem.tsx`
- Test: `src/components/file-explorer/__tests__/RowItems.test.tsx`
- Test: `e2e/k6-studio.spec.ts`

- [ ] **Step 1: Write failing row layout tests**

In `src/components/file-explorer/__tests__/RowItems.test.tsx`, update the hidden-control expectations to assert zero-width layout:

```tsx
expect(control).toHaveAttribute("data-selection-visible", "false");
expect(control).toHaveClass("w-0");
expect(control).toHaveClass("opacity-0");
```

Update visible-control expectations to assert the existing width appears only when visible:

```tsx
expect(control).toHaveAttribute("data-selection-visible", "true");
expect(control).toHaveClass("w-4");
expect(control).toHaveClass("opacity-100");
```

Add folder coverage:

```tsx
it("folder row does not reserve checkbox width while selection control is hidden", () => {
  renderFolderItem({
    isSelectionChecked: false,
    onSelectionChange: jest.fn(),
  });

  const row = screen.getByTestId("sidebar-folder-item");
  const control = within(row).getByTestId("row-selection-control");

  expect(control).toHaveAttribute("data-selection-visible", "false");
  expect(control).toHaveClass("w-0");
  expect(control).toHaveClass("opacity-0");
});
```

- [ ] **Step 2: Run row tests and confirm failure**

Run:

```bash
npx jest src/components/file-explorer/__tests__/RowItems.test.tsx --runInBand
```

Expected: FAIL because hidden controls still reserve `w-4`.

- [ ] **Step 3: Collapse hidden checkbox wrappers to zero width**

In both `FileItem.tsx` and `FolderItem.tsx`, change the `row-selection-control` class logic from always reserving `w-4` to reserving width only when visible:

```tsx
className={cn(
  "flex h-4 shrink-0 items-center justify-center overflow-hidden transition-[width,opacity]",
  selectionVisible
    ? "pointer-events-auto w-4 opacity-100"
    : "pointer-events-none w-0 opacity-0 group-hover:pointer-events-auto group-hover:w-4 group-hover:opacity-100 group-focus:pointer-events-auto group-focus:w-4 group-focus:opacity-100 group-focus-within:pointer-events-auto group-focus-within:w-4 group-focus-within:opacity-100"
)}
```

Keep the checkbox input mounted and unchanged. Do not change selection state, drag/drop, or move behavior.

- [ ] **Step 4: Update E2E opacity assertion to cover zero-width hidden state**

In `e2e/k6-studio.spec.ts`, extend the active-run progressive control assertion:

```ts
await expect(runningMoveControl).toHaveCSS("opacity", "0");
await expect(runningMoveControl).toHaveCSS("width", "0px");
await fileRow(page, script).hover();
...
await expect(runningMoveControl).toHaveCSS("opacity", "1");
await expect(runningMoveControl).not.toHaveCSS("width", "0px");
```

- [ ] **Step 5: Run focused tests**

Run:

```bash
npx jest src/components/file-explorer/__tests__/RowItems.test.tsx --runInBand
```

Expected: PASS.

If the app is running, run:

```bash
PLAYWRIGHT_BASE_URL=http://localhost:3000 npx playwright test e2e/k6-studio.spec.ts --project=chromium -g "running script cannot be moved"
```

Expected: PASS.

- [ ] **Step 6: Commit**

Run:

```bash
git add src/components/file-explorer/FileItem.tsx src/components/file-explorer/FolderItem.tsx src/components/file-explorer/__tests__/RowItems.test.tsx e2e/k6-studio.spec.ts
git commit -m "fix: collapse hidden explorer selection controls"
```

---

### Task 5: Verification And Cleanup

**Files:**
- Verify all modified files.
- No new production files expected.

- [ ] **Step 1: Run focused row and explorer tests**

Run:

```bash
npx jest src/components/file-explorer/__tests__/RowItems.test.tsx src/components/file-explorer/__tests__/FileExplorer.test.tsx --runInBand
```

Expected: PASS.

- [ ] **Step 2: Run full Jest suite**

Run:

```bash
npx jest --runInBand
```

Expected: PASS.

- [ ] **Step 3: Run TypeScript**

Run:

```bash
npx tsc --noEmit
```

Expected: PASS with no TypeScript errors.

- [ ] **Step 4: Run lint**

Run:

```bash
npm run lint
```

Expected: PASS with no ESLint errors.

- [ ] **Step 5: Run production build**

Run:

```bash
npm run build
```

Expected: PASS and produce a production Next.js build.

- [ ] **Step 6: Run focused Playwright coverage**

Ensure Docker Compose is running the app on port `3000`:

```bash
docker compose up --build -d
```

Then run:

```bash
PLAYWRIGHT_BASE_URL=http://localhost:3000 npx playwright test e2e/k6-studio.spec.ts --project=chromium -g "drag moves|duplicate move|history remains|running script cannot"
```

Expected: PASS.

- [ ] **Step 7: Check the worktree and diff hygiene**

Run:

```bash
git diff --check
git status --short
```

Expected: `git diff --check` prints nothing. `git status --short` shows only intentional files if a final verification note needs committing, otherwise it is clean.

- [ ] **Step 8: Commit any final test-only cleanup**

If Task 4 required adjustments, commit them:

```bash
git add src/components/file-explorer/FileItem.tsx src/components/file-explorer/FolderItem.tsx src/components/file-explorer/FileExplorer.tsx src/components/file-explorer/__tests__/RowItems.test.tsx src/components/file-explorer/__tests__/FileExplorer.test.tsx e2e/k6-studio.spec.ts
git commit -m "test: verify progressive explorer selection"
```

If there are no changes, do not create an empty commit.

---

## Self-Review Checklist

- Spec coverage:
  - Progressive default-hidden checkboxes: Task 1.
  - Hover/focus/selected/selection-active visibility: Task 1 and Task 2.
  - `Cmd/Ctrl+click`: Task 2.
  - `Shift+click` visible range: Task 2.
  - Normal file/folder click behavior: Task 1 and Task 2.
  - Drag selected vs unselected item behavior: existing tests retained in Task 2.
  - Active-run move protection: Task 2 and Task 3.
  - Existing create/delete/rename/search/scroll/drop behavior: existing tests retained and full verification in Task 4.
- Placeholder scan: no placeholder implementation steps.
- Type consistency:
  - `showSelectionControl`, `onSelectionToggle`, `isOpen`, `onToggleOpen`, and `onRowClick` are introduced in row props before `FileExplorer` uses them.
  - `VisibleMoveRow` extends `MoveSelection` and uses existing `selectionKey`.
  - Folder paths continue to normalize through `normalizeFolderPath`.
