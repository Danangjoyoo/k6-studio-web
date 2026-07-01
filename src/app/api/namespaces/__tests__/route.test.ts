import { EventEmitter } from "events";
import { DELETE, GET, PATCH, POST } from "@/app/api/namespaces/route";
import { REPORTS_BUCKET, SCRIPTS_BUCKET } from "@/lib/minio";

const mockEnsureBuckets = jest.fn();
const mockClient = {
  listObjects: jest.fn(),
  putObject: jest.fn(),
  copyObject: jest.fn(),
  removeObject: jest.fn(),
};

jest.mock("@/lib/minio", () => ({
  getMinioClient: () => mockClient,
  SCRIPTS_BUCKET: "k6-scripts",
  REPORTS_BUCKET: "k6-reports",
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
    mockClient.copyObject.mockReset();
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

  it("renames a namespace and moves script and report objects", async () => {
    mockClient.listObjects.mockImplementation((bucket: string, prefix: string) => {
      if (bucket === SCRIPTS_BUCKET && prefix === "team-a/") {
        return objectStream(["team-a/.namespace", "team-a/src/load.ts"]);
      }
      if (bucket === SCRIPTS_BUCKET && prefix === "team-b/") {
        return objectStream([]);
      }
      if (bucket === REPORTS_BUCKET && prefix === "team-a/") {
        return objectStream([
          "team-a/src/load.ts-111.html",
          "team-a/src/load.ts-111.html.tabs.json",
        ]);
      }
      if (bucket === REPORTS_BUCKET && prefix === "team-b/") {
        return objectStream([]);
      }
      return objectStream([]);
    });

    const response = await PATCH(
      new Request("http://localhost/api/namespaces", {
        method: "PATCH",
        body: JSON.stringify({ from: "team-a", to: "team-b" }),
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      from: "team-a",
      to: "team-b",
      moved: { scripts: 2, reports: 2 },
    });
    expect(mockClient.copyObject).toHaveBeenCalledWith(
      SCRIPTS_BUCKET,
      "team-b/.namespace",
      "/k6-scripts/team-a/.namespace"
    );
    expect(mockClient.copyObject).toHaveBeenCalledWith(
      SCRIPTS_BUCKET,
      "team-b/src/load.ts",
      "/k6-scripts/team-a/src/load.ts"
    );
    expect(mockClient.copyObject).toHaveBeenCalledWith(
      REPORTS_BUCKET,
      "team-b/src/load.ts-111.html",
      "/k6-reports/team-a/src/load.ts-111.html"
    );
    expect(mockClient.copyObject).toHaveBeenCalledWith(
      REPORTS_BUCKET,
      "team-b/src/load.ts-111.html.tabs.json",
      "/k6-reports/team-a/src/load.ts-111.html.tabs.json"
    );
    expect(mockClient.removeObject).toHaveBeenCalledWith(
      SCRIPTS_BUCKET,
      "team-a/.namespace"
    );
    expect(mockClient.removeObject).toHaveBeenCalledWith(
      REPORTS_BUCKET,
      "team-a/src/load.ts-111.html"
    );
  });

  it("rejects renaming the default namespace", async () => {
    const response = await PATCH(
      new Request("http://localhost/api/namespaces", {
        method: "PATCH",
        body: JSON.stringify({ from: "default", to: "team-b" }),
      })
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Default namespace cannot be renamed",
    });
    expect(mockClient.copyObject).not.toHaveBeenCalled();
  });

  it("rejects renaming to an existing namespace", async () => {
    mockClient.listObjects.mockImplementation((bucket: string, prefix: string) => {
      if (bucket === SCRIPTS_BUCKET && prefix === "team-a/") {
        return objectStream(["team-a/.namespace"]);
      }
      if (bucket === SCRIPTS_BUCKET && prefix === "team-b/") {
        return objectStream(["team-b/.namespace"]);
      }
      return objectStream([]);
    });

    const response = await PATCH(
      new Request("http://localhost/api/namespaces", {
        method: "PATCH",
        body: JSON.stringify({ from: "team-a", to: "team-b" }),
      })
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "Namespace already exists",
    });
    expect(mockClient.copyObject).not.toHaveBeenCalled();
  });
});
