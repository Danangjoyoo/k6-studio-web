import { NextResponse } from "next/server";
import { ensureBuckets, getMinioClient, SCRIPTS_BUCKET } from "@/lib/minio";
import {
  DEFAULT_NAMESPACE,
  NAMESPACE_MARKER,
  NAMESPACE_MARKER_OBJECT,
  NamespaceError,
  normalizeNamespace,
} from "@/lib/namespaces";

export async function GET() {
  await ensureBuckets();
  const client = getMinioClient();
  const stream = client.listObjects(SCRIPTS_BUCKET, "", true);
  const namespaces = new Set<string>([DEFAULT_NAMESPACE]);

  await new Promise<void>((resolve, reject) => {
    stream.on("data", (obj) => {
      if (!obj.name || !obj.name.includes("/")) return;
      const [namespace, ...relativeParts] = obj.name.split("/");
      try {
        const normalized = normalizeNamespace(namespace);
        if (relativeParts.length === 1 && relativeParts[0] === NAMESPACE_MARKER) {
          namespaces.add(normalized);
        }
      } catch {
        // Ignore objects that do not follow the namespace key convention.
      }
    });
    stream.on("end", resolve);
    stream.on("error", reject);
  });

  return NextResponse.json({
    namespaces: Array.from(namespaces).sort((a, b) => {
      if (a === DEFAULT_NAMESPACE) return -1;
      if (b === DEFAULT_NAMESPACE) return 1;
      return a.localeCompare(b);
    }),
    current: DEFAULT_NAMESPACE,
  });
}

export async function POST(request: Request) {
  let namespace: string;
  try {
    const { name } = (await request.json()) as { name?: unknown };
    namespace = normalizeNamespace(name);
  } catch (error) {
    if (error instanceof NamespaceError || error instanceof SyntaxError) {
      return NextResponse.json(
        { error: "Invalid namespace" },
        { status: 400 }
      );
    }
    throw error;
  }

  await ensureBuckets();
  const client = getMinioClient();
  await client.putObject(
    SCRIPTS_BUCKET,
    NAMESPACE_MARKER_OBJECT(namespace),
    Buffer.alloc(0),
    0,
    { "Content-Type": "application/octet-stream" }
  );

  return NextResponse.json({ namespace }, { status: 201 });
}
