import { EventEmitter } from "events";
import { GET, POST } from "@/app/api/files/route";
import { SCRIPTS_BUCKET } from "@/lib/minio";

const mockEnsureBuckets = jest.fn();
const mockClient = {
  listObjects: jest.fn(),
  putObject: jest.fn(),
};

jest.mock("@/lib/minio", () => ({
  getMinioClient: () => mockClient,
  SCRIPTS_BUCKET: "k6-scripts",
  ensureBuckets: () => mockEnsureBuckets(),
}));

function objectStream(names: string[]) {
  const stream = new EventEmitter();
  setImmediate(() => {
    for (const name of names) stream.emit("data", { name });
    stream.emit("end");
  });
  return stream;
}

function jsonRequest(body: unknown) {
  return new Request("http://localhost/api/files", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  mockEnsureBuckets.mockReset();
  mockClient.listObjects.mockReset();
  mockClient.putObject.mockReset();
});

describe("GET /api/files", () => {
  it("lists namespace-prefixed objects and returns relative file paths", async () => {
    mockClient.listObjects.mockReturnValue(
      objectStream([
        "team-a/.namespace",
        "team-a/.keep",
        "team-a/api/smoke.ts",
        "team-a/empty/.keep",
      ])
    );

    const response = await GET(
      new Request("http://localhost/api/files?namespace=team-a")
    );

    expect(response.status).toBe(200);
    expect(mockClient.listObjects).toHaveBeenCalledWith(
      SCRIPTS_BUCKET,
      "team-a/",
      true
    );
    await expect(response.json()).resolves.toEqual({
      files: [{ name: "api/smoke.ts" }],
      tree: [
        {
          path: "api/",
          name: "api",
          type: "folder",
          children: [
            { path: "api/smoke.ts", name: "smoke.ts", type: "file" },
          ],
        },
        {
          path: "empty/",
          name: "empty",
          type: "folder",
          children: [],
        },
      ],
    });
  });

  it("returns 400 for invalid namespace", async () => {
    const response = await GET(
      new Request("http://localhost/api/files?namespace=bad/name")
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Invalid namespace",
    });
    expect(mockClient.listObjects).not.toHaveBeenCalled();
  });
});

describe("POST /api/files", () => {
  it("writes a namespace-prefixed object and returns a relative file name", async () => {
    const response = await POST(
      jsonRequest({
        namespace: "team-a",
        name: "api/smoke.ts",
        content: "export default function test() {}",
      })
    );

    expect(response.status).toBe(201);
    expect(mockClient.putObject).toHaveBeenCalledWith(
      SCRIPTS_BUCKET,
      "team-a/api/smoke.ts",
      expect.any(Buffer),
      "export default function test() {}".length,
      { "Content-Type": "text/plain" }
    );
    await expect(response.json()).resolves.toEqual({ name: "api/smoke.ts" });
  });
});
