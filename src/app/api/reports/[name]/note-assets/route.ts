import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { getMinioClient, REPORTS_BUCKET, ensureBuckets } from "@/lib/minio";
import {
  getNamespaceFromRequest,
  NamespaceError,
  toNamespacedKey,
} from "@/lib/namespaces";
import {
  reportNoteAssetObjectName,
  reportNoteAssetUrl,
} from "@/lib/report-notes";

type Params = { params: Promise<{ name: string }> };

const IMAGE_EXTENSIONS: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
};

export async function POST(request: Request, { params }: Params) {
  let namespace: string;
  try {
    namespace = getNamespaceFromRequest(request);
  } catch (error) {
    if (error instanceof NamespaceError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Image file required" }, { status: 400 });
  }

  const extension = IMAGE_EXTENSIONS[file.type];
  if (!extension) {
    return NextResponse.json(
      { error: "Only png, jpeg, gif, and webp images are supported" },
      { status: 400 }
    );
  }

  const { name } = await params;
  const assetId = `asset_${randomUUID()}.${extension}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  await ensureBuckets();
  await getMinioClient().putObject(
    REPORTS_BUCKET,
    toNamespacedKey(namespace, reportNoteAssetObjectName(assetId)),
    buffer,
    buffer.length,
    { "Content-Type": file.type }
  );

  return NextResponse.json(
    {
      assetId,
      url: reportNoteAssetUrl(name, assetId, namespace),
    },
    { status: 201 }
  );
}
