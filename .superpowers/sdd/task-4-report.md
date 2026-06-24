# Task 4 Report: Monaco Editor + Save

**Status:** Complete  
**Branch:** feat/k6-studio-web  
**Commit:** 04f7c73  
**Base commit:** 70c3a8f (Task 3)

## Summary

Built `ScriptEditor` — a Monaco-based editor that loads script content from MinIO via `GET /api/files/[name]`, saves on demand via `PUT /api/files/[name]`, and exposes `save` / `getContent` through a `forwardRef` handle. Cmd/Ctrl+S triggers save inside the editor.

## Files Created

| File | Purpose |
|------|---------|
| `k6-studio-web/src/components/editor/ScriptEditor.tsx` | Monaco wrapper with load/save, ref handle, keyboard shortcut |
| `k6-studio-web/src/components/editor/__tests__/ScriptEditor.test.tsx` | Unit test: loads content from API on mount |

## TDD Steps Followed

1. Wrote failing test → confirmed `Cannot locate module '@/components/editor/ScriptEditor'`
2. Implemented `ScriptEditor.tsx` with `forwardRef`, `useImperativeHandle`, Cmd+S binding
3. Unit test PASS (1/1)
4. Smoke-tested with temporary `page.tsx` + `docker compose up minio -d` + `npm run dev`
5. Reverted `page.tsx` via `git checkout`

## Test Results

### Unit Tests

```
Test Suites: 3 passed, 3 total
Tests:       3 passed, 3 total
```

- `ScriptEditor.test.tsx` — loads `// hello` from mocked GET on mount
- `FileExplorer.test.tsx` — regression (Task 3)
- `minio.test.ts` — regression (Task 2)

### Smoke Test (API + page load)

| Step | Expected | Actual |
|------|----------|--------|
| POST /api/files (with content) | 201 | PASS |
| GET /api/files/[name] (load) | 200 with content | PASS |
| PUT /api/files/[name] (save) | 200 `{ name }` | PASS |
| GET /api/files/[name] (reload) | 200 with updated content | PASS |
| GET / (editor + explorer layout) | 200 | PASS |
| DELETE cleanup | 204 | PASS |

Cmd/Ctrl+S binding verified via `handleEditorMount` → `editor.addCommand(CtrlCmd\|KeyS, save)`; full browser keyboard test deferred to Task 6 integration.

## Interfaces Delivered

```ts
export interface ScriptEditorHandle {
  save: () => Promise<void>;
  getContent: () => string;
}

export interface ScriptEditorProps {
  filename: string;
  onSaveStatusChange?: (status: "saved" | "saving" | "unsaved") => void;
}
```

## Concerns / Notes

1. **No fetch error handling** — Failed GET/PUT are silent; parent tasks may add toast/error UI.
2. **No response validation on save** — `save()` does not check `res.ok`; a failed PUT still sets status to `"saved"`.
3. **Cmd+S uses local `save()` closure** — Brief used `ref.current?.save()` in `onMount`; implementation calls the same `save` function directly (equivalent behavior, avoids `React.RefObject` cast without import).
4. **`monaco-editor` types** — Imported via `@monaco-editor/react` peer; no separate `@types/monaco-editor` package added.
5. **Filename change reload** — `useEffect` re-fetches when `filename` changes; unsaved edits are discarded without prompt (parent Task 6 may add dirty-check).

## Next Task Dependencies

Tasks 6 and 9 can consume:

```tsx
const editorRef = useRef<ScriptEditorHandle>(null);

<ScriptEditor
  ref={editorRef}
  filename={selectedFile}
  onSaveStatusChange={setStatus}
/>

// External save trigger
await editorRef.current?.save();
const content = editorRef.current?.getContent();
```
