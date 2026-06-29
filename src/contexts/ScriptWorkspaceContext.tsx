"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { ActiveRun, RunStatus } from "@/lib/run-lock";
import { DEFAULT_NAMESPACE } from "@/lib/namespaces";
import { withBasePath } from "@/lib/base-path";

export interface ScriptSession {
  lines: string[];
  isRunning: boolean;
  lastExitCode: number | null;
  lastReportName: string | null;
}

const EMPTY_SESSION: ScriptSession = {
  lines: [],
  isRunning: false,
  lastExitCode: null,
  lastReportName: null,
};

interface ScriptWorkspaceValue {
  namespace: string;
  selectedFile: string | null;
  setSelectedFile: (name: string) => void;
  getSession: (filename: string) => ScriptSession;
  runScript: (filename: string) => Promise<void>;
  cancelRun: (runId: string) => Promise<void>;
  runningScript: string | null;
  runEpoch: number;
  // Global (server-authoritative) run state
  globalRunning: boolean;
  globalRunningNamespace: string | null;
  globalRunningScript: string | null;
  activeRunners: number;
  runnerCapacity: number;
  globalRuns: ActiveRun[];
}

const ScriptWorkspaceContext = createContext<ScriptWorkspaceValue | null>(null);

function updateSession(
  sessions: Record<string, ScriptSession>,
  key: string,
  patch: Partial<ScriptSession>
): Record<string, ScriptSession> {
  return {
    ...sessions,
    [key]: { ...(sessions[key] ?? EMPTY_SESSION), ...patch },
  };
}

const STATUS_POLL_MS = 1500;
const sessionKey = (namespace: string, filename: string) =>
  `${namespace}\0${filename}`;

