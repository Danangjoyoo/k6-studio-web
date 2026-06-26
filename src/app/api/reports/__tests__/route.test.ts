import { EventEmitter } from "events";
import { GET } from "@/app/api/reports/route";
import { REPORTS_BUCKET } from "@/lib/minio";

const mockEnsureBuckets = jest.fn();
const mockClient = {
  listObjects: jest.fn(),
};

jest.mock("@/lib/minio", () => ({
  getMinioClient: () => mockClient,
  REPORTS_BUCKET: "k6-reports",
  ensureBuckets: () => mockEnsureBuckets(),
}));

function objectStream(
  objects: Array<{ name: string; size?: number; lastModified?: Date }>
) {
  const stream = new EventEmitter();
  queueMicrotask(() => {
    for (const object of objects) stream.emit("data", object);
    stream.emit("end");
  });
  return stream;
}

beforeEach(() => {
  mockEnsureBuckets.mockReset();
  mockClient.listObjects.mockReset();
});

describe("GET /api/reports", () => {
  it("lists nested report objects recursively", async () => {
    const lastModified = new Date("2026-06-25T00:00:00.000Z");
    mockClient.listObjects.mockImplementation(() =>
      objectStream([
        {
          name: "default/dest/a.ts-111.html",
          size: 42,
          lastModified,
        },
      ])
    );

    const response = await GET(new Request("http://localhost/api/reports"));

    expect(response.status).toBe(200);
    expect(mockClient.listObjects).toHaveBeenCalledWith(
      REPORTS_BUCKET,
      "default/",
      true
    );
    await expect(response.json()).resolves.toEqual({
      reports: [
        {
          name: "dest/a.ts-111.html",
          size: 42,
          lastModified: "2026-06-25T00:00:00.000Z",
        },
      ],
    });
  });

  it("lists namespace-prefixed reports as relative names and hides markers", async () => {
    const lastModified = new Date("2026-06-25T00:00:00.000Z");
    mockClient.listObjects.mockImplementation(() =>
      objectStream([
        { name: "team-a/.namespace", size: 0, lastModified },
        { name: "team-a/.keep", size: 0, lastModified },
        { name: "team-a/api/smoke.ts-111.html", size: 42, lastModified },
        {
          name: "team-a/api/smoke.ts-111.html.tabs.json",
          size: 120,
          lastModified,
        },
      ])
    );

    const response = await GET(
      new Request("http://localhost/api/reports?namespace=team-a")
    );

    expect(response.status).toBe(200);
    expect(mockClient.listObjects).toHaveBeenCalledWith(
      REPORTS_BUCKET,
      "team-a/",
      true
    );
    await expect(response.json()).resolves.toEqual({
      reports: [
        {
          name: "api/smoke.ts-111.html",
          size: 42,
          lastModified: "2026-06-25T00:00:00.000Z",
        },
      ],
    });
  });
});
