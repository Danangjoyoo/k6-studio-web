import { spawn, ChildProcess } from "child_process";

export const K6_BIN = process.env.K6_BIN ?? "k6";

export function buildK6Command(
  scriptPath: string,
  reportPath: string
): string[] {
  return [
    "run",
    "--out",
    `web-dashboard=export=${reportPath}`,
    scriptPath,
  ];
}

export function runK6(
  scriptPath: string,
  reportPath: string,
  onLine: (line: string) => void
): Promise<number> {
  return new Promise((resolve) => {
    const args = buildK6Command(scriptPath, reportPath);
    const child: ChildProcess = spawn(K6_BIN, args, { stdio: "pipe" });
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
