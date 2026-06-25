import { EventEmitter } from "events";
import { POST } from "@/app/api/files/rename/route";
import { REPORTS_BUCKET, SCRIPTS_BUCKET } from "@/lib/minio";
import { getStatus } from "@/lib/run-lock";

const mockEnsureBuckets = jest.fn();
const mockClient = {
  listObjects: jest.fn(),
  copyObject: jest.fn(),
  removeObject: jest.fn(),
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
  return new Request("http://localhost/api/files/rename", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function defaultNamespaceObjects(prefix: string, objects: string[]) {
  if (prefix !== "default/") return objects;
  return objects.map((name) =>
    name.startsWith("default/") ? name : `default/${name}`
  );
}

function mockObjects(scripts: string[], reports: string[] = []) {
  mockClient.listObjects.mockImplementation((bucket: string, prefix: string) => {
    if (bucket === SCRIPTS_BUCKET) {
      return objectStream(defaultNamespaceObjects(prefix, scripts));
    }
    if (bucket === REPORTS_BUCKET) {
      return objectStream(defaultNamespaceObjects(prefix, reports));
    }
    return objectStream([]);
  });
}

function expectNoMutation() {
  expect(mockClient.copyObject).not.toHaveBeenCalled();
  expect(mockClient.removeObject).not.toHaveBeenCalled();
  expect(mockClient.removeObjects).not.toHaveBeenCalled();
}

beforeEach(() => {
  mockEnsureBuckets.mockReset();
  mockClient.listObjects.mockReset();
  mockClient.copyObject.mockReset();
  mockClient.removeObject.mockReset();
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

describe("POST /api/files/rename", () => {
  it("rejects non-object JSON bodies with 400 and no mutation", async () => {
    const response = await POST(jsonRequest(null));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "from, to, and type are required",
    });
    expect(mockClient.listObjects).not.toHaveBeenCalled();
    expectNoMutation();
  });

  it("renames a single file and returns success", async () => {
    mockObjects(["src/a.ts"]);

    const response = await POST(
      jsonRequest({
        from: "src/a.ts",
        to: "src/b.ts",
        type: "file",
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      from: "src/a.ts",
      to: "src/b.ts",
      moved: { scripts: 1, reports: 0 },
    });
    expect(mockClient.copyObject).toHaveBeenCalledWith(
      SCRIPTS_BUCKET,
      "default/src/b.ts",
      `/${SCRIPTS_BUCKET}/default/src/a.ts`
    );
    expect(mockClient.removeObjects).toHaveBeenCalledWith(SCRIPTS_BUCKET, [
      "default/src/a.ts",
    ]);
  });

  it("rejects destination file conflicts before mutation", async () => {
    mockObjects(["src/a.ts", "src/b.ts"]);

    const response = await POST(
      jsonRequest({
        from: "src/a.ts",
        to: "src/b.ts",
        type: "file",
      })
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "Destination already exists: src/b.ts",
    });
    expectNoMutation();
  });

  it("rejects destination folder conflicts before mutation", async () => {
    mockObjects(["src/a.ts", "renamed/existing.ts"]);

    const response = await POST(
      jsonRequest({
        from: "src",
        to: "renamed",
        type: "folder",
      })
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "Destination already exists: renamed",
    });
    expectNoMutation();
  });

  it("rejects renaming the currently running script with no mutation", async () => {
    mockObjects(["src/a.ts"]);
    (getStatus as jest.Mock).mockReturnValue({
      running: true,
      namespace: "default",
      script: "src/a.ts",
      startedAt: 1,
      activeRunners: 1,
      capacity: 1,
    });

    const response = await POST(
      jsonRequest({
        from: "src/a.ts",
        to: "src/b.ts",
        type: "file",
      })
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "Cannot move a script while it is running",
    });
    expectNoMutation();
  });

  it("rejects renaming a folder containing the running script with no mutation", async () => {
    mockObjects(["src/a.ts"]);
    (getStatus as jest.Mock).mockReturnValue({
      running: true,
      namespace: "default",
      script: "src/a.ts",
      startedAt: 1,
      activeRunners: 1,
      capacity: 1,
    });

    const response = await POST(
      jsonRequest({
        from: "src",
        to: "renamed",
        type: "folder",
      })
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "Cannot move a folder containing the running script",
    });
    expectNoMutation();
  });

  it("moves report history for file rename", async () => {
    mockObjects(["src/a.ts"], ["src/a.ts-111.html"]);

    const response = await POST(
      jsonRequest({
        from: "src/a.ts",
        to: "src/b.ts",
        type: "file",
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      from: "src/a.ts",
      to: "src/b.ts",
      moved: { scripts: 1, reports: 1 },
    });
    expect(mockClient.copyObject).toHaveBeenCalledWith(
      REPORTS_BUCKET,
      "default/src/b.ts-111.html",
      `/${REPORTS_BUCKET}/default/src/a.ts-111.html`
    );
    expect(mockClient.removeObjects).toHaveBeenCalledWith(REPORTS_BUCKET, [
      "default/src/a.ts-111.html",
    ]);
  });

  it("renames namespace-relative scripts and report history with prefixed storage keys", async () => {
    mockObjects(
      ["team-a/src/a.ts", "team-b/src/b.ts"],
      ["team-a/src/a.ts-111.html", "team-b/src/a.ts-111.html"]
    );

    const response = await POST(
      jsonRequest({
        namespace: "team-a",
        from: "src/a.ts",
        to: "src/b.ts",
        type: "file",
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      from: "src/a.ts",
      to: "src/b.ts",
      moved: { scripts: 1, reports: 1 },
    });
    expect(mockClient.listObjects).toHaveBeenCalledWith(
      SCRIPTS_BUCKET,
      "team-a/",
      true
    );
    expect(mockClient.listObjects).toHaveBeenCalledWith(
      REPORTS_BUCKET,
      "team-a/",
      true
    );
    expect(mockClient.copyObject).toHaveBeenCalledWith(
      SCRIPTS_BUCKET,
      "team-a/src/b.ts",
      `/${SCRIPTS_BUCKET}/team-a/src/a.ts`
    );
    expect(mockClient.copyObject).toHaveBeenCalledWith(
      REPORTS_BUCKET,
      "team-a/src/b.ts-111.html",
      `/${REPORTS_BUCKET}/team-a/src/a.ts-111.html`
    );
    expect(mockClient.removeObjects).toHaveBeenCalledWith(SCRIPTS_BUCKET, [
      "team-a/src/a.ts",
    ]);
    expect(mockClient.removeObjects).toHaveBeenCalledWith(REPORTS_BUCKET, [
      "team-a/src/a.ts-111.html",
    ]);
  });

  it("does not block matching rename paths when active run namespace differs", async () => {
    mockObjects(["team-a/src/a.ts"]);
    (getStatus as jest.Mock).mockReturnValue({
      running: true,
      namespace: "team-b",
      script: "src/a.ts",
      startedAt: 1,
      activeRunners: 1,
      capacity: 1,
    });

    const response = await POST(
      jsonRequest({
        namespace: "team-a",
        from: "src/a.ts",
        to: "src/b.ts",
        type: "file",
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      from: "src/a.ts",
      to: "src/b.ts",
      moved: { scripts: 1, reports: 0 },
    });
  });

  it("does not move similarly named script reports", async () => {
    mockObjects(["src/a.ts", "src/a.ts-extra"], [
      "src/a.ts-111.html",
      "src/a.ts-extra-111.html",
    ]);

    const response = await POST(
      jsonRequest({
        from: "src/a.ts",
        to: "src/b.ts",
        type: "file",
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      from: "src/a.ts",
      to: "src/b.ts",
      moved: { scripts: 1, reports: 1 },
    });
    expect(mockClient.copyObject).toHaveBeenCalledWith(
      REPORTS_BUCKET,
      "default/src/b.ts-111.html",
      `/${REPORTS_BUCKET}/default/src/a.ts-111.html`
    );
    expect(mockClient.copyObject).not.toHaveBeenCalledWith(
      REPORTS_BUCKET,
      "src/b.ts-extra-111.html",
      `/${REPORTS_BUCKET}/src/a.ts-extra-111.html`
    );
    expect(mockClient.removeObjects).toHaveBeenCalledWith(REPORTS_BUCKET, [
      "default/src/a.ts-111.html",
    ]);
  });

  it("rejects destination report conflicts before mutation", async () => {
    mockObjects(
      ["src/a.ts"],
      ["src/a.ts-111.html", "src/b.ts-111.html"]
    );

    const response = await POST(
      jsonRequest({
        from: "src/a.ts",
        to: "src/b.ts",
        type: "file",
      })
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "Destination report already exists: src/b.ts-111.html",
    });
    expectNoMutation();
  });

  it("moves folder contents and corresponding report history for folder rename", async () => {
    mockObjects(["src/a.ts", "src/nested/b.ts"], [
      "src/a.ts-111.html",
      "src/nested/b.ts-222.html",
    ]);

    const response = await POST(
      jsonRequest({
        from: "src",
        to: "renamed",
        type: "folder",
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      from: "src",
      to: "renamed",
      moved: { scripts: 2, reports: 2 },
    });
    expect(mockClient.copyObject).toHaveBeenCalledWith(
      SCRIPTS_BUCKET,
      "default/renamed/a.ts",
      `/${SCRIPTS_BUCKET}/default/src/a.ts`
    );
    expect(mockClient.copyObject).toHaveBeenCalledWith(
      SCRIPTS_BUCKET,
      "default/renamed/nested/b.ts",
      `/${SCRIPTS_BUCKET}/default/src/nested/b.ts`
    );
    expect(mockClient.copyObject).toHaveBeenCalledWith(
      REPORTS_BUCKET,
      "default/renamed/a.ts-111.html",
      `/${REPORTS_BUCKET}/default/src/a.ts-111.html`
    );
    expect(mockClient.copyObject).toHaveBeenCalledWith(
      REPORTS_BUCKET,
      "default/renamed/nested/b.ts-222.html",
      `/${REPORTS_BUCKET}/default/src/nested/b.ts-222.html`
    );
    expect(mockClient.removeObjects).toHaveBeenCalledWith(SCRIPTS_BUCKET, [
      "default/src/a.ts",
      "default/src/nested/b.ts",
    ]);
    expect(mockClient.removeObjects).toHaveBeenCalledWith(REPORTS_BUCKET, [
      "default/src/a.ts-111.html",
      "default/src/nested/b.ts-222.html",
    ]);
  });

  it("preserves .keep sentinel-backed empty folders", async () => {
    mockObjects(["empty/.keep"]);

    const response = await POST(
      jsonRequest({
        from: "empty",
        to: "renamed-empty",
        type: "folder",
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      from: "empty",
      to: "renamed-empty",
      moved: { scripts: 1, reports: 0 },
    });
    expect(mockClient.copyObject).toHaveBeenCalledWith(
      SCRIPTS_BUCKET,
      "default/renamed-empty/.keep",
      `/${SCRIPTS_BUCKET}/default/empty/.keep`
    );
    expect(mockClient.removeObjects).toHaveBeenCalledWith(SCRIPTS_BUCKET, [
      "default/empty/.keep",
    ]);
  });

  it("rejects folder rename to an empty normalized path", async () => {
    mockObjects(["empty/.keep"]);

    const response = await POST(
      jsonRequest({
        from: "empty",
        to: "/",
        type: "folder",
      })
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Folder rename paths must not be empty",
    });
    expectNoMutation();
  });

  it("rejects malformed input with 400", async () => {
    const response = await POST(
      jsonRequest({
        from: "src/a.ts",
        to: "src/b.ts",
        type: "script",
      })
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "from, to, and type are required",
    });
    expect(mockClient.listObjects).not.toHaveBeenCalled();
    expectNoMutation();
  });
});