export function ScriptWorkspaceProvider({
  children,
  namespace = DEFAULT_NAMESPACE,
  selectedFile,
  onSelectFile,
}: {
  children: ReactNode;
  namespace?: string;
  selectedFile: string | null;
  onSelectFile: (name: string) => void;
}) {
  const [sessions, setSessions] = useState<Record<string, ScriptSession>>({});
  const [runningScript, setRunningScript] = useState<string | null>(null);
  const [runEpoch, setRunEpoch] = useState(0);
  const [globalRunning, setGlobalRunning] = useState(false);
  const [globalRunningNamespace, setGlobalRunningNamespace] = useState<
    string | null
  >(null);
  const [globalRunningScript, setGlobalRunningScript] = useState<string | null>(
    null
  );
  const [activeRunners, setActiveRunners] = useState(0);
  const [runnerCapacity, setRunnerCapacity] = useState(1);
  const [globalRuns, setGlobalRuns] = useState<ActiveRun[]>([]);
  const abortRefs = useRef<Record<string, AbortController>>({});
  const optimisticRunsRef = useRef<Record<string, ActiveRun>>({});
  const completedRunIdsRef = useRef<Set<string>>(new Set());
  const visibleRunsRef = useRef<ActiveRun[]>([]);
  const runnerCapacityRef = useRef(1);

  const applyVisibleRuns = useCallback((runs: ActiveRun[], capacity: number) => {
    const orderedRuns = orderActiveRuns(runs);
    const oldest = orderedRuns[0] ?? null;

    visibleRunsRef.current = orderedRuns;
    runnerCapacityRef.current = capacity;
    setGlobalRunning(orderedRuns.length > 0);
    setGlobalRunningNamespace(oldest?.namespace ?? null);
    setGlobalRunningScript(oldest?.script ?? null);
    setActiveRunners(orderedRuns.length);
    setRunnerCapacity(capacity);
    setGlobalRuns(orderedRuns);
  }, []);

  const applyRunStatus = useCallback(
    (status: RunStatus) => {
      const rawServerRuns = status.runs ?? legacyStatusRun(status);
      const serverRunIds = new Set(rawServerRuns.map((run) => run.id));
      for (const completedRunId of completedRunIdsRef.current) {
        if (!serverRunIds.has(completedRunId)) {
          completedRunIdsRef.current.delete(completedRunId);
        }
      }

      const serverRuns = rawServerRuns.filter(
        (run) => !completedRunIdsRef.current.has(run.id)
      );
      applyVisibleRuns(
        mergeActiveRuns(serverRuns, Object.values(optimisticRunsRef.current)),
        status.capacity
      );
    },
    [applyVisibleRuns]
  );

  const removeOptimisticRun = useCallback(
    (key: string, markCompleted = false) => {
      const run = optimisticRunsRef.current[key];
      if (!run) return;

      delete optimisticRunsRef.current[key];
      if (markCompleted) {
        completedRunIdsRef.current.add(run.id);
      }
      applyVisibleRuns(
        visibleRunsRef.current.filter((visibleRun) => visibleRun.id !== run.id),
        runnerCapacityRef.current
      );
    },
    [applyVisibleRuns]
  );

  // Poll /api/run/status to get authoritative run state (works across tabs/users)
  useEffect(() => {
    let cancelled = false;
    async function poll() {
      while (!cancelled) {
        try {
          const res = await fetch(withBasePath("/api/run/status"));
          if (!cancelled && res.ok) {
            const status = (await res.json()) as RunStatus;
            applyRunStatus(status);
          }
        } catch {
          // ignore network errors during polling
        }
        if (!cancelled) {
          await new Promise((r) => setTimeout(r, STATUS_POLL_MS));
        }
      }
    }
    void poll();
    return () => {
      cancelled = true;
    };
  }, [applyRunStatus]);

  const getSession = useCallback(
    (filename: string) =>
      sessions[sessionKey(namespace, filename)] ?? EMPTY_SESSION,
    [namespace, sessions]
  );

  const runScript = useCallback(async (filename: string) => {
    const key = sessionKey(namespace, filename);
    abortRefs.current[key]?.abort();
    const controller = new AbortController();
    abortRefs.current[key] = controller;

    function finishWithError(message: string) {
      removeOptimisticRun(key);
      setSessions((s) =>
        updateSession(s, key, {
          isRunning: false,
          lines: [...(s[key]?.lines ?? []), `[error] ${message}`],
        })
      );
      setRunningScript(null);
      delete abortRefs.current[key];
    }

    setRunningScript(filename);
    setRunEpoch((e) => e + 1);
    setSessions((s) =>
      updateSession(s, key, {
        lines: [],
        isRunning: true,
        lastExitCode: null,
        lastReportName: null,
      })
    );

    try {
      const res = await fetch(withBasePath("/api/run"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename, namespace }),
        signal: controller.signal,
      });

      if (res.status === 409) {
        const body = (await res.json()) as { error: string };
        setSessions((s) =>
          updateSession(s, key, {
            isRunning: false,
            lines: [`[blocked] ${body.error ?? "A run is already in progress"}`],
          })
        );
        setRunningScript(null);
        delete abortRefs.current[key];
        return;
      }

      if (!res.ok) {
        const detail = await readRunFailure(res);
        finishWithError(`run request failed (${res.status}): ${detail}`);
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) {
        finishWithError("run response did not include a stream");
        return;
      }

      const decoder = new TextDecoder();
      let buf = "";
      let completed = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const parts = buf.split("\n\n");
        buf = parts.pop() ?? "";
        for (const part of parts) {
          const dataLine = part.replace(/^data: /, "").trim();
          if (!dataLine) continue;
          try {
            const msg = JSON.parse(dataLine) as {
              line?: string;
              started?: boolean;
              run?: ActiveRun;
              status?: RunStatus;
              done?: boolean;
              exitCode?: number;
              reportName?: string;
            };
            if (msg.started && msg.run) {
              completedRunIdsRef.current.delete(msg.run.id);
              optimisticRunsRef.current[key] = msg.run;
              if (msg.status) {
                applyRunStatus(msg.status);
              } else {
                applyVisibleRuns(
                  mergeActiveRuns(visibleRunsRef.current, [msg.run]),
                  runnerCapacityRef.current
                );
              }
            }
            if (msg.line !== undefined) {
              setSessions((s) => {
                const current = s[key] ?? EMPTY_SESSION;
                return updateSession(s, key, {
                  lines: [...current.lines, msg.line!],
                });
              });
            }
            if (msg.done) {
              completed = true;
              removeOptimisticRun(key, true);
              setSessions((s) =>
                updateSession(s, key, {
                  isRunning: false,
                  lastExitCode: msg.exitCode ?? null,
                  lastReportName: msg.reportName ?? null,
                })
              );
              setRunningScript(null);
              delete abortRefs.current[key];
            }
          } catch {
            // malformed SSE frame — ignore
          }
        }
      }
      if (!completed && !controller.signal.aborted) {
        finishWithError("run stream ended before completion");
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        removeOptimisticRun(key);
        return;
      }
      finishWithError(err instanceof Error ? err.message : "run failed");
    }
  }, [
    namespace,
    applyRunStatus,
    applyVisibleRuns,
    removeOptimisticRun,
  ]);

  const cancelRun = useCallback(
    async (runId: string) => {
      const activeRun = globalRuns.find((run) => run.id === runId);
      if (!activeRun) return;

      const key = sessionKey(activeRun.namespace, activeRun.script);
      try {
        const response = await fetch(withBasePath("/api/run/cancel"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ runId }),
        });

        if (!response.ok) {
          throw new Error("cancel failed");
        }

        setSessions((s) => {
          const current = s[key] ?? EMPTY_SESSION;
          return updateSession(s, key, {
            lines: [
              ...current.lines,
              "[cancelled] cancellation requested; this run will not be saved to history",
            ],
          });
        });
      } catch {
        setSessions((s) => {
          const current = s[key] ?? EMPTY_SESSION;
          return updateSession(s, key, {
            lines: [...current.lines, "[error] could not cancel run"],
          });
        });
      }
    },
    [globalRuns]
  );

  const value = useMemo(
    () => ({
      namespace,
      selectedFile,
      setSelectedFile: onSelectFile,
      getSession,
      runScript,
      cancelRun,
      runningScript,
      runEpoch,
      globalRunning,
      globalRunningNamespace,
      globalRunningScript,
      activeRunners,
      runnerCapacity,
      globalRuns,
    }),
    [
      namespace,
      selectedFile,
      onSelectFile,
      getSession,
      runScript,
      cancelRun,
      runningScript,
      runEpoch,
      globalRunning,
      globalRunningNamespace,
      globalRunningScript,
      activeRunners,
      runnerCapacity,
      globalRuns,
    ]
  );

  return (
    <ScriptWorkspaceContext.Provider value={value}>
      {children}
    </ScriptWorkspaceContext.Provider>
  );
}

