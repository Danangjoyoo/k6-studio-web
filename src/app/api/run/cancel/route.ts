import { NextResponse } from "next/server";
import { cancelRun } from "@/lib/run-lock";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    runId?: unknown;
  };
  const runId = typeof body.runId === "string" ? body.runId : "";

  if (!runId) {
    return NextResponse.json({ error: "runId required" }, { status: 400 });
  }

  if (!cancelRun(runId)) {
    return NextResponse.json({ error: "run not found" }, { status: 404 });
  }

  return NextResponse.json({ cancelled: true });
}
