# Task 6 Report: Editor Tab Assembly

**Status:** Complete  
**Branch:** feat/k6-studio-web  
**Commit:** b1713e9  
**Base commit:** 1fce96d (Task 5)

## Summary

Wired `ScriptEditor`, `Terminal`, and a Run/Save toolbar into `EditorTab`. Run auto-saves via `editorRef.save()` then calls `useK6Runner().run(filename)`. Save button and Cmd/Ctrl+S (via ScriptEditor) update save-status indicator.

## Files Created

| File | Purpose |
|------|---------|
| `k6-studio-web/src/components/tabs/EditorTab.tsx` | Editor tab layout: toolbar, Monaco editor, terminal |
| `k6-studio-web/src/components/tabs/__tests__/EditorTab.test.tsx` | Placeholder + editor/terminal render tests |

## TDD Steps Followed

1. Wrote failing tests → confirmed `Could not locate module @/components/tabs/EditorTab`
2. Implemented `EditorTab.tsx` per brief
3. EditorTab tests PASS (2/2)
4. Smoke-tested via temporary `page.tsx` + FileExplorer (reverted before commit)
5. Committed EditorTab files only

## Test Results

### Unit Tests

```
Test Suites: 5 passed, 5 total
Tests:       6 passed, 6 total
```

- `EditorTab.test.tsx` — placeholder when `filename=null`; editor + terminal when file selected
- `ScriptEditor.test.tsx` — regression (Task 4)
- `FileExplorer.test.tsx` — regression (Task 3)
- `k6.test.ts` — regression (Task 5)
- `minio.test.ts` — regression (Task 2)

### Browser Smoke Test

MinIO via `docker compose up minio -d`; dev server on port 3004 (3000 occupied). **k6 not in PATH** — run streams ENOENT error as in Task 5.

| Step | Expected | Actual |
|------|----------|--------|
| No file selected | "Select a file to edit" placeholder | PASS |
| Select `smoke-test.js` | Editor + toolbar + terminal | PASS |
| Save status after load | `saved` | PASS |
| Click Run | Auto-save, terminal streams, Run disabled while running | PASS (ENOENT lines in terminal) |
| Click Save | Status shows `saved` | PASS |
| Delete selected file (smoke page only) | Parent clears stale `selected` via polling | PASS (smoke test page only; not committed) |

`page.tsx` restored to Next.js default before commit.

## Interfaces Delivered

```ts
export interface EditorTabProps {
  filename: string | null;
}

export default function EditorTab({ filename }: EditorTabProps): JSX.Element;
```

## Concerns / Notes

1. **k6 not installed locally** — Run button works end-to-end but k6 spawn fails with ENOENT until Task 10 Docker image or `K6_BIN` override.
2. **Stale selection not handled in EditorTab** — When `filename` points to a deleted file, ScriptEditor fetch may fail silently; Task 9 shell should clear `selectedFile` on delete (smoke test used parent polling only).
3. **No run error UI** — Failed runs show lines in terminal only; no toast or banner for fetch/SSE errors (inherited from Task 5 hook).
4. **Save status resets on file switch** — `saveStatus` state is component-level; switching files does not reset until ScriptEditor `onSaveStatusChange` fires on load.

## Next Task Dependencies

Task 9 can consume:

```tsx
import EditorTab from "@/components/tabs/EditorTab";

<EditorTab filename={selectedFile} />
```
