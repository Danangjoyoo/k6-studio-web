import { NextResponse } from "next/server";
import { getMinioClient, SCRIPTS_BUCKET, ensureBuckets } from "@/lib/minio";

type Params = { params: Promise<{ path: string[] }> };

export async function GET(_req: Request, { params }: Params) {
  await ensureBuckets();
  const { path } = await params;
  const name = path.join("/");
  const client = getMinioClient();
  try {
    const stream = await client.getObject(SCRIPTS_BUCKET, name);
    const chunks: Buffer[] = [];
    await new Promise<void>((resolve, reject) => {
      stream.on("data", (chunk: Buffer) => chunks.push(chunk));
      stream.on("end", resolve);
      stream.on("error", reject);
    });
    return NextResponse.json({
      name,
      content: Buffer.concat(chunks).toString("utf-8"),
    });
  } catch {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
}

export async function PUT(request: Request, { params }: Params) {
  await ensureBuckets();
  const { path } = await params;
  const name = path.join("/");
  const { content } = (await request.json()) as { content: string };
  const client = getMinioClient();
  const buffer = Buffer.from(content, "utf-8");
  await client.putObject(SCRIPTS_BUCKET, name, buffer, buffer.length, {
    "Content-Type": "text/plain",
  });
  return NextResponse.json({ name });
}

export async function DELETE(_req: Request, { params }: Params) {
  await ensureBuckets();
  const { path } = await params;
  const name = path.join("/");
  const client = getMinioClient();

  if (name.endsWith("/")) {
    // Folder delete: remove all objects under this prefix
    const prefix = name;
    const objects: string[] = await listObjectsWithPrefix(client, prefix);
    if (objects.length > 0) {
      await client.removeObjects(SCRIPTS_BUCKET, objects);
    }
  } else {
    await client.removeObject(SCRIPTS_BUCKET, name);
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
    stream.on("data", (obj) => { if (obj.name) names.push(obj.name); });
    stream.on("end", () => resolve(names));
    stream.on("error", reject);
  });
}
