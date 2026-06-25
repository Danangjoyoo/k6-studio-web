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
import type { RunStatus } from "@/lib/run-lock";
import { DEFAULT_NAMESPACE } from "@/lib/namespaces";

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
  runningScript: string | null;
  runEpoch: number;
  // Global (server-authoritative) run state
  globalRunning: boolean;
  globalRunningNamespace: string | null;
  globalRunningScript: string | null;
  activeRunners: number;
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
  const abortRef = useRef<AbortController | null>(null);

  // Poll /api/run/status to get authoritative run state (works across tabs/users)
  useEffect(() => {
    let cancelled = false;
    async function poll() {
      while (!cancelled) {
        try {
          const res = await fetch("/api/run/status");
          if (!cancelled && res.ok) {
            const status = (await res.json()) as RunStatus;
            setGlobalRunning(status.running);
            setGlobalRunningNamespace(status.namespace ?? null);
            setGlobalRunningScript(status.script);
            setActiveRunners(status.activeRunners);
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
  }, []);

  const getSession = useCallback(
    (filename: string) =>
      sessions[sessionKey(namespace, filename)] ?? EMPTY_SESSION,
    [namespace, sessions]
  );

  const runScript = useCallback(async (filename: string) => {
    const key = sessionKey(namespace, filename);
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

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
      const res = await fetch("/api/run", {
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
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) return;

      const decoder = new TextDecoder();
      let buf = "";

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
              done?: boolean;
              exitCode?: number;
              reportName?: string;
            };
            if (msg.line !== undefined) {
              setSessions((s) => {
                const current = s[key] ?? EMPTY_SESSION;
                return updateSession(s, key, {
                  lines: [...current.lines, msg.line!],
                });
              });
            }
            if (msg.done) {
              setSessions((s) =>
                updateSession(s, key, {
                  isRunning: false,
                  lastExitCode: msg.exitCode ?? null,
                  lastReportName: msg.reportName ?? null,
                })
              );
              setRunningScript(null);
            }
          } catch {
            // malformed SSE frame — ignore
          }
        }
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setSessions((s) =>
        updateSession(s, key, {
          isRunning: false,
          lines: [
            ...(s[key]?.lines ?? []),
            `[error] ${err instanceof Error ? err.message : "run failed"}`,
          ],
        })
      );
      setRunningScript(null);
    }
  }, [namespace]);

  const value = useMemo(
    () => ({
      namespace,
      selectedFile,
      setSelectedFile: onSelectFile,
      getSession,
      runScript,
      runningScript,
      runEpoch,
      globalRunning,
      globalRunningNamespace,
      globalRunningScript,
      activeRunners,
    }),
    [
      namespace,
      selectedFile,
      onSelectFile,
      getSession,
      runScript,
      runningScript,
      runEpoch,
      globalRunning,
      globalRunningNamespace,
      globalRunningScript,
      activeRunners,
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
