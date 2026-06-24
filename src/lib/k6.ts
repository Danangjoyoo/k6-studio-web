import { spawn, ChildProcess } from "child_process";

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

// The k6 web dashboard binds a single fixed port (5665), so only one run may
// own it at a time. Track the in-flight child process module-wide and tear it
// down before launching a new run — otherwise a lingering process keeps the
// port occupied and every subsequent run's dashboard fails to start.
let activeChild: ChildProcess | null = null;

export function runK6(
  scriptPath: string,
  reportPath: string,
  onLine: (line: string) => void,
  signal?: AbortSignal
): Promise<number> {
  return new Promise((resolve) => {
    if (activeChild) {
      activeChild.kill("SIGKILL");
      activeChild = null;
    }

    const args = getK6RunArgs(scriptPath);
    const child: ChildProcess = spawn(K6_BIN, args, {
      stdio: "pipe",
      env: { ...process.env, ...getK6RunEnv(reportPath) },
    });
    activeChild = child;
    let settled = false;

    // Kill k6 if the caller aborts (e.g. the client disconnects from the run
    // stream or starts another run). Without this, k6 keeps running and — once
    // its stdout pipe is no longer drained — blocks while still holding the web
    // dashboard port (5665), preventing any subsequent run's dashboard from
    // starting.
    const onAbort = () => {
      if (settled) return;
      if (activeChild === child) activeChild = null;
      child.kill("SIGTERM");
      // Escalate if it does not exit promptly.
      setTimeout(() => {
        if (!settled) child.kill("SIGKILL");
      }, 2000).unref?.();
    };
    if (signal) {
      if (signal.aborted) onAbort();
      else signal.addEventListener("abort", onAbort, { once: true });
    }

    const finish = (code: number) => {
      if (settled) return;
      settled = true;
      if (activeChild === child) activeChild = null;
      signal?.removeEventListener("abort", onAbort);
      resolve(code);
    };

    function handleData(chunk: Buffer) {
      for (const line of chunk.toString("utf-8").split("\n")) {
        if (line.trim()) onLine(line);
      }
    }

    child.stdout?.on("data", handleData);
    child.stderr?.on("data", handleData);
    child.on("error", (err) => {
      onLine(`[error] ${err.message}`);
      finish(1);
    });
    child.on("close", (code) => finish(code ?? 1));
  });
}
