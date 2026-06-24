import { NextResponse } from "next/server";
import { getMinioClient, SCRIPTS_BUCKET, ensureBuckets } from "@/lib/minio";

export async function GET() {
  await ensureBuckets();
  const client = getMinioClient();
  const stream = client.listObjects(SCRIPTS_BUCKET, "", false);
  const files: { name: string; size: number; lastModified: string }[] = [];

  await new Promise<void>((resolve, reject) => {
    stream.on("data", (obj) => {
      if (obj.name) {
        files.push({
          name: obj.name,
          size: obj.size ?? 0,
          lastModified: obj.lastModified?.toISOString() ?? "",
        });
      }
    });
    stream.on("end", resolve);
    stream.on("error", reject);
  });

  return NextResponse.json({ files });
}

export async function POST(request: Request) {
  await ensureBuckets();
  const { name, content } = (await request.json()) as {
    name: string;
    content: string;
  };

  if (!name || typeof content !== "string") {
    return NextResponse.json(
      { error: "name and content required" },
      { status: 400 }
    );
  }

  const client = getMinioClient();
  const buffer = Buffer.from(content, "utf-8");
  await client.putObject(SCRIPTS_BUCKET, name, buffer, buffer.length, {
    "Content-Type": "text/plain",
  });

  return NextResponse.json({ name }, { status: 201 });
}
