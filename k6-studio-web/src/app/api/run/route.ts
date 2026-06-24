import { NextResponse } from "next/server";
import { writeFile, mkdir, access } from "fs/promises";
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
        await access(reportPath);
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
