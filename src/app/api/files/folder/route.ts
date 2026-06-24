import { NextResponse } from "next/server";
import { getMinioClient, SCRIPTS_BUCKET, ensureBuckets } from "@/lib/minio";
import { KEEP_SUFFIX } from "@/lib/files-tree";

export async function POST(request: Request) {
  await ensureBuckets();
  const { path } = (await request.json()) as { path: string };
  if (!path || typeof path !== "string") {
    return NextResponse.json({ error: "path required" }, { status: 400 });
  }
  const key = path.replace(/\/*$/, "") + KEEP_SUFFIX;
  const client = getMinioClient();
  const empty = Buffer.alloc(0);
  await client.putObject(SCRIPTS_BUCKET, key, empty, 0, {
    "Content-Type": "application/octet-stream",
  });
  return NextResponse.json({ path }, { status: 201 });
}

export async function DELETE(request: Request) {
  const { path } = (await request.json()) as { path?: unknown };
  if (typeof path !== "string" || !path) {
    return NextResponse.json({ error: "path required" }, { status: 400 });
  }

  await ensureBuckets();
  const prefix = `${path.replace(/\/+$/, "")}/`;
  const client = getMinioClient();
  const objects = await listObjectsWithPrefix(client, prefix);
  if (objects.length > 0) {
    await client.removeObjects(SCRIPTS_BUCKET, objects);
  }
  return new Response(null, { status: 204 });
}

async function listObjectsWithPrefix(
  client: ReturnType<typeof getMinioClient>,
  prefix: string
): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const stream = client.listObjects(SCRIPTS_BUCKET, prefix, true);
    const names: string[] = [];
    stream.on("data", (obj) => {
      if (obj.name) names.push(obj.name);
    });
    stream.on("end", () => resolve(names));
    stream.on("error", reject);
  });
}
