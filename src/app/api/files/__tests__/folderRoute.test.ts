import { EventEmitter } from "events";
import { DELETE, POST } from "@/app/api/files/folder/route";
import { SCRIPTS_BUCKET } from "@/lib/minio";

const mockEnsureBuckets = jest.fn();
const mockClient = {
  listObjects: jest.fn(),
  removeObjects: jest.fn(),
  putObject: jest.fn(),
};

jest.mock("@/lib/minio", () => ({
  getMinioClient: () => mockClient,
  SCRIPTS_BUCKET: "k6-scripts",
  ensureBuckets: () => mockEnsureBuckets(),
}));

function objectStream(names: string[]) {
  const stream = new EventEmitter();
  queueMicrotask(() => {
    for (const name of names) stream.emit("data", { name });
    stream.emit("end");
  });
  return stream;
}

function jsonRequest(body: unknown) {
  return new Request("http://localhost/api/files/folder", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  mockEnsureBuckets.mockReset();
  mockClient.listObjects.mockReset();
  mockClient.removeObjects.mockReset();
  mockClient.putObject.mockReset();
});

describe("DELETE /api/files/folder", () => {
  it("normalizes folder paths and removes all objects under the prefix", async () => {
    mockClient.listObjects.mockImplementation(() =>
      objectStream(["default/auth#v1/.keep", "default/auth#v1/login.ts"])
    );

    const response = await DELETE(jsonRequest({ path: "auth#v1///" }));

    expect(response.status).toBe(204);
    expect(mockEnsureBuckets).toHaveBeenCalledTimes(1);
    expect(mockClient.listObjects).toHaveBeenCalledWith(
      SCRIPTS_BUCKET,
      "default/auth#v1/",
      true
    );
    expect(mockClient.removeObjects).toHaveBeenCalledWith(SCRIPTS_BUCKET, [
      "default/auth#v1/.keep",
      "default/auth#v1/login.ts",
    ]);
  });

  it("removes only objects under the requested namespace prefix", async () => {
    mockClient.listObjects.mockImplementation(() =>
      objectStream(["team-a/auth/.keep", "team-a/auth/login.ts"])
    );

    const response = await DELETE(
      jsonRequest({ namespace: "team-a", path: "auth///" })
    );

    expect(response.status).toBe(204);
    expect(mockClient.listObjects).toHaveBeenCalledWith(
      SCRIPTS_BUCKET,
      "team-a/auth/",
      true
    );
    expect(mockClient.removeObjects).toHaveBeenCalledWith(SCRIPTS_BUCKET, [
      "team-a/auth/.keep",
      "team-a/auth/login.ts",
    ]);
  });

  it("returns 400 when path is missing", async () => {
    const response = await DELETE(jsonRequest({}));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "path required" });
    expect(mockClient.listObjects).not.toHaveBeenCalled();
    expect(mockClient.removeObjects).not.toHaveBeenCalled();
  });
});

describe("POST /api/files/folder", () => {
  it("creates a namespace-prefixed .keep sentinel", async () => {
    const response = await POST(
      new Request("http://localhost/api/files/folder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ namespace: "team-a", path: "auth" }),
      })
    );

    expect(response.status).toBe(201);
    expect(mockClient.putObject).toHaveBeenCalledWith(
      SCRIPTS_BUCKET,
      "team-a/auth/.keep",
      expect.any(Buffer),
      0,
      { "Content-Type": "application/octet-stream" }
    );
    await expect(response.json()).resolves.toEqual({ path: "auth" });
  });
});
