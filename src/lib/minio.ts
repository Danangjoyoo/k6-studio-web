import { Client } from "minio";

let client: Client | null = null;

export function getMinioClient(): Client {
  if (!client) {
    client = new Client({
      endPoint: process.env.MINIO_ENDPOINT ?? "localhost",
      port: parseInt(process.env.MINIO_PORT ?? "9000", 10),
      useSSL: process.env.MINIO_USE_SSL === "true",
      accessKey: process.env.MINIO_ACCESS_KEY ?? "minioadmin",
      secretKey: process.env.MINIO_SECRET_KEY ?? "minioadmin",
    });
  }
  return client;
}

export const SCRIPTS_BUCKET = "k6-scripts";
export const REPORTS_BUCKET = "k6-reports";

export async function ensureBuckets(): Promise<void> {
  const c = getMinioClient();
  for (const bucket of [SCRIPTS_BUCKET, REPORTS_BUCKET]) {
    const exists = await c.bucketExists(bucket);
    if (!exists) {
      await c.makeBucket(bucket, "us-east-1");
    }
  }
}
