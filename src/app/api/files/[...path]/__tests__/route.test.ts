import { EventEmitter } from "events";
import {
  DELETE,
  GET,
  PUT,
} from "@/app/api/files/[...path]/route";
import { SCRIPTS_BUCKET } from "@/lib/minio";

const mockEnsureBuckets = jest.fn();
const mockClient = {
  getObject: jest.fn(),
  putObject: jest.fn(),
  removeObject: jest.fn(),
};

jest.mock("@/lib/minio", () => ({
  getMinioClient: () => mockClient,
  SCRIPTS_BUCKET: "k6-scripts",
  ensureBuckets: () => mockEnsureBuckets(),
}));

function objectBody(content: string) {
  const stream = new EventEmitter();
  setImmediate(() => {
    stream.emit("data", Buffer.from(content, "utf-8"));
    stream.emit("end");
  });
  return stream;
}

function params(path: string[]) {
  return { params: Promise.resolve({ path }) };
}

beforeEach(() => {
  mockEnsureBuckets.mockReset();
  mockClient.getObject.mockReset();
  mockClient.putObject.mockReset();
  mockClient.removeObject.mockReset();
});

describe("/api/files/[...path]", () => {
  it("reads a namespace-prefixed object and returns a relative name", async () => {
    mockClient.getObject.mockResolvedValue(objectBody("content"));

    const response = await GET(
      new Request("http://localhost/api/files/api/smoke.ts?namespace=team-a"),
      params(["api", "smoke.ts"])
    );

    expect(response.status).toBe(200);
    expect(mockClient.getObject).toHaveBeenCalledWith(
      SCRIPTS_BUCKET,
      "team-a/api/smoke.ts"
    );
    await expect(response.json()).resolves.toEqual({
      name: "api/smoke.ts",
      content: "content",
    });
  });

  it("updates a namespace-prefixed object and returns a relative name", async () => {
    const response = await PUT(
      new Request("http://localhost/api/files/api/smoke.ts?namespace=team-a", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: "updated" }),
      }),
      params(["api", "smoke.ts"])
    );

    expect(response.status).toBe(200);
    expect(mockClient.putObject).toHaveBeenCalledWith(
      SCRIPTS_BUCKET,
      "team-a/api/smoke.ts",
      expect.any(Buffer),
      "updated".length,
      { "Content-Type": "text/plain" }
    );
    await expect(response.json()).resolves.toEqual({ name: "api/smoke.ts" });
  });

  it("deletes a namespace-prefixed object", async () => {
    const response = await DELETE(
      new Request("http://localhost/api/files/api/smoke.ts?namespace=team-a", {
        method: "DELETE",
      }),
      params(["api", "smoke.ts"])
    );

    expect(response.status).toBe(204);
    expect(mockClient.removeObject).toHaveBeenCalledWith(
      SCRIPTS_BUCKET,
      "team-a/api/smoke.ts"
    );
  });
});
