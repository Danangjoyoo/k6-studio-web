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

interface RenameRequestBody {
  from?: unknown;
  to?: unknown;
  type?: unknown;
}

type RunStatusWithLegacyName = ReturnType<typeof getStatus> & {
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

  await ensureBuckets();
  const client = getMinioClient();
  const [scriptObjectKeys, reportObjectKeys] = await Promise.all([
    listAll(client, SCRIPTS_BUCKET),
    listAll(client, REPORTS_BUCKET),
  ]);
  const status = getStatus() as RunStatusWithLegacyName;
  const activeRunningScript = status.running
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

    await executeMovePlan(client, plan);

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

async function listAll(
  client: ReturnType<typeof getMinioClient>,
  bucket: string
): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const stream = client.listObjects(bucket, "", true);
    const keys: string[] = [];
    stream.on("data", (obj) => {
      if (obj.name) keys.push(obj.name);
    });
    stream.on("end", () => resolve(keys));
    stream.on("error", reject);
  });
}
