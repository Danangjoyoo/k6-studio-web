import { NextResponse } from "next/server";
import {
  ensureBuckets,
  getMinioClient,
  REPORTS_BUCKET,
  SCRIPTS_BUCKET,
} from "@/lib/minio";
import { getStatus } from "@/lib/run-lock";
import {
  buildRenamePlan,
  executeMovePlan,
  MoveConflictError,
} from "@/lib/files-move";
import {
  namespacePrefix,
  NamespaceError,
  normalizeNamespace,
  stripNamespacePrefix,
} from "@/lib/namespaces";

interface RenameRequestBody {
  namespace?: unknown;
  from?: unknown;
  to?: unknown;
  type?: unknown;
}

type RunStatusWithLegacyName = ReturnType<typeof getStatus> & {
  namespace?: string | null;
  runningScript?: string | null;
};

/**
 * POST /api/files/rename
 * Body: { from: string; to: string; type: 'file' | 'folder' }
 *
 * MinIO has no native rename, so this plans copy + delete operations for
 * script objects and any matching saved report history.
 */
export async function POST(request: Request) {
  let body: RenameRequestBody;
  try {
    body = (await request.json()) as RenameRequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json(
      { error: "from, to, and type are required" },
      { status: 400 }
    );
  }

  if (
    typeof body.from !== "string" ||
    !body.from ||
    typeof body.to !== "string" ||
    !body.to ||
    (body.type !== "file" && body.type !== "folder")
  ) {
    return NextResponse.json(
      { error: "from, to, and type are required" },
      { status: 400 }
    );
  }
  let namespace: string;
  try {
    namespace = normalizeNamespace(body.namespace);
  } catch (error) {
    if (error instanceof NamespaceError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }

  await ensureBuckets();
  const client = getMinioClient();
  const [scriptObjectKeys, reportObjectKeys] = await Promise.all([
    listNamespace(client, SCRIPTS_BUCKET, namespace),
    listNamespace(client, REPORTS_BUCKET, namespace),
  ]);
  const status = getStatus() as RunStatusWithLegacyName;
  const activeRunningScript = status.running && status.namespace === namespace
    ? status.script ?? status.runningScript ?? null
    : null;

  try {
    const plan = buildRenamePlan({
      from: body.from,
      to: body.to,
      type: body.type,
      existingScriptObjectKeys: scriptObjectKeys,
      existingReportObjectKeys: reportObjectKeys,
      activeRunningScript,
    });

    await executeMovePlan(client, plan, namespace);

    return NextResponse.json({
      from: body.from,
      to: body.to,
      moved: {
        scripts: plan.scriptObjectMoves.length,
        reports: plan.reportObjectMoves.length,
      },
    });
  } catch (error) {
    if (error instanceof MoveConflictError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      );
    }
    throw error;
  }
}

async function listNamespace(
  client: ReturnType<typeof getMinioClient>,
  bucket: string,
  namespace: string
): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const stream = client.listObjects(bucket, namespacePrefix(namespace), true);
    const keys: string[] = [];
    stream.on("data", (obj) => {
      if (!obj.name) return;
      const relative = stripNamespacePrefix(namespace, obj.name);
      if (!relative || relative === ".keep" || relative === ".namespace") return;
      keys.push(relative);
    });
    stream.on("end", () => resolve(keys));
    stream.on("error", reject);
  });
}
