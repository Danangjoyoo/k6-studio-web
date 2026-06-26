import { NextResponse } from "next/server";
import { getMinioClient, REPORTS_BUCKET, ensureBuckets } from "@/lib/minio";
import {
  getNamespaceFromRequest,
  NamespaceError,
  toNamespacedKey,
} from "@/lib/namespaces";
import {
  normalizeReportPreviewTabs,
  parseReportPreviewTabsPayload,
  reportTabsSidecarName,
  ReportTabsValidationError,
  type ReportPreviewTabsPayload,
} from "@/lib/report-tabs";

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
      toNamespacedKey(namespace, reportTabsSidecarName(name))
    );
    const chunks: Buffer[] = [];
    await new Promise<void>((resolve, reject) => {
      stream.on("data", (chunk: Buffer) => chunks.push(chunk));
      stream.on("end", resolve);
      stream.on("error", reject);
    });
    const parsed = JSON.parse(Buffer.concat(chunks).toString("utf-8")) as unknown;
    return NextResponse.json({
      tabs: parseReportPreviewTabsPayload(parsed),
    });
  } catch {
    return NextResponse.json({ tabs: [] });
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

  let body: { tabs?: unknown };
  try {
    body = (await request.json()) as { tabs?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  try {
    const now = new Date().toISOString();
    const tabs = normalizeReportPreviewTabs(body.tabs ?? []).map((tab) => ({
      ...tab,
      updatedAt: now,
    }));
    const payload: ReportPreviewTabsPayload = { version: 1, tabs };
    const buffer = Buffer.from(JSON.stringify(payload), "utf-8");

    await ensureBuckets();
    const { name } = await params;
    await getMinioClient().putObject(
      REPORTS_BUCKET,
      toNamespacedKey(namespace, reportTabsSidecarName(name)),
      buffer,
      buffer.length,
      { "Content-Type": "application/json" }
    );

    return NextResponse.json(payload);
  } catch (error) {
    if (error instanceof ReportTabsValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}
