import { DEFAULT_NAMESPACE, normalizeNamespace } from "@/lib/namespaces";

/**
 * In-process runner slot registry for k6 runs.
 *
 * Next standalone runs as one Node.js process in the current deployment model,
 * so an in-memory registry is enough to coordinate local k6 child processes.
 */

export interface ActiveRun {
  id: string;
  namespace: string;
  script: string;
  startedAt: number;
  runnerIndex: number;
  dashboardPort: number;
}

export interface RunStatus {
  running: boolean;
  namespace: string | null;
  script: string | null;
  startedAt: number | null;
  activeRunners: number;
  capacity: number;
  runs: ActiveRun[];
}

let runs: ActiveRun[] = [];
let runSequence = 0;
const cancelHandlers = new Map<string, () => void>();

export function getRunnerCapacity(): number {
  const parsed = Number.parseInt(process.env.TOTAL_RUNNERS ?? "1", 10);
  if (!Number.isFinite(parsed) || parsed < 1) return 1;
  return parsed;
}

export function getDashboardBasePort(): number {
  const parsed = Number.parseInt(process.env.K6_DASHBOARD_PORT ?? "5665", 10);
  if (!Number.isFinite(parsed) || parsed < 1) return 5665;
  return parsed;
}

/** Attempt to acquire a runner slot for `script`. Returns the run on success. */
export function tryAcquire(
  script: string,
  namespace: string = DEFAULT_NAMESPACE
): ActiveRun | null {
  const normalizedNamespace = normalizeNamespace(namespace);
  const capacity = getRunnerCapacity();

  if (
    runs.some(
      (run) => run.namespace === normalizedNamespace && run.script === script
    )
  ) {
    return null;
  }

  if (runs.length >= capacity) return null;

  const usedIndexes = new Set(runs.map((run) => run.runnerIndex));
  let runnerIndex = 0;
  while (usedIndexes.has(runnerIndex)) {
    runnerIndex += 1;
  }

  const run: ActiveRun = {
    id: `run_${Date.now()}_${runSequence++}_${runnerIndex}`,
    namespace: normalizedNamespace,
    script,
    startedAt: Date.now(),
    runnerIndex,
    dashboardPort: getDashboardBasePort() + runnerIndex,
  };
  runs = [...runs, run].sort((a, b) => a.startedAt - b.startedAt);
  return run;
}

/**
 * Release a run. When called without an id, clear all runs for backward
 * compatibility with existing tests and setup-failure cleanup.
 */
export function release(runId?: string): void {
  if (!runId) {
    runs = [];
    cancelHandlers.clear();
    return;
  }
  runs = runs.filter((run) => run.id !== runId);
  cancelHandlers.delete(runId);
}

export function getRunById(runId: string): ActiveRun | null {
  return runs.find((run) => run.id === runId) ?? null;
}

export function registerCancelHandler(
  runId: string,
  handler: () => void
): boolean {
  if (!getRunById(runId)) return false;
  cancelHandlers.set(runId, handler);
  return true;
}

export function cancelRun(runId: string): boolean {
  const handler = cancelHandlers.get(runId);
  if (!handler) return false;
  handler();
  return true;
}

/** Current runner status, safe to expose over HTTP. */
export function getStatus(): RunStatus {
  const orderedRuns = [...runs].sort((a, b) => a.startedAt - b.startedAt);
  const oldest = orderedRuns[0] ?? null;
  return {
    running: orderedRuns.length > 0,
    namespace: oldest?.namespace ?? null,
    script: oldest?.script ?? null,
    startedAt: oldest?.startedAt ?? null,
    activeRunners: orderedRuns.length,
    capacity: getRunnerCapacity(),
    runs: orderedRuns,
  };
}

/** Reset all state (test helper only). */
export function _reset(): void {
  runs = [];
  runSequence = 0;
  cancelHandlers.clear();
}
