import { EventEmitter } from "events";
import { POST } from "@/app/api/files/move/route";
import { REPORTS_BUCKET, SCRIPTS_BUCKET } from "@/lib/minio";
import { getStatus } from "@/lib/run-lock";

const mockEnsureBuckets = jest.fn();
const mockClient = {
  listObjects: jest.fn(),
  copyObject: jest.fn(),
  removeObjects: jest.fn(),
};

jest.mock("@/lib/minio", () => ({
  getMinioClient: () => mockClient,
  SCRIPTS_BUCKET: "k6-scripts",
  REPORTS_BUCKET: "k6-reports",
  ensureBuckets: () => mockEnsureBuckets(),
}));

jest.mock("@/lib/run-lock", () => ({
  getStatus: jest.fn(),
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
  return new Request("http://localhost/api/files/move", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function mockObjects(scripts: string[], reports: string[] = []) {
  mockClient.listObjects.mockImplementation((bucket: string) => {
    if (bucket === SCRIPTS_BUCKET) return objectStream(scripts);
    if (bucket === REPORTS_BUCKET) return objectStream(reports);
    return objectStream([]);
  });
}

beforeEach(() => {
  mockEnsureBuckets.mockReset();
  mockClient.listObjects.mockReset();
  mockClient.copyObject.mockReset();
  mockClient.removeObjects.mockReset();
  (getStatus as jest.Mock).mockReset();
  (getStatus as jest.Mock).mockReturnValue({
    running: false,
    script: null,
    startedAt: null,
    activeRunners: 0,
    capacity: 1,
  });
});

describe("POST /api/files/move", () => {
  it("moves a single file to a folder and returns success", async () => {
    mockObjects(["src/a.ts"]);

    const response = await POST(
      jsonRequest({
        items: [{ path: "src/a.ts", type: "file" }],
        targetFolder: "dest",
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      moved: { scripts: 1, reports: 0 },
    });
    expect(mockClient.copyObject).toHaveBeenCalledWith(
      SCRIPTS_BUCKET,
      "dest/a.ts",
      `/${SCRIPTS_BUCKET}/src/a.ts`
    );
    expect(mockClient.removeObjects).toHaveBeenCalledWith(SCRIPTS_BUCKET, [
      "src/a.ts",
    ]);
  });

  it("rejects when the destination file name already exists", async () => {
    mockObjects(["src/a.ts", "dest/a.ts"]);

    const response = await POST(
      jsonRequest({
        items: [{ path: "src/a.ts", type: "file" }],
        targetFolder: "dest",
      })
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "Destination already exists: dest/a.ts",
    });
    expect(mockClient.copyObject).not.toHaveBeenCalled();
    expect(mockClient.removeObjects).not.toHaveBeenCalled();
  });

  it("rejects an entire bulk move when any selected item conflicts", async () => {
    mockObjects(["src/a.ts", "src/b.ts", "dest/b.ts"]);

    const response = await POST(
      jsonRequest({
        items: [
          { path: "src/a.ts", type: "file" },
          { path: "src/b.ts", type: "file" },
        ],
        targetFolder: "dest",
      })
    );

    expect(response.status).toBe(409);
    expect(mockClient.copyObject).not.toHaveBeenCalled();
    expect(mockClient.removeObjects).not.toHaveBeenCalled();
  });

  it("rejects moving a folder into its own descendant", async () => {
    mockObjects(["src/folder/a.ts"]);

    const response = await POST(
      jsonRequest({
        items: [{ path: "src/folder", type: "folder" }],
        targetFolder: "src/folder/child",
      })
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Cannot move a folder into itself or its descendants",
    });
    expect(mockClient.copyObject).not.toHaveBeenCalled();
    expect(mockClient.removeObjects).not.toHaveBeenCalled();
  });

  it("rejects moving the currently running script", async () => {
    mockObjects(["src/a.ts"]);
    (getStatus as jest.Mock).mockReturnValue({
      running: true,
      script: "src/a.ts",
      startedAt: 1,
      activeRunners: 1,
      capacity: 1,
    });

    const response = await POST(
      jsonRequest({
        items: [{ path: "src/a.ts", type: "file" }],
        targetFolder: "dest",
      })
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "Cannot move a script while it is running",
    });
    expect(mockClient.copyObject).not.toHaveBeenCalled();
    expect(mockClient.removeObjects).not.toHaveBeenCalled();
  });

  it("rejects moving a folder containing the currently running script", async () => {
    mockObjects(["src/folder/a.ts"]);
    (getStatus as jest.Mock).mockReturnValue({
      running: true,
      script: "src/folder/a.ts",
      startedAt: 1,
      activeRunners: 1,
      capacity: 1,
    });

    const response = await POST(
      jsonRequest({
        items: [{ path: "src/folder", type: "folder" }],
        targetFolder: "dest",
      })
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "Cannot move a folder containing the running script",
    });
    expect(mockClient.copyObject).not.toHaveBeenCalled();
    expect(mockClient.removeObjects).not.toHaveBeenCalled();
  });

  it("moves report history objects from old prefix to new prefix when moving a script", async () => {
    mockObjects(["src/a.ts"], ["src/a.ts-111.html", "other.ts-111.html"]);

    const response = await POST(
      jsonRequest({
        items: [{ path: "src/a.ts", type: "file" }],
        targetFolder: "dest",
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      moved: { scripts: 1, reports: 1 },
    });
    expect(mockClient.copyObject).toHaveBeenCalledWith(
      REPORTS_BUCKET,
      "dest/a.ts-111.html",
      `/${REPORTS_BUCKET}/src/a.ts-111.html`
    );
    expect(mockClient.removeObjects).toHaveBeenCalledWith(REPORTS_BUCKET, [
      "src/a.ts-111.html",
    ]);
  });

  it("does not move reports for scripts that only share a path prefix", async () => {
    mockObjects(["src/a.ts", "src/a.ts-extra"], [
      "src/a.ts-111.html",
      "src/a.ts-extra-111.html",
    ]);

    const response = await POST(
      jsonRequest({
        items: [{ path: "src/a.ts", type: "file" }],
        targetFolder: "dest",
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      moved: { scripts: 1, reports: 1 },
    });
    expect(mockClient.copyObject).toHaveBeenCalledWith(
      REPORTS_BUCKET,
      "dest/a.ts-111.html",
      `/${REPORTS_BUCKET}/src/a.ts-111.html`
    );
    expect(mockClient.copyObject).not.toHaveBeenCalledWith(
      REPORTS_BUCKET,
      "dest/a.ts-extra-111.html",
      `/${REPORTS_BUCKET}/src/a.ts-extra-111.html`
    );
    expect(mockClient.removeObjects).toHaveBeenCalledWith(REPORTS_BUCKET, [
      "src/a.ts-111.html",
    ]);
  });

  it("rejects report destination conflicts before mutating", async () => {
    mockObjects(
      ["src/a.ts"],
      ["src/a.ts-111.html", "dest/a.ts-111.html"]
    );

    const response = await POST(
      jsonRequest({
        items: [{ path: "src/a.ts", type: "file" }],
        targetFolder: "dest",
      })
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "Destination report already exists: dest/a.ts-111.html",
    });
    expect(mockClient.copyObject).not.toHaveBeenCalled();
    expect(mockClient.removeObjects).not.toHaveBeenCalled();
  });
});
