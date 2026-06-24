# Task 3 Report: File Explorer

**Status:** Complete  
**Branch:** feat/k6-studio-web  
**Commit:** 70c3a8f  
**Base commit:** 14bd21b (Task 2)

## Summary

Built the left-sidebar file explorer that lists k6 scripts from MinIO, supports create/delete, and notifies the parent via `onSelectFile`.

## Files Created

| File | Purpose |
|------|---------|
| `k6-studio-web/src/components/file-explorer/FileExplorer.tsx` | Main sidebar: fetch list, create, delete, selection |
| `k6-studio-web/src/components/file-explorer/FileItem.tsx` | Single file row with select + delete |
| `k6-studio-web/src/components/file-explorer/NewFileDialog.tsx` | Dialog to create a new script |
| `k6-studio-web/src/components/file-explorer/__tests__/FileExplorer.test.tsx` | Unit test for API-driven file list |
| `k6-studio-web/src/components/ui/dialog.tsx` | shadcn/base-nova Dialog (manual add) |
| `k6-studio-web/src/components/ui/input.tsx` | shadcn/base-nova Input (manual add) |

## Files Modified

| File | Change |
|------|--------|
| `k6-studio-web/jest.config.ts` | Added `ts-jest` transform with `jsx: "react-jsx"` for component tests |

## TDD Steps Followed

1. Wrote failing test → confirmed module-not-found / JSX parse error
2. Added shadcn `dialog` + `input` (CLI SSL failure → created manually from registry)
3. Implemented `FileItem`, `NewFileDialog`, `FileExplorer`
4. Unit test PASS (1/1)
5. Smoke-tested with temporary `page.tsx` + `docker compose up minio -d` + `npm run dev`
6. Reverted `page.tsx` via `git checkout`

## Test Results

### Unit Tests

```
Test Suites: 2 passed, 2 total
Tests:       2 passed, 2 total
```

- `FileExplorer.test.tsx` — renders file list from mocked `GET /api/files`
- `minio.test.ts` — still passes (Task 2 regression)

### Smoke Test (API + page load via curl)

| Step | Expected | Actual |
|------|----------|--------|
| GET /api/files | 200 `{"files":[]}` | PASS |
| POST /api/files | 201 `{"name":"smoke-test.js"}` | PASS |
| GET /api/files (after create) | 200 with file | PASS |
| DELETE /api/files/smoke-test.js | 204 | PASS |
| GET /api/files (after delete) | 200 `{"files":[]}` | PASS |
| GET / (FileExplorer page) | 200 | PASS |

## Interfaces Delivered

```ts
export interface FileExplorerProps {
  selectedFile: string | null;
  onSelectFile: (name: string) => void;
}
```

## Concerns / Notes

1. **shadcn CLI SSL failure** — `npx shadcn add dialog input` failed with TLS error; components added manually from base-nova registry JSON.
2. **base-ui vs Radix `asChild`** — Brief used `asChild` on `DialogTrigger`/`TooltipTrigger`; base-ui uses `render` prop instead. Updated to avoid nested `<button>` hydration errors.
3. **No delete confirmation** — Delete is immediate on trash click; may want confirm dialog in a later task.
4. **No error handling UI** — Failed fetch/create/delete are silent; parent tasks may add toast/error states.
5. **Selected file after delete** — Deleting the selected file does not clear `selectedFile` in parent; parent (Task 6/9) should handle stale selection.

## Next Task Dependencies

Tasks 6 and 9 can consume:
- `<FileExplorer selectedFile={...} onSelectFile={...} />`
- Selection callback fires on click and after create
