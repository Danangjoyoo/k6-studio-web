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

interface MoveRequestBody {
  items?: MoveItem[];
  targetFolder?: string;
}

type RunStatusWithLegacyName = ReturnType<typeof getStatus> & {
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
    const plan = buildMovePlan({
      items: body.items,
      targetFolder: body.targetFolder,
      existingScriptObjectKeys: scriptObjectKeys,
      existingReportObjectKeys: reportObjectKeys,
      activeRunningScript,
    });

    await executeMovePlan(client, plan);

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
