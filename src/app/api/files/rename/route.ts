import { NextResponse } from "next/server";
import { getMinioClient, SCRIPTS_BUCKET, ensureBuckets } from "@/lib/minio";

/**
 * POST /api/files/rename
 * Body: { from: string; to: string; type: 'file' | 'folder' }
 *
 * MinIO has no native rename, so we copy + delete.
 * For folders we enumerate all objects under the prefix, copy each, then
 * remove the originals.
 */
export async function POST(request: Request) {
  await ensureBuckets();
  const { from, to, type } = (await request.json()) as {
    from: string;
    to: string;
    type: "file" | "folder";
  };

  if (!from || !to || !type) {
    return NextResponse.json(
      { error: "from, to, and type are required" },
      { status: 400 }
    );
  }

  const client = getMinioClient();

  if (type === "file") {
    await client.copyObject(SCRIPTS_BUCKET, to, `/${SCRIPTS_BUCKET}/${from}`);
    await client.removeObject(SCRIPTS_BUCKET, from);
  } else {
    // Folder: copy every object whose key starts with `from/`
    const fromPrefix = from.replace(/\/$/, "") + "/";
    const toPrefix = to.replace(/\/$/, "") + "/";
    const originals: string[] = await listAll(client, fromPrefix);

    for (const key of originals) {
      const newKey = toPrefix + key.slice(fromPrefix.length);
      await client.copyObject(SCRIPTS_BUCKET, newKey, `/${SCRIPTS_BUCKET}/${key}`);
    }
    if (originals.length > 0) {
      await client.removeObjects(SCRIPTS_BUCKET, originals);
    }
  }

  return NextResponse.json({ from, to });
}

async function listAll(
  client: ReturnType<typeof getMinioClient>,
  prefix: string
): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const stream = client.listObjects(SCRIPTS_BUCKET, prefix, true);
    const keys: string[] = [];
    stream.on("data", (obj) => { if (obj.name) keys.push(obj.name); });
    stream.on("end", () => resolve(keys));
    stream.on("error", reject);
  });
}
