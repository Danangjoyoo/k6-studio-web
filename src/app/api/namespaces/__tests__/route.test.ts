import { EventEmitter } from "events";
import { GET, POST } from "@/app/api/namespaces/route";
import { SCRIPTS_BUCKET } from "@/lib/minio";

const mockEnsureBuckets = jest.fn();
const mockClient = { listObjects: jest.fn(), putObject: jest.fn() };

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
});
