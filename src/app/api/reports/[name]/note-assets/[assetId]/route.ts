import { NextResponse } from "next/server";
import { getMinioClient, REPORTS_BUCKET, ensureBuckets } from "@/lib/minio";
import {
  getNamespaceFromRequest,
  NamespaceError,
  toNamespacedKey,
} from "@/lib/namespaces";
import {
  reportNoteAssetObjectName,
  ReportNotesValidationError,
  validateReportNoteAssetId,
} from "@/lib/report-notes";

type Params = { params: Promise<{ name: string; assetId: string }> };

const CONTENT_TYPES: Record<string, string> = {
  gif: "image/gif",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

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

  const { assetId } = await params;
  let safeAssetId: string;
  try {
    safeAssetId = validateReportNoteAssetId(assetId);
  } catch (error) {
    if (error instanceof ReportNotesValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }

  await ensureBuckets();
  try {
    const stream = await getMinioClient().getObject(
      REPORTS_BUCKET,
      toNamespacedKey(namespace, reportNoteAssetObjectName(safeAssetId))
    );
    const chunks: Buffer[] = [];
    await new Promise<void>((resolve, reject) => {
      stream.on("data", (chunk: Buffer) => chunks.push(chunk));
      stream.on("end", resolve);
      stream.on("error", reject);
    });

    return new Response(Buffer.concat(chunks), {
      headers: {
        "Content-Type": contentTypeForAsset(safeAssetId),
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
}

function contentTypeForAsset(assetId: string): string {
  const extension = assetId.split(".").pop()?.toLowerCase() ?? "";
  return CONTENT_TYPES[extension] ?? "application/octet-stream";
}
