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

export function runK6(
  scriptPath: string,
  reportPath: string,
  onLine: (line: string) => void
): Promise<number> {
  return new Promise((resolve) => {
    const args = getK6RunArgs(scriptPath);
    const child: ChildProcess = spawn(K6_BIN, args, {
      stdio: "pipe",
      env: { ...process.env, ...getK6RunEnv(reportPath) },
    });
    let settled = false;

    const finish = (code: number) => {
      if (settled) return;
      settled = true;
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
