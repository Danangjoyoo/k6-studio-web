import { NextResponse } from "next/server";
import {
  ensureBuckets,
  getMinioClient,
  REPORTS_BUCKET,
  SCRIPTS_BUCKET,
} from "@/lib/minio";
import {
  DEFAULT_NAMESPACE,
  getNamespaceFromRequest,
  NAMESPACE_MARKER,
  NAMESPACE_MARKER_OBJECT,
  NamespaceError,
  namespacePrefix,
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

export async function PATCH(request: Request) {
  let from: string;
  let to: string;
  try {
    const body = (await request.json()) as { from?: unknown; to?: unknown };
    from = normalizeNamespace(body.from);
    to = normalizeNamespace(body.to);
  } catch (error) {
    if (error instanceof NamespaceError || error instanceof SyntaxError) {
      return NextResponse.json(
        { error: "Invalid namespace" },
        { status: 400 }
      );
    }
    throw error;
  }

  if (from === DEFAULT_NAMESPACE) {
    return NextResponse.json(
      { error: "Default namespace cannot be renamed" },
      { status: 400 }
    );
  }
  if (to === DEFAULT_NAMESPACE) {
    return NextResponse.json(
      { error: "Default namespace cannot be used as a rename target" },
      { status: 400 }
    );
  }
  if (from === to) {
    return NextResponse.json({ from, to, moved: { scripts: 0, reports: 0 } });
  }

  await ensureBuckets();
  const client = getMinioClient();
  const [sourceScripts, targetScripts, sourceReports, targetReports] =
    await Promise.all([
      listObjectsWithPrefix(client, SCRIPTS_BUCKET, namespacePrefix(from)),
      listObjectsWithPrefix(client, SCRIPTS_BUCKET, namespacePrefix(to)),
      listObjectsWithPrefix(client, REPORTS_BUCKET, namespacePrefix(from)),
      listObjectsWithPrefix(client, REPORTS_BUCKET, namespacePrefix(to)),
    ]);

  if (!sourceScripts.includes(NAMESPACE_MARKER_OBJECT(from))) {
    return NextResponse.json({ error: "Namespace not found" }, { status: 404 });
  }

  if (targetScripts.length > 0 || targetReports.length > 0) {
    return NextResponse.json(
      { error: "Namespace already exists" },
      { status: 409 }
    );
  }

  const scriptMoves = buildNamespaceObjectMoves(sourceScripts, from, to);
  const reportMoves = buildNamespaceObjectMoves(sourceReports, from, to);

  await moveNamespaceObjects(client, SCRIPTS_BUCKET, scriptMoves);
  await moveNamespaceObjects(client, REPORTS_BUCKET, reportMoves);

  return NextResponse.json({
    from,
    to,
    moved: {
      scripts: scriptMoves.length,
      reports: reportMoves.length,
    },
  });
}

export async function DELETE(request: Request) {
  let namespace: string;
  try {
    namespace = getNamespaceFromRequest(request);
  } catch (error) {
    if (error instanceof NamespaceError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }

  if (namespace === DEFAULT_NAMESPACE) {
    return NextResponse.json(
      { error: "Default namespace cannot be deleted" },
      { status: 400 }
    );
  }

  await ensureBuckets();
  const client = getMinioClient();
  const markerObject = NAMESPACE_MARKER_OBJECT(namespace);
  const objects = await listObjectsWithPrefix(
    client,
    SCRIPTS_BUCKET,
    namespacePrefix(namespace)
  );

  if (objects.length === 0 || !objects.includes(markerObject)) {
    return NextResponse.json({ error: "Namespace not found" }, { status: 404 });
  }

  if (objects.some((objectName) => objectName !== markerObject)) {
    return NextResponse.json(
      { error: "Namespace must be empty before deletion" },
      { status: 409 }
    );
  }

  await client.removeObject(SCRIPTS_BUCKET, markerObject);
  return new Response(null, { status: 204 });
}

async function listObjectsWithPrefix(
  client: ReturnType<typeof getMinioClient>,
  bucket: string,
  prefix: string
): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const stream = client.listObjects(bucket, prefix, true);
    const names: string[] = [];
    stream.on("data", (obj) => {
      if (obj.name) names.push(obj.name);
    });
    stream.on("end", () => resolve(names));
    stream.on("error", reject);
  });
}

function buildNamespaceObjectMoves(
  sourceObjects: string[],
  from: string,
  to: string
): Array<{ from: string; to: string }> {
  const fromPrefix = namespacePrefix(from);
  const toPrefix = namespacePrefix(to);
  return sourceObjects
    .filter((objectName) => objectName.startsWith(fromPrefix))
    .map((objectName) => ({
      from: objectName,
      to: `${toPrefix}${objectName.slice(fromPrefix.length)}`,
    }));
}

async function moveNamespaceObjects(
  client: ReturnType<typeof getMinioClient>,
  bucket: string,
  moves: Array<{ from: string; to: string }>
) {
  for (const move of moves) {
    await client.copyObject(bucket, move.to, `/${bucket}/${move.from}`);
  }
  for (const move of moves) {
    await client.removeObject(bucket, move.from);
  }
}
