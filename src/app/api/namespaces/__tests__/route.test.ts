import { EventEmitter } from "events";
import { DELETE, GET, POST } from "@/app/api/namespaces/route";
import { SCRIPTS_BUCKET } from "@/lib/minio";

const mockEnsureBuckets = jest.fn();
const mockClient = {
  listObjects: jest.fn(),
  putObject: jest.fn(),
  removeObject: jest.fn(),
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

describe("/api/namespaces", () => {
  beforeEach(() => {
    mockEnsureBuckets.mockReset();
    mockClient.listObjects.mockReset();
    mockClient.putObject.mockReset();
    mockClient.removeObject.mockReset();
  });

  it("lists unique namespaces and includes default", async () => {
    mockClient.listObjects.mockImplementation(() =>
      objectStream(["team-a/api.ts", "team-a/.namespace", "team-b/load.ts"])
    );

    const response = await GET();

    await expect(response.json()).resolves.toEqual({
      namespaces: ["default", "team-a"],
      current: "default",
    });
    expect(mockClient.listObjects).toHaveBeenCalledWith(SCRIPTS_BUCKET, "", true);
  });

  it("lists only explicitly marked namespaces and default", async () => {
    mockClient.listObjects.mockImplementation(() =>
      objectStream([
        "src/a.ts",
        "folder/.keep",
        "team-a/.namespace",
        "team-a/script.ts",
        "team-empty/.namespace",
      ])
    );

    const response = await GET();

    await expect(response.json()).resolves.toEqual({
      namespaces: ["default", "team-a", "team-empty"],
      current: "default",
    });
  });

  it("creates a namespace marker", async () => {
    const response = await POST(
      new Request("http://localhost/api/namespaces", {
        method: "POST",
        body: JSON.stringify({ name: "team-a" }),
      })
    );

    expect(response.status).toBe(201);
    expect(mockClient.putObject).toHaveBeenCalledWith(
      SCRIPTS_BUCKET,
      "team-a/.namespace",
      expect.any(Buffer),
      0,
      { "Content-Type": "application/octet-stream" }
    );
  });

  it("deletes an empty namespace marker", async () => {
    mockClient.listObjects.mockImplementation(() =>
      objectStream(["team-empty/.namespace"])
    );

    const response = await DELETE(
      new Request("http://localhost/api/namespaces?namespace=team-empty", {
        method: "DELETE",
      })
    );

    expect(response.status).toBe(204);
    expect(mockClient.removeObject).toHaveBeenCalledWith(
      SCRIPTS_BUCKET,
      "team-empty/.namespace"
    );
  });

  it("rejects deleting a namespace when scripts or folders still exist", async () => {
    mockClient.listObjects.mockImplementation(() =>
      objectStream(["team-a/.namespace", "team-a/script.ts"])
    );

    const response = await DELETE(
      new Request("http://localhost/api/namespaces?namespace=team-a", {
        method: "DELETE",
      })
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "Namespace must be empty before deletion",
    });
    expect(mockClient.removeObject).not.toHaveBeenCalled();
  });

  it("rejects deleting the default namespace", async () => {
    const response = await DELETE(
      new Request("http://localhost/api/namespaces?namespace=default", {
        method: "DELETE",
      })
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Default namespace cannot be deleted",
    });
    expect(mockClient.listObjects).not.toHaveBeenCalled();
    expect(mockClient.removeObject).not.toHaveBeenCalled();
  });
});
