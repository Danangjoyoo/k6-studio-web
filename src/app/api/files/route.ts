import { NextResponse } from "next/server";
import { getMinioClient, SCRIPTS_BUCKET, ensureBuckets } from "@/lib/minio";
import { buildTree, KEEP_SUFFIX, type FileNode } from "@/lib/files-tree";

export type { FileNode };

const DEFAULT_SCRIPT = `// example script
import http from 'k6/http';
import { sleep } from 'k6';

export const options = {
  stages: [
    { duration: '5s', target: 10 },
    { duration: '15s', target: 10 },
    { duration: '5s', target: 0 },
  ],
};

export default () => {
  http.get('https://test.k6.io');
  sleep(1);
};
`;

export async function GET() {
  await ensureBuckets();
  const client = getMinioClient();
  const stream = client.listObjects(SCRIPTS_BUCKET, "", true);
  const paths: string[] = [];

  await new Promise<void>((resolve, reject) => {
    stream.on("data", (obj) => { if (obj.name) paths.push(obj.name); });
    stream.on("end", resolve);
    stream.on("error", reject);
  });

  paths.sort();
  const tree = buildTree(paths);
  const files = paths
    .filter((p) => !p.endsWith(KEEP_SUFFIX))
    .map((name) => ({ name }));

  return NextResponse.json({ files, tree });
}

export async function POST(request: Request) {
  await ensureBuckets();
  const { name, content } = (await request.json()) as {
    name: string;
    content: string;
  };

  if (!name || typeof content !== "string") {
    return NextResponse.json(
      { error: "name and content required" },
      { status: 400 }
    );
  }

  const client = getMinioClient();
  const body = content || DEFAULT_SCRIPT;
  const buffer = Buffer.from(body, "utf-8");
  await client.putObject(SCRIPTS_BUCKET, name, buffer, buffer.length, {
    "Content-Type": "text/plain",
  });

  return NextResponse.json({ name }, { status: 201 });
}
