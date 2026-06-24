import { NextResponse } from "next/server";
import { getMinioClient, REPORTS_BUCKET, ensureBuckets } from "@/lib/minio";

export async function GET() {
  await ensureBuckets();
  const client = getMinioClient();
  const stream = client.listObjects(REPORTS_BUCKET, "", false);
  const reports: { name: string; size: number; lastModified: string }[] = [];

  await new Promise<void>((resolve, reject) => {
    stream.on("data", (obj) => {
      if (obj.name) {
        reports.push({
          name: obj.name,
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
