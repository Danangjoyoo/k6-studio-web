import { NextResponse } from "next/server";
import { getMinioClient, SCRIPTS_BUCKET, ensureBuckets } from "@/lib/minio";

type Params = { params: Promise<{ name: string }> };

export async function GET(_req: Request, { params }: Params) {
  await ensureBuckets();
  const { name } = await params;
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
  const { name } = await params;
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
  const { name } = await params;
  const client = getMinioClient();
  await client.removeObject(SCRIPTS_BUCKET, name);
  return new Response(null, { status: 204 });
}