export function useScriptWorkspace() {
  const ctx = useContext(ScriptWorkspaceContext);
  if (!ctx) {
    throw new Error("useScriptWorkspace must be used within ScriptWorkspaceProvider");
  }
  return ctx;
}

export { EMPTY_SESSION };

function legacyStatusRun(status: RunStatus): ActiveRun[] {
  if (
    !status.running ||
    !status.namespace ||
    !status.script ||
    !status.startedAt
  ) {
    return [];
  }

  return [
    {
      id: "legacy-run",
      namespace: status.namespace,
      script: status.script,
      startedAt: status.startedAt,
      runnerIndex: 0,
      dashboardPort: 5665,
    },
  ];
}

function orderActiveRuns(runs: ActiveRun[]): ActiveRun[] {
  return [...runs].sort(
    (a, b) => a.startedAt - b.startedAt || a.runnerIndex - b.runnerIndex
  );
}

function mergeActiveRuns(...runGroups: ActiveRun[][]): ActiveRun[] {
  const runsById = new Map<string, ActiveRun>();
  for (const run of runGroups.flat()) {
    runsById.set(run.id, run);
  }

  return orderActiveRuns(Array.from(runsById.values()));
}

async function readRunFailure(response: Response): Promise<string> {
  try {
    const text = await response.text();
    if (!text) return response.statusText || "request failed";

    try {
      const body = JSON.parse(text) as { error?: unknown };
      if (typeof body.error === "string" && body.error.trim()) {
        return body.error;
      }
    } catch {
      // Use raw text when the response body is not JSON.
    }

    return text.slice(0, 300);
  } catch {
    return response.statusText || "request failed";
  }
}
