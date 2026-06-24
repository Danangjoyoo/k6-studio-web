"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

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
  selectedFile: string | null;
  setSelectedFile: (name: string) => void;
  getSession: (filename: string) => ScriptSession;
  runScript: (filename: string) => Promise<void>;
  runningScript: string | null;
  runEpoch: number;
}

const ScriptWorkspaceContext = createContext<ScriptWorkspaceValue | null>(null);

function updateSession(
  sessions: Record<string, ScriptSession>,
  filename: string,
  patch: Partial<ScriptSession>
): Record<string, ScriptSession> {
  return {
    ...sessions,
    [filename]: { ...(sessions[filename] ?? EMPTY_SESSION), ...patch },
  };
}

export function ScriptWorkspaceProvider({
  children,
  selectedFile,
  onSelectFile,
}: {
  children: ReactNode;
  selectedFile: string | null;
  onSelectFile: (name: string) => void;
}) {
  const [sessions, setSessions] = useState<Record<string, ScriptSession>>({});
  const [runningScript, setRunningScript] = useState<string | null>(null);
  const [runEpoch, setRunEpoch] = useState(0);
  const abortRef = useRef<AbortController | null>(null);

  const getSession = useCallback(
    (filename: string) => sessions[filename] ?? EMPTY_SESSION,
    [sessions]
  );

  const runScript = useCallback(async (filename: string) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setRunningScript(filename);
    setRunEpoch((e) => e + 1);
    setSessions((s) =>
      updateSession(s, filename, {
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
        body: JSON.stringify({ filename }),
        signal: controller.signal,
      });

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
                const current = s[filename] ?? EMPTY_SESSION;
                return updateSession(s, filename, {
                  lines: [...current.lines, msg.line!],
                });
              });
            }
            if (msg.done) {
              setSessions((s) =>
                updateSession(s, filename, {
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
        updateSession(s, filename, {
          isRunning: false,
          lines: [
            ...(s[filename]?.lines ?? []),
            `[error] ${err instanceof Error ? err.message : "run failed"}`,
          ],
        })
      );
      setRunningScript(null);
    }
  }, []);

  const value = useMemo(
    () => ({
      selectedFile,
      setSelectedFile: onSelectFile,
      getSession,
      runScript,
      runningScript,
      runEpoch,
    }),
    [selectedFile, onSelectFile, getSession, runScript, runningScript, runEpoch]
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
