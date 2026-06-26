import { EventEmitter } from "events";
import { GET, PUT } from "@/app/api/reports/[name]/tabs/route";
import { REPORTS_BUCKET } from "@/lib/minio";

const mockEnsureBuckets = jest.fn();
const mockClient = {
  getObject: jest.fn(),
  putObject: jest.fn(),
};

jest.mock("@/lib/minio", () => ({
  getMinioClient: () => mockClient,
  REPORTS_BUCKET: "k6-reports",
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

beforeEach(() => {
  mockEnsureBuckets.mockReset();
  mockClient.getObject.mockReset();
  mockClient.putObject.mockReset();
});

describe("report tabs metadata route", () => {
  it("returns saved custom tabs from the namespace sidecar", async () => {
    mockClient.getObject.mockResolvedValue(
      objectBody(
        JSON.stringify({
          version: 1,
          tabs: [
            { id: "tab_1", url: "https://grafana.example/d/a", title: "" },
          ],
        })
      )
    );

    const response = await GET(
      new Request(
        "http://localhost/api/reports/api%2Fsmoke.ts-1.html/tabs?namespace=team-a"
      ),
      { params: Promise.resolve({ name: "api/smoke.ts-1.html" }) }
    );

    expect(response.status).toBe(200);
    expect(mockClient.getObject).toHaveBeenCalledWith(
      REPORTS_BUCKET,
      "team-a/api/smoke.ts-1.html.tabs.json"
    );
    await expect(response.json()).resolves.toEqual({
      tabs: [
        {
          id: "tab_1",
          url: "https://grafana.example/d/a",
          title: "grafana.example",
        },
      ],
    });
  });

  it("returns an empty tab list when the sidecar is missing", async () => {
    mockClient.getObject.mockRejectedValue(new Error("missing"));

    const response = await GET(
      new Request(
        "http://localhost/api/reports/smoke.ts-1.html/tabs?namespace=team-a"
      ),
      { params: Promise.resolve({ name: "smoke.ts-1.html" }) }
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ tabs: [] });
  });

  it("writes validated custom tabs to the namespace sidecar", async () => {
    const response = await PUT(
      new Request(
        "http://localhost/api/reports/smoke.ts-1.html/tabs?namespace=team-a",
        {
          method: "PUT",
          body: JSON.stringify({
            tabs: [
              { id: "tab_1", url: "https://grafana.example/d/a", title: "" },
            ],
          }),
        }
      ),
      { params: Promise.resolve({ name: "smoke.ts-1.html" }) }
    );

    expect(response.status).toBe(200);
    expect(mockClient.putObject).toHaveBeenCalledWith(
      REPORTS_BUCKET,
      "team-a/smoke.ts-1.html.tabs.json",
      expect.any(Buffer),
      expect.any(Number),
      expect.objectContaining({ "Content-Type": "application/json" })
    );
    const saved = JSON.parse(
      mockClient.putObject.mock.calls[0][2].toString("utf-8")
    );
    expect(saved).toEqual({
      version: 1,
      tabs: [
        {
          id: "tab_1",
          url: "https://grafana.example/d/a",
          title: "grafana.example",
          updatedAt: expect.any(String),
        },
      ],
    });
  });

  it("rejects invalid URL schemes", async () => {
    const response = await PUT(
      new Request(
        "http://localhost/api/reports/smoke.ts-1.html/tabs?namespace=team-a",
        {
          method: "PUT",
          body: JSON.stringify({
            tabs: [{ id: "tab_1", url: "file:///tmp/a" }],
          }),
        }
      ),
      { params: Promise.resolve({ name: "smoke.ts-1.html" }) }
    );

    expect(response.status).toBe(400);
    expect(mockClient.putObject).not.toHaveBeenCalled();
  });
});
