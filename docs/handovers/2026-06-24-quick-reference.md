# Handover Quick Reference — k6 Studio

## Status at handover

| Todo ID | Description | Status |
|---------|-------------|--------|
| debug-repro | Reproduce H1/H2 bugs | ✅ done |
| run-lock | `src/lib/run-lock.ts` + tests | ✅ done |
| k6-lifecycle | `src/lib/k6.ts` grace-SIGTERM + waitForPortFree | ✅ done |
| run-route-lock | `/api/run` 409 + lock release | ✅ done |
| status-endpoint | `GET /api/run/status` | ✅ done |
| context-poll | Context polls status, exposes globalRunning/globalRunningScript | ✅ done |
| editor-dashboard-lock | EditorTab disable + LiveDashboardTab server-keyed | ✅ done |
| files-api-folders | Catch-all route + folder/rename endpoints + buildTree | ✅ done |
| explorer-tree | Collapsible tree + top create buttons + FolderItem | ✅ done |
| inline-rename | Double-click rename for files and folders | ✅ done |
| path-propagation | ScriptEditor uses raw path, run route uses basename | ✅ done |
| branding | k6 logo in header + favicon + Active runner pill | ✅ done |
| **verify** | **Jest ✅ (70/70) · Docker ✅ · Playwright ❌ (3/7 pass)** | **🔴 in progress** |

## Playwright failures to fix

### 1. Delete test (`create script at root, then delete it`)
File stays visible in sidebar after delete. The locator `[class*="font-mono"][class*="truncate"]` might be matching a stale element. Add `data-testid` to `FileItem` div and use that in the test.

### 2. Nested folder script (`create folder then create a nested script inside it`)
After clicking "New script here" in a folder, `getByPlaceholder("my-test.ts")` is never found. The current implementation mounts a new `<NewFileDialog defaultOpen>` via pending state. Refactor to a **single always-mounted fully-controlled dialog**:
```tsx
// FileExplorer state
const [createScriptOpen, setCreateScriptOpen] = useState(false);
const [createScriptParent, setCreateScriptParent] = useState<string|null>(null);

// FolderItem callback
onCreateScript={(path) => { setCreateScriptParent(path); setCreateScriptOpen(true); }}

// Always-mounted dialog (add open/onOpenChange to NewFileDialog)
<NewFileDialog open={createScriptOpen} onOpenChange={setCreateScriptOpen}
  onCreate={(name) => handleCreateScript(name, createScriptParent ?? undefined)} />
```

### 3. Active runner text not found (`dashboard 2nd run`, `terminal stops`)
`getByText(/Active runner: 0\/1/i)` returns "element not found". In `AppHeader`, when not running the pill renders:
```tsx
<span>Active runner: {activeRunners}/1</span>
```
Try `page.locator('header').locator('text=Active runner: 0/1')` instead of `getByText(regex)`. Also: increase global Playwright timeout from 90s to 180s in `playwright.config.ts`.

## Commands
```bash
npx jest                                    # 70/70 pass
npx tsc --noEmit                            # clean
docker compose up --build -d               # rebuild
npx playwright test --project=chromium     # 3/7 pass → fix to 7/7
```

## Key new files
```
src/lib/run-lock.ts            ← global in-process run cap
src/lib/files-tree.ts          ← buildTree() helper
src/lib/k6.ts                  ← isK6SummaryLine + waitForPortFree
src/app/api/run/status/route.ts ← GET /api/run/status
src/app/api/files/[...path]/route.ts ← catch-all (replaces [name])
src/app/api/files/folder/route.ts  ← POST creates .keep sentinel
src/app/api/files/rename/route.ts  ← POST { from, to, type }
src/app/icon.tsx               ← App Router favicon
src/components/file-explorer/FolderItem.tsx ← collapsible folder node
src/components/file-explorer/NewFolderDialog.tsx
e2e/k6-studio.spec.ts          ← Playwright E2E (7 scenarios)
playwright.config.ts
```
