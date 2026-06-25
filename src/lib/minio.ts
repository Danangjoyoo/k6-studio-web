import { Client } from "minio";

let client: Client | null = null;

const endpointValue =
  process.env.AWS_S3_ENDPOINT ??
  (process.env.MINIO_ENDPOINT && process.env.MINIO_PORT
    ? `${process.env.MINIO_ENDPOINT}:${process.env.MINIO_PORT}`
    : process.env.MINIO_ENDPOINT) ??
  "localhost:9000";

function parseEndpoint(value: string) {
  const withProtocol = value.includes("://") ? value : `http://${value}`;
  const url = new URL(withProtocol);
  const useSSLFromEndpoint = url.protocol === "https:";
  const useSSL =
    process.env.AWS_S3_USE_SSL !== undefined
      ? process.env.AWS_S3_USE_SSL === "true"
      : process.env.MINIO_USE_SSL !== undefined
        ? process.env.MINIO_USE_SSL === "true"
        : useSSLFromEndpoint;

  return {
    endPoint: url.hostname,
    port: url.port ? Number(url.port) : useSSL ? 443 : 80,
    useSSL,
  };
}

export function getMinioClient(): Client {
  if (!client) {
    const endpoint = parseEndpoint(endpointValue);
    client = new Client({
      ...endpoint,
      accessKey:
        process.env.AWS_S3_ACCESS_KEY ??
        process.env.MINIO_ACCESS_KEY ??
        "minioadmin",
      secretKey:
        process.env.AWS_S3_SECRET_KEY ??
        process.env.MINIO_SECRET_KEY ??
        "minioadmin",
    });
  }
  return client;
}

export const SCRIPTS_BUCKET = process.env.AWS_S3_BUCKET ?? "k6-scripts";
export const REPORTS_BUCKET =
  process.env.AWS_S3_REPORTS_BUCKET ?? "k6-reports";

export async function ensureBuckets(): Promise<void> {
  const c = getMinioClient();
  for (const bucket of [SCRIPTS_BUCKET, REPORTS_BUCKET]) {
    const exists = await c.bucketExists(bucket);
    if (!exists) {
      await c.makeBucket(bucket, "us-east-1");
    }
  }
}
