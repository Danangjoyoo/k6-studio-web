import { getMinioClient } from "@/lib/minio";

describe("minio", () => {
  it("getMinioClient returns a Client instance", () => {
    const client = getMinioClient();
    expect(client).toBeDefined();
    expect(typeof client.listObjects).toBe("function");
  });
});
