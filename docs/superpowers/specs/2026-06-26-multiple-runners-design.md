# Multiple Runners Design

Date: 2026-06-26

## Goal

Allow k6 Studio to run more than one script concurrently when configured by `TOTAL_RUNNERS`, while keeping the default single-runner behavior unchanged.

## Assessment

The current single-run limit is not only a UI constraint. It is enforced by `src/lib/run-lock.ts` because the k6 live dashboard binds a fixed port. Supporting multiple active runs safely requires runner slots, one dashboard port per active k6 process, and status/UI updates that understand a list of active runs.

The recommended implementation is a bounded slot pool:

- `TOTAL_RUNNERS` defines the number of runner slots.
- Each acquired slot owns a dashboard port.
- The first slot uses `K6_DASHBOARD_PORT` or `5665`.
- Later slots use consecutive ports, for example `5666`, `5667`, and so on.
- Status returns the active run list so the UI can show active script names.

This avoids port races and keeps the existing live-dashboard proxy pattern.

## Configuration

`TOTAL_RUNNERS` is read from the app process environment.

- Missing value defaults to `1`.
- Invalid values default to `1`.
- Values below `1` default to `1`.
- Decimal values are parsed as integers.

`K6_DASHBOARD_PORT` remains the base dashboard port and defaults to `5665`.

## Run State

`src/lib/run-lock.ts` changes from one global lock to an in-process runner registry.

Each active run stores:

```ts
{
  id: string;
  namespace: string;
  script: string;
  startedAt: number;
  runnerIndex: number;
  dashboardPort: number;
}
```

`tryAcquire(script, namespace)` returns the acquired run record or `null`.

`release(runId)` releases only that run. Calling `release()` with no argument clears all runs for backward compatibility and tests.

The same namespace/script pair cannot be started twice while already running, even when spare capacity exists. This prevents one script session from receiving ambiguous terminal and dashboard state.

`getStatus()` returns:

```ts
{
  running: boolean;
  namespace: string | null;
  script: string | null;
  startedAt: number | null;
  activeRunners: number;
  capacity: number;
  runs: ActiveRun[];
}
```

The legacy `namespace`, `script`, and `startedAt` fields reflect the oldest active run for compatibility.

## Run API

`POST /api/run` acquires a runner slot before reading the script object. If all slots are busy or the same namespace/script is already running, it returns `409` with the current status.

The acquired run's `dashboardPort` is passed to `runK6`, which sets `K6_WEB_DASHBOARD_PORT` for that process. On completion or setup failure, the route waits for that specific port to be free and releases only that slot.

## Dashboard Proxy

The dashboard proxy can target a specific active run by `runId` query parameter:

```text
/api/dashboard/ui/?runId=<run-id>&endpoint=/api/dashboard/?runId=<run-id>
```

When `runId` is present, the proxy looks up that active run and proxies to its `dashboardPort`. When missing, it falls back to the first active run, or the base dashboard port for backward-compatible single-run behavior.

The live dashboard tab passes the selected script's active `runId` so the iframe shows the correct k6 dashboard when several runs are active.

## Header Behavior

The running script badge at the top is removed.

The active runner label remains visible and shows:

```text
Active runner: <active>/<capacity>
```

The label is clickable. Clicking it opens a compact popover listing active scripts as namespace-relative names:

```text
team-a/api/smoke.ts
default/load.ts
```

When no runs are active, the popover says `No active runners`.

## Workspace Behavior

The editor run button is disabled when:

- The selected namespace/script is already running.
- All runner slots are full.

The editor run button remains enabled when another script is running and capacity is available.

The workspace status polling stores the full active run list.

The file explorer receives all active scripts for the current namespace. A file or folder cannot be moved or renamed when it is itself running or contains any currently running script.

## Live Dashboard Behavior

The live dashboard mounts only when the selected script has an active run in the selected namespace. If several scripts are active, each selected script resolves to its own run id and dashboard proxy URL.

The earlier behavior remains: the iframe mounts for a selected active run without waiting for `/events`.

## Testing Strategy

Follow TDD:

- Unit-test `TOTAL_RUNNERS` parsing, slot acquisition, duplicate script rejection, slot release, and status shape in `run-lock`.
- Unit-test `runK6` environment generation for explicit dashboard ports.
- Route-test that `POST /api/run` allows concurrent runs up to capacity, rejects the next run, passes distinct dashboard ports to k6, and releases only the completed slot.
- Route-test dashboard proxy run-id port selection.
- Component-test the header active-runner button and popover.
- Context/component-test that active run lists from `/api/run/status` enable running another script when capacity remains and disable when full.
- Component-test that file movement is disabled for any active script in the current namespace.

Final verification must run:

```bash
npx jest --runInBand
npx tsc --noEmit
npm run lint
npm run build
docker compose up --build -d
```

## Non-Goals

- No run queue. When all runner slots are busy, new runs are rejected with `409`.
- No cancellation UI for active runs.
- No persisted run history beyond existing report generation.
- No cross-process distributed runner registry. The app still assumes the current single Node.js process deployment model.
