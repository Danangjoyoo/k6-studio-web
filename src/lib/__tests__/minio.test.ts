import { getMinioClient } from "@/lib/minio";

describe("minio", () => {
  it("getMinioClient returns a Client instance", () => {
    const client = getMinioClient();
    expect(client).toBeDefined();
    expect(typeof client.listObjects).toBe("function");
  });
});

describe("getMinioClient env parsing", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    delete process.env.MINIO_ENDPOINT;
    delete process.env.MINIO_PORT;
    delete process.env.MINIO_ACCESS_KEY;
    delete process.env.MINIO_SECRET_KEY;
    delete process.env.MINIO_USE_SSL;
    delete process.env.AWS_S3_BUCKET;
    delete process.env.AWS_S3_ENDPOINT;
    delete process.env.AWS_S3_ACCESS_KEY;
    delete process.env.AWS_S3_SECRET_KEY;
    delete process.env.AWS_S3_USE_SSL;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("uses AWS_S3_ENDPOINT host:port without MINIO_PORT", async () => {
    process.env.AWS_S3_ENDPOINT = "minio:9000";
    process.env.AWS_S3_ACCESS_KEY = "access";
    process.env.AWS_S3_SECRET_KEY = "secret";
    process.env.AWS_S3_USE_SSL = "false";

    const { getMinioClient } = await import("@/lib/minio");
    const client = getMinioClient() as unknown as {
      host: string;
      port: number;
      protocol: string;
      accessKey: string;
      secretKey: string;
    };

    expect(client.host).toBe("minio");
    expect(client.port).toBe(9000);
    expect(client.protocol).toBe("http:");
    expect(client.accessKey).toBe("access");
    expect(client.secretKey).toBe("secret");
  });

  it("uses port 9000 for legacy MINIO_ENDPOINT without MINIO_PORT", async () => {
    process.env.MINIO_ENDPOINT = "minio";

    const { getMinioClient } = await import("@/lib/minio");
    const client = getMinioClient() as unknown as {
      host: string;
      port: number;
      protocol: string;
    };

    expect(client.host).toBe("minio");
    expect(client.port).toBe(9000);
    expect(client.protocol).toBe("http:");
  });

  it("parses URL endpoints and exports AWS_S3_BUCKET as scripts bucket", async () => {
    process.env.AWS_S3_BUCKET = "custom-scripts";
    process.env.AWS_S3_ENDPOINT = "https://s3.local:9443";
    process.env.AWS_S3_USE_SSL = "true";

    const { getMinioClient, SCRIPTS_BUCKET } = await import("@/lib/minio");
    const client = getMinioClient() as unknown as {
      host: string;
      port: number;
      protocol: string;
    };

    expect(SCRIPTS_BUCKET).toBe("custom-scripts");
    expect(client.host).toBe("s3.local");
    expect(client.port).toBe(9443);
    expect(client.protocol).toBe("https:");
  });
});

describe("ensureBuckets", () => {
  afterEach(() => {
    jest.dontMock("minio");
    jest.resetModules();
  });

  it("treats a concurrent bucket create as successful", async () => {
    const mockClient = {
      bucketExists: jest.fn().mockResolvedValue(false),
      makeBucket: jest
        .fn()
        .mockRejectedValueOnce(
          Object.assign(new Error("already owned"), {
            code: "BucketAlreadyOwnedByYou",
          })
        )
        .mockResolvedValueOnce(undefined),
    };

    jest.resetModules();
    jest.doMock("minio", () => ({
      Client: jest.fn(() => mockClient),
    }));

    const { ensureBuckets } = await import("@/lib/minio");

    await expect(ensureBuckets()).resolves.toBeUndefined();
    expect(mockClient.makeBucket).toHaveBeenCalledWith(
      "k6-scripts",
      "us-east-1"
    );
    expect(mockClient.makeBucket).toHaveBeenCalledWith(
      "k6-reports",
      "us-east-1"
    );
  });
});
