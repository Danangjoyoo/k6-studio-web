# Task 5: k6 Runner + SSE Terminal

> [← Master Plan](./master.md)

**Goal:** Create the k6 execution engine (`src/lib/k6.ts`) that spawns k6 as a child process, and a `POST /api/run` route that streams stdout/stderr to the browser via Server-Sent Events. Build the read-only `Terminal` component that renders the stream, plus a `useK6Runner` hook that manages SSE consumption.

**Consumes (from Task 2):**
- `GET /api/files/[name]` → `{ name: string; content: string }` — script source
- MinIO `REPORTS_BUCKET` — for uploading the HTML report after a run

**Files:**
- Create: `src/lib/k6.ts`
- Create: `src/lib/__tests__/k6.test.ts`
- Create: `src/app/api/run/route.ts`
- Create: `src/components/terminal/Terminal.tsx`
- Create: `src/hooks/useK6Runner.ts`

**Interfaces produced (consumed by Tasks 6, 9):**

```ts
// POST /api/run — body: { filename: string }
// Response: text/event-stream
// Event frames:
//   data: {"line":"<output line>"}\n\n
//   data: {"done":true,"exitCode":0,"reportName":"smoke.js-1719200000000.html"}\n\n

export interface TerminalProps {
  lines: string[];
  isRunning: boolean;
}

// useK6Runner hook
export interface K6RunnerState {
  lines: string[];
  isRunning: boolean;
  lastExitCode: number | null;
  lastReportName: string | null;
}
export function useK6Runner(): { state: K6RunnerState; run: (filename: string) => Promise<void> }
```

---

- [ ] **Step 1: Write failing test for k6 lib**

Create `src/lib/__tests__/k6.test.ts`:

```ts
import { buildK6Command } from "@/lib/k6";

describe("k6", () => {
  it("buildK6Command includes script path and report path in args", () => {
    const args = buildK6Command("/tmp/script.js", "/tmp/report.html");
    expect(args[0]).toBe("run");
    expect(args).toContain("/tmp/script.js");
    expect(args.some((a) => a.includes("report.html"))).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
npx jest src/lib/__tests__/k6.test.ts
```

Expected: FAIL — `Cannot find module '@/lib/k6'`

- [ ] **Step 3: Implement `src/lib/k6.ts`**

```ts
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

    function handleData(chunk: Buffer) {
      for (const line of chunk.toString("utf-8").split("\n")) {
        if (line.trim()) onLine(line);
      }
    }

    child.stdout?.on("data", handleData);
    child.stderr?.on("data", handleData);
    child.on("close", (code) => resolve(code ?? 1));
  });
}
```

- [ ] **Step 4: Run test to confirm it passes**

```bash
npx jest src/lib/__tests__/k6.test.ts
```

Expected: PASS

- [ ] **Step 5: Implement `src/app/api/run/route.ts`**

```ts
import { NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { createReadStream } from "fs";
import {
  getMinioClient,
  SCRIPTS_BUCKET,
  REPORTS_BUCKET,
  ensureBuckets,
} from "@/lib/minio";
import { runK6 } from "@/lib/k6";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const { filename } = (await request.json()) as { filename: string };
  if (!filename) {
    return NextResponse.json({ error: "filename required" }, { status: 400 });
  }

  await ensureBuckets();
  const client = getMinioClient();

  const objStream = await client.getObject(SCRIPTS_BUCKET, filename);
  const chunks: Buffer[] = [];
  await new Promise<void>((resolve, reject) => {
    objStream.on("data", (c: Buffer) => chunks.push(c));
    objStream.on("end", resolve);
    objStream.on("error", reject);
  });

  const runDir = join(tmpdir(), `k6-run-${Date.now()}`);
  await mkdir(runDir, { recursive: true });
  const scriptPath = join(runDir, filename);
  const reportPath = join(runDir, "report.html");
  await writeFile(scriptPath, Buffer.concat(chunks).toString("utf-8"), "utf-8");

  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      function send(obj: Record<string, unknown>) {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(obj)}\n\n`)
        );
      }

      const exitCode = await runK6(scriptPath, reportPath, (line) =>
        send({ line })
      );

      const reportName = `${filename}-${Date.now()}.html`;
      try {
        await client.putObject(
          REPORTS_BUCKET,
          reportName,
          createReadStream(reportPath)
        );
      } catch {
        send({ line: "[warning] could not save HTML report" });
      }

      send({ done: true, exitCode, reportName });
      controller.close();
    },
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
```

- [ ] **Step 6: Implement `src/components/terminal/Terminal.tsx`**

```tsx
"use client";

import { useEffect, useRef } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";

export interface TerminalProps {
  lines: string[];
  isRunning: boolean;
}

export default function Terminal({ lines, isRunning }: TerminalProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [lines]);

  return (
    <div className="flex flex-col h-full bg-black font-mono text-xs">
      <div className="flex items-center gap-2 px-3 py-1 border-b border-slate-700 bg-slate-900">
        <span className="text-slate-400 text-xs">Terminal</span>
        {isRunning && (
          <span className="text-green-400 animate-pulse text-xs">
            ● running
          </span>
        )}
      </div>
      <ScrollArea className="flex-1">
        <div className="p-3 space-y-0.5">
          {lines.map((line, i) => (
            <div
              key={i}
              className="text-green-300 whitespace-pre-wrap leading-5"
            >
              {line}
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
      </ScrollArea>
    </div>
  );
}
```

- [ ] **Step 7: Implement `src/hooks/useK6Runner.ts`**

Create `src/hooks/useK6Runner.ts`:

```ts
"use client";

import { useCallback, useRef, useState } from "react";

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
```

- [ ] **Step 8: Integration-test run endpoint**

```bash
docker compose up minio -d && npm run dev &
sleep 5

curl -X POST http://localhost:3000/api/files \
  -H "Content-Type: application/json" \
  -d '{"name":"smoke.js","content":"import http from \"k6/http\"; export default function(){http.get(\"https://test.k6.io\")}"}'

curl -N -X POST http://localhost:3000/api/run \
  -H "Content-Type: application/json" \
  -d '{"filename":"smoke.js"}'
# Expected: stream of SSE lines ending with:
# data: {"done":true,"exitCode":0,"reportName":"smoke.js-<timestamp>.html"}
```

- [ ] **Step 9: Commit**

```bash
kill %1
docker compose down
git add src/lib/k6.ts src/lib/__tests__/k6.test.ts src/app/api/run/ src/components/terminal/ src/hooks/
git commit -m "feat: add k6 runner with SSE streaming and terminal component"
```
