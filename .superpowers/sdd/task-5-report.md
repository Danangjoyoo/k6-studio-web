# Task 5 Report: k6 Runner + SSE Terminal

**Status:** Complete  
**Branch:** feat/k6-studio-web  
**Commit:** 1fce96d  
**Base commit:** 04f7c73 (Task 4)

## Summary

Built the k6 execution engine (`src/lib/k6.ts`), a `POST /api/run` SSE endpoint that streams stdout/stderr and uploads HTML reports to MinIO, a read-only `Terminal` component, and a `useK6Runner` hook for client-side SSE consumption.

## Files Created

| File | Purpose |
|------|---------|
| `k6-studio-web/src/lib/k6.ts` | `buildK6Command`, `runK6` — spawns k6 child process |
| `k6-studio-web/src/lib/__tests__/k6.test.ts` | Unit test for command arg construction |
| `k6-studio-web/src/app/api/run/route.ts` | SSE stream endpoint; fetches script from MinIO, runs k6, uploads report |
| `k6-studio-web/src/components/terminal/Terminal.tsx` | Read-only terminal UI with auto-scroll |
| `k6-studio-web/src/hooks/useK6Runner.ts` | Hook managing SSE fetch, line buffer, run state |

## TDD Steps Followed

1. Wrote failing test → confirmed `Could not locate module @/lib/k6`
2. Implemented `k6.ts` per spec
3. Unit test PASS (1/1)
4. Implemented route, Terminal, useK6Runner
5. Added spawn `error` handler and report file existence check (see Concerns)
6. Smoke-tested SSE endpoint with MinIO + dev server (k6 not in PATH)

## Test Results

### Unit Tests

```
Test Suites: 4 passed, 4 total
Tests:       4 passed, 4 total
```

- `k6.test.ts` — `buildK6Command` includes script path and report export arg
- `ScriptEditor.test.tsx` — regression (Task 4)
- `FileExplorer.test.tsx` — regression (Task 3)
- `minio.test.ts` — regression (Task 2)

### Integration Test

**k6 not installed on host** (`which k6` → not found). Full end-to-end run with exit code 0 **skipped** per brief.

Partial smoke test (MinIO + dev server, no k6):

| Step | Expected | Actual |
|------|----------|--------|
| POST /api/files (upload script) | 201 | PASS |
| POST /api/run (SSE, no k6) | Stream with error + done frame | PASS |
| POST /api/run (missing filename) | 400 `{ error }` | PASS |

SSE output without k6:

```
data: {"line":"[error] spawn k6 ENOENT"}
data: {"line":"[warning] could not save HTML report"}
data: {"done":true,"exitCode":1,"reportName":"smoke.js-<timestamp>.html"}
```

Full k6 run verification deferred to Task 10 (Docker bundles k6).

## Interfaces Delivered

```ts
// POST /api/run — body: { filename: string }
// Response: text/event-stream
//   data: {"line":"<output line>"}\n\n
//   data: {"done":true,"exitCode":0,"reportName":"smoke.js-<timestamp>.html"}\n\n

export interface TerminalProps {
  lines: string[];
  isRunning: boolean;
}

export interface K6RunnerState {
  lines: string[];
  isRunning: boolean;
  lastExitCode: number | null;
  lastReportName: string | null;
}

export function useK6Runner(): { state: K6RunnerState; run: (filename: string) => Promise<void> }
```

## Concerns / Notes

1. **k6 not installed locally** — Host has no `k6` in PATH. Task 10 Docker image will bundle k6; set `K6_BIN` env var to override binary path.
2. **Spawn error handling added** — Brief omitted `child.on("error")`; without it, ENOENT caused uncaughtException and hung the SSE stream. Added error listener + `settled` guard to prevent double-resolve.
3. **Report upload guard added** — When k6 fails before creating `report.html`, `putObject(createReadStream(...))` hung indefinitely. Added `access(reportPath)` check before upload.
4. **No abort cleanup in hook** — Aborted fetch stops reading but does not reset `isRunning` to false; Task 6 may handle cancel UX.
5. **No fetch error handling in hook** — Non-OK responses or network errors leave `isRunning: true`; parent tasks may add error UI.
6. **Temp run dirs not cleaned up** — Scripts/reports written to `os.tmpdir()/k6-run-*` are not deleted after run; low disk impact for dev, may want cleanup in Task 10.
7. **Line splitting is chunk-based** — Partial lines across TCP chunks may split incorrectly; acceptable for MVP terminal output.

## Next Task Dependencies

Tasks 6 and 9 can consume:

```tsx
import Terminal from "@/components/terminal/Terminal";
import { useK6Runner } from "@/hooks/useK6Runner";

const { state, run } = useK6Runner();

<Terminal lines={state.lines} isRunning={state.isRunning} />
await run("smoke.js");
// state.lastExitCode, state.lastReportName available after done frame
```
