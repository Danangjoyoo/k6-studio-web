import { NextResponse } from "next/server";
import { getMinioClient, REPORTS_BUCKET, ensureBuckets } from "@/lib/minio";
import {
  getNamespaceFromRequest,
  NamespaceError,
  toNamespacedKey,
} from "@/lib/namespaces";
import {
  normalizeReportNotes,
  parseReportNotesPayload,
  reportNotesSidecarName,
  ReportNotesValidationError,
  type ReportNotesPayload,
} from "@/lib/report-notes";

type Params = { params: Promise<{ name: string }> };

export async function GET(request: Request, { params }: Params) {
  let namespace: string;
  try {
    namespace = getNamespaceFromRequest(request);
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
      toNamespacedKey(namespace, reportNotesSidecarName(name))
    );
    const chunks: Buffer[] = [];
    await new Promise<void>((resolve, reject) => {
      stream.on("data", (chunk: Buffer) => chunks.push(chunk));
      stream.on("end", resolve);
      stream.on("error", reject);
    });
    const parsed = JSON.parse(Buffer.concat(chunks).toString("utf-8")) as unknown;
    return NextResponse.json({
      notes: parseReportNotesPayload(parsed),
    });
  } catch {
    return NextResponse.json({ notes: [] });
  }
}

export async function PUT(request: Request, { params }: Params) {
  let namespace: string;
  try {
    namespace = getNamespaceFromRequest(request);
  } catch (error) {
    if (error instanceof NamespaceError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }

  let body: { notes?: unknown };
  try {
    body = (await request.json()) as { notes?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  try {
    const now = new Date().toISOString();
    const notes = normalizeReportNotes(body.notes ?? []).map((note) => ({
      ...note,
      updatedAt: now,
    }));
    const payload: ReportNotesPayload = { version: 1, notes };
    const buffer = Buffer.from(JSON.stringify(payload), "utf-8");

    await ensureBuckets();
    const { name } = await params;
    await getMinioClient().putObject(
      REPORTS_BUCKET,
      toNamespacedKey(namespace, reportNotesSidecarName(name)),
      buffer,
      buffer.length,
      { "Content-Type": "application/json" }
    );

    return NextResponse.json(payload);
  } catch (error) {
    if (error instanceof ReportNotesValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}
