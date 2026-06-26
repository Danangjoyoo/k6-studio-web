import { NextResponse } from "next/server";
import { getMinioClient, REPORTS_BUCKET, ensureBuckets } from "@/lib/minio";
import {
  getNamespaceFromRequest,
  namespacePrefix,
  NamespaceError,
  stripNamespacePrefix,
} from "@/lib/namespaces";
import { isReportTabsSidecar } from "@/lib/report-tabs";

export async function GET(request: Request) {
  let namespace: string;
  try {
    namespace = getNamespaceFromRequest(request);
  } catch (error) {
    if (error instanceof NamespaceError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
  await ensureBuckets();
  const client = getMinioClient();
  const stream = client.listObjects(
    REPORTS_BUCKET,
    namespacePrefix(namespace),
    true
  );
  const reports: { name: string; size: number; lastModified: string }[] = [];

  await new Promise<void>((resolve, reject) => {
    stream.on("data", (obj) => {
      if (obj.name) {
        const relative = stripNamespacePrefix(namespace, obj.name);
        if (!relative || relative === ".keep" || relative === ".namespace") return;
        if (isReportTabsSidecar(relative)) return;
        reports.push({
          name: relative,
          size: obj.size ?? 0,
          lastModified: obj.lastModified?.toISOString() ?? "",
        });
      }
    });
    stream.on("end", resolve);
    stream.on("error", reject);
  });

  return NextResponse.json({ reports });
}
