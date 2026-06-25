import { EventEmitter } from "events";
import { GET } from "@/app/api/reports/[name]/route";
import { REPORTS_BUCKET } from "@/lib/minio";

const mockEnsureBuckets = jest.fn();
const mockClient = {
  getObject: jest.fn(),
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
});

describe("GET /api/reports/[name]", () => {
  it("serves namespace-prefixed report HTML from a relative report name", async () => {
    mockClient.getObject.mockResolvedValue(objectBody("<html>ok</html>"));

    const response = await GET(
      new Request(
        "http://localhost/api/reports/api%2Fsmoke.ts-1.html?namespace=team-a"
      ),
      { params: Promise.resolve({ name: "api/smoke.ts-1.html" }) }
    );

    expect(response.status).toBe(200);
    expect(mockClient.getObject).toHaveBeenCalledWith(
      REPORTS_BUCKET,
      "team-a/api/smoke.ts-1.html"
    );
    await expect(response.text()).resolves.toBe("<html>ok</html>");
  });
});
