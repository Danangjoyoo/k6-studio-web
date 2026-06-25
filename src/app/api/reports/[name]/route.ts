import { getMinioClient, REPORTS_BUCKET, ensureBuckets } from "@/lib/minio";
import {
  getNamespaceFromRequest,
  NamespaceError,
  toNamespacedKey,
} from "@/lib/namespaces";
import { NextResponse } from "next/server";

type Params = { params: Promise<{ name: string }> };

export async function GET(_req: Request, { params }: Params) {
  let namespace: string;
  try {
    namespace = getNamespaceFromRequest(_req);
  } catch (error) {
    if (error instanceof NamespaceError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
  await ensureBuckets();
  const { name } = await params;
  const client = getMinioClient();
  try {
    const stream = await client.getObject(
      REPORTS_BUCKET,
      toNamespacedKey(namespace, name)
    );
    const chunks: Buffer[] = [];
    await new Promise<void>((resolve, reject) => {
      stream.on("data", (chunk: Buffer) => chunks.push(chunk));
      stream.on("end", resolve);
      stream.on("error", reject);
    });
    return new Response(Buffer.concat(chunks).toString("utf-8"), {
      headers: { "Content-Type": "text/html" },
    });
  } catch {
    return new Response("not found", { status: 404 });
  }
}
