"use client";

import { useCallback, useRef, useState } from "react";
import { withBasePath } from "@/lib/base-path";

export interface K6RunnerState {
  lines: string[];
  isRunning: boolean;
  lastExitCode: number | null;
  lastReportName: string | null;
}

export function useK6Runner() {
  const [state, setState] = useState<K6RunnerState>({
    lines: [],
    isRunning: false,
    lastExitCode: null,
    lastReportName: null,
  });
  const abortRef = useRef<AbortController | null>(null);

  const run = useCallback(async (filename: string) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setState({
      lines: [],
      isRunning: true,
      lastExitCode: null,
      lastReportName: null,
    });

    const res = await fetch(withBasePath("/api/run"), {
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
            setState((s) => ({ ...s, lines: [...s.lines, msg.line!] }));
          }
          if (msg.done) {
            setState((s) => ({
              ...s,
              isRunning: false,
              lastExitCode: msg.exitCode ?? null,
              lastReportName: msg.reportName ?? null,
            }));
          }
        } catch {
          // malformed SSE frame — ignore
        }
      }
    }
  }, []);

  return { state, run };
}
