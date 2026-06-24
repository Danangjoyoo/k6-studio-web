import { spawn, ChildProcess } from "child_process";
import { stat } from "fs/promises";
import { createConnection } from "net";

export const K6_BIN = process.env.K6_BIN ?? "k6";

export function getK6RunArgs(scriptPath: string): string[] {
  return ["run", scriptPath];
}

export function getK6RunEnv(reportPath: string): Record<string, string> {
  const port = process.env.K6_DASHBOARD_PORT ?? "5665";
  return {
    K6_WEB_DASHBOARD: "true",
    K6_WEB_DASHBOARD_HOST: process.env.K6_WEB_DASHBOARD_HOST ?? "0.0.0.0",
    K6_WEB_DASHBOARD_PORT: port,
    K6_WEB_DASHBOARD_OPEN: "false",
    K6_WEB_DASHBOARD_EXPORT: reportPath,
  };
}

/** @deprecated Use getK6RunArgs + getK6RunEnv */
export function buildK6Command(
  scriptPath: string,
  reportPath: string
): string[] {
  void reportPath;
  return getK6RunArgs(scriptPath);
}

/**
 * Detects k6's final summary table. This normally appears after all VUs have
 * finished, but the dashboard event stream can keep k6 alive before the table
 * is emitted.
 */
export function isK6SummaryLine(line: string): boolean {
  return /^iteration_duration\s*\.{2,}\s*:/.test(line.trim());
}

/**
 * Wait until port `port` on 127.0.0.1 is no longer accepting connections,
 * or until `timeoutMs` elapses. Used before releasing the run lock so the
 * next run never races the kernel socket TIME_WAIT state (bug H2).
 */
export function waitForPortFree(
  port: number,
  timeoutMs = 5000
): Promise<void> {
  return new Promise((resolve) => {
    const deadline = Date.now() + timeoutMs;
    function poll() {
      const sock = createConnection({ host: "127.0.0.1", port });
      sock.on("connect", () => {
        sock.destroy();
        if (Date.now() < deadline) {
          setTimeout(poll, 200);
        } else {
          resolve();
        }
      });
      sock.on("error", () => {
        sock.destroy();
        resolve();
      });
    }
    poll();
  });
}

export function runK6(
  scriptPath: string,
  reportPath: string,
  onLine: (line: string) => void,
  signal?: AbortSignal
): Promise<number> {
  return new Promise((resolve) => {
    const args = getK6RunArgs(scriptPath);
    const child: ChildProcess = spawn(K6_BIN, args, {
      stdio: "pipe",
      env: { ...process.env, ...getK6RunEnv(reportPath) },
    });
    let settled = false;
    // Grace timer: started when k6 reaches its summary or finishes exporting
    // the dashboard report. If the dashboard SSE holds the process alive past
    // the test end, this fires SIGTERM so `done` can propagate and the terminal
    // stops showing "running".
    let gracerTimer: ReturnType<typeof setTimeout> | null = null;
    let reportPollTimer: ReturnType<typeof setInterval> | null = null;
    const GRACE_MS = 2000;
    const REPORT_POLL_MS = 500;
    let stdoutBuffer = "";
    let stderrBuffer = "";
    let reportStableSize: number | null = null;
    let reportPollInFlight = false;

    const finish = (code: number) => {
      if (settled) return;
      settled = true;
      if (gracerTimer) {
        clearTimeout(gracerTimer);
        gracerTimer = null;
      }
      if (reportPollTimer) {
        clearInterval(reportPollTimer);
        reportPollTimer = null;
      }
      signal?.removeEventListener("abort", onAbort);
      resolve(code);
    };

    const triggerGrace = () => {
      if (settled || gracerTimer) return;
      gracerTimer = setTimeout(() => {
        if (!settled) {
          child.kill("SIGTERM");
          // Escalate after another 2s if SIGTERM isn't enough
          setTimeout(() => {
            if (!settled) child.kill("SIGKILL");
          }, 2000).unref?.();
        }
      }, GRACE_MS);
    };

    const pollReportExport = async () => {
      if (settled || reportPollInFlight) return;
      reportPollInFlight = true;
      try {
        const report = await stat(reportPath);
        if (report.size <= 0) {
          reportStableSize = null;
          return;
        }

        if (report.size === reportStableSize) {
          triggerGrace();
        }
        reportStableSize = report.size;
      } catch {
        reportStableSize = null;
      } finally {
        reportPollInFlight = false;
      }
    };

    reportPollTimer = setInterval(() => {
      void pollReportExport();
    }, REPORT_POLL_MS);
    reportPollTimer.unref?.();

    function emitLine(line: string) {
      const trimmed = line.trim();
      if (!trimmed) return;
      onLine(line);
      if (isK6SummaryLine(trimmed)) {
        triggerGrace();
      }
    }

    const onAbort = () => {
      if (settled) return;
      child.kill("SIGTERM");
      setTimeout(() => {
        if (!settled) child.kill("SIGKILL");
      }, 2000).unref?.();
    };

    if (signal) {
      if (signal.aborted) {
        onAbort();
      } else {
        signal.addEventListener("abort", onAbort, { once: true });
      }
    }

    function handleData(chunk: Buffer, streamName: "stdout" | "stderr") {
      const text =
        (streamName === "stdout" ? stdoutBuffer : stderrBuffer) +
        chunk.toString("utf-8");
      const lines = text.split(/\r?\n/);
      const remainder = lines.pop() ?? "";

      if (streamName === "stdout") {
        stdoutBuffer = remainder;
      } else {
        stderrBuffer = remainder;
      }

      for (const line of lines) {
        emitLine(line);
      }
    }

    function flushBufferedLines() {
      if (stdoutBuffer.trim()) emitLine(stdoutBuffer);
      if (stderrBuffer.trim()) emitLine(stderrBuffer);
      stdoutBuffer = "";
      stderrBuffer = "";
    }

    child.stdout?.on("data", (chunk: Buffer) => handleData(chunk, "stdout"));
    child.stderr?.on("data", (chunk: Buffer) => handleData(chunk, "stderr"));
    child.on("error", (err) => {
      onLine(`[error] ${err.message}`);
      finish(1);
    });
    child.on("close", (code) => {
      if (!settled) {
        flushBufferedLines();
      }
      finish(code ?? 1);
    });
  });
}
