import { NextResponse } from "next/server";
import {
  ensureBuckets,
  getMinioClient,
  REPORTS_BUCKET,
  SCRIPTS_BUCKET,
} from "@/lib/minio";
import { getStatus } from "@/lib/run-lock";
import {
  buildMovePlan,
  executeMovePlan,
  MoveConflictError,
  type MoveItem,
} from "@/lib/files-move";
import {
  namespacePrefix,
  NamespaceError,
  normalizeNamespace,
  stripNamespacePrefix,
} from "@/lib/namespaces";

interface MoveRequestBody {
  namespace?: unknown;
  items?: MoveItem[];
  targetFolder?: string;
}

type RunStatusWithLegacyName = ReturnType<typeof getStatus> & {
  namespace?: string | null;
  runningScript?: string | null;
};

export async function POST(request: Request) {
  let body: MoveRequestBody;
  try {
    body = (await request.json()) as MoveRequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!Array.isArray(body.items) || typeof body.targetFolder !== "string") {
    return NextResponse.json(
      { error: "items and targetFolder are required" },
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
    const plan = buildMovePlan({
      items: body.items,
      targetFolder: body.targetFolder,
      existingScriptObjectKeys: scriptObjectKeys,
      existingReportObjectKeys: reportObjectKeys,
      activeRunningScript,
    });

    await executeMovePlan(client, plan, namespace);

    return NextResponse.json({
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
