import { NextResponse } from "next/server";
import { writeFile, mkdir, access } from "fs/promises";
import { join, basename } from "path";
import { tmpdir } from "os";
import { createReadStream } from "fs";
import {
  getMinioClient,
  SCRIPTS_BUCKET,
  REPORTS_BUCKET,
  ensureBuckets,
} from "@/lib/minio";
import { runK6, waitForPortFree } from "@/lib/k6";
import {
  tryAcquire,
  release,
  getStatus,
  registerCancelHandler,
} from "@/lib/run-lock";
import {
  NamespaceError,
  normalizeNamespace,
  toNamespacedKey,
} from "@/lib/namespaces";
import {
  appendRunOutput,
  closeRunOutput,
  type RunOutputMessage,
} from "@/lib/run-output";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const { filename, namespace: namespaceInput } = (await request.json()) as {
    filename: string;
    namespace?: unknown;
  };
  if (!filename) {
    return NextResponse.json({ error: "filename required" }, { status: 400 });
  }

  let namespace: string;
  try {
    namespace = normalizeNamespace(namespaceInput);
  } catch (error) {
    if (error instanceof NamespaceError) {
      return NextResponse.json(
        { error: "Invalid namespace" },
        { status: 400 }
      );
    }
    throw error;
  }

  const activeRun = tryAcquire(filename, namespace);
  if (!activeRun) {
    return NextResponse.json(
      { error: "A run is already in progress", status: getStatus() },
      { status: 409 }
    );
  }
  const run = activeRun;

  try {
    await ensureBuckets();
    const client = getMinioClient();
    const scriptKey = toNamespacedKey(namespace, filename);

    const objStream = await client.getObject(SCRIPTS_BUCKET, scriptKey);
    const chunks: Buffer[] = [];
    await new Promise<void>((resolve, reject) => {
      objStream.on("data", (c: Buffer) => chunks.push(c));
      objStream.on("end", resolve);
      objStream.on("error", reject);
    });

    // Use basename so nested paths (e.g. auth/login.ts) don't create sub-dirs
    const runDir = join(tmpdir(), `k6-run-${Date.now()}`);
    await mkdir(runDir, { recursive: true });
    const scriptPath = join(runDir, basename(filename));
    const reportPath = join(runDir, "report.html");
    await writeFile(scriptPath, Buffer.concat(chunks).toString("utf-8"), "utf-8");

    const encoder = new TextEncoder();
    const abortController = new AbortController();
    let cancelled = false;
    registerCancelHandler(run.id, () => {
      cancelled = true;
      abortController.abort();
    });
    request.signal.addEventListener("abort", () => abortController.abort());

    const readable = new ReadableStream({
      async start(controller) {
        function send(obj: RunOutputMessage) {
          appendRunOutput(run.id, obj);
          try {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify(obj)}\n\n`)
            );
          } catch {
            // controller already closed
          }
        }

        try {
          send({
            started: true,
            run,
            status: getStatus(),
          });
          send({
            line: `[starting] k6 run for ${namespace}/${filename} on dashboard port ${run.dashboardPort}`,
          });

          const exitCode = await runK6(
            scriptPath,
            reportPath,
            (line) => send({ line }),
            abortController.signal,
            run.dashboardPort
          );

          if (cancelled) {
            send({
              done: true,
              cancelled: true,
              exitCode: null,
              reportName: null,
            });
            return;
          }

          const reportName = `${filename}-${Date.now()}.html`;
          const reportKey = toNamespacedKey(namespace, reportName);
          try {
            await access(reportPath);
            await client.putObject(
              REPORTS_BUCKET,
              reportKey,
              createReadStream(reportPath)
            );
          } catch {
            send({ line: "[warning] could not save HTML report" });
          }

          send({ done: true, exitCode, reportName });
        } catch (error) {
          if (cancelled) {
            send({
              done: true,
              cancelled: true,
              exitCode: null,
              reportName: null,
            });
            return;
          }

          send({
            line: `[error] ${
              error instanceof Error ? error.message : "k6 run failed"
            }`,
          });
          send({ done: true, exitCode: 1, reportName: null });
        } finally {
          // Wait for the dashboard port to be released before unlocking so the
          // next run never races the kernel socket (bug H2).
          await waitForPortFree(run.dashboardPort, 5000);
          release(run.id);
          closeRunOutput(run.id);
          try {
            controller.close();
          } catch {
            // already closed
          }
        }
      },
      cancel() {
        abortController.abort();
      },
    });

    return new Response(readable, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    release(run.id);
    closeRunOutput(run.id);
    throw error;
  }
}
