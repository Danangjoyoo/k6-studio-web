import { EventEmitter } from "events";
import { POST } from "@/app/api/reports/[name]/note-assets/route";
import { GET } from "@/app/api/reports/[name]/note-assets/[assetId]/route";
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

function objectBody(content: Buffer) {
  const stream = new EventEmitter();
  setImmediate(() => {
    stream.emit("data", content);
    stream.emit("end");
  });
  return stream;
}

beforeEach(() => {
  mockEnsureBuckets.mockReset();
  mockClient.getObject.mockReset();
  mockClient.putObject.mockReset();
});

describe("report note assets route", () => {
  it("uploads an image asset and returns an app-served URL", async () => {
    const form = new FormData();
    form.set(
      "file",
      new File([new Uint8Array([1, 2, 3])], "paste.png", {
        type: "image/png",
      })
    );

    const response = await POST(
      new Request(
        "http://localhost/api/reports/api%2Fsmoke.ts-1.html/note-assets?namespace=team-a",
        {
          method: "POST",
          body: form,
        }
      ),
      { params: Promise.resolve({ name: "api/smoke.ts-1.html" }) }
    );

    expect(response.status).toBe(201);
    expect(mockClient.putObject).toHaveBeenCalledWith(
      REPORTS_BUCKET,
      expect.stringMatching(/^team-a\/\.report-note-assets\/asset_.*\.png$/),
      expect.any(Buffer),
      3,
      expect.objectContaining({ "Content-Type": "image/png" })
    );
    const body = await response.json();
    expect(body).toEqual({
      assetId: expect.stringMatching(/^asset_.*\.png$/),
      url: expect.stringMatching(
        /^\/api\/reports\/api%2Fsmoke\.ts-1\.html\/note-assets\/asset_.*\.png\?namespace=team-a$/
      ),
    });
  });

  it("rejects non-image uploads", async () => {
    const form = new FormData();
    form.set(
      "file",
      new File(["hello"], "note.txt", {
        type: "text/plain",
      })
    );

    const response = await POST(
      new Request(
        "http://localhost/api/reports/smoke.ts-1.html/note-assets?namespace=team-a",
        {
          method: "POST",
          body: form,
        }
      ),
      { params: Promise.resolve({ name: "smoke.ts-1.html" }) }
    );

    expect(response.status).toBe(400);
    expect(mockClient.putObject).not.toHaveBeenCalled();
  });

  it("streams an uploaded image asset", async () => {
    mockClient.getObject.mockResolvedValue(objectBody(Buffer.from([4, 5, 6])));

    const response = await GET(
      new Request(
        "http://localhost/api/reports/smoke.ts-1.html/note-assets/asset_abc.webp?namespace=team-a"
      ),
      {
        params: Promise.resolve({
          name: "smoke.ts-1.html",
          assetId: "asset_abc.webp",
        }),
      }
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/webp");
    expect(mockClient.getObject).toHaveBeenCalledWith(
      REPORTS_BUCKET,
      "team-a/.report-note-assets/asset_abc.webp"
    );
    expect(Buffer.from(await response.arrayBuffer())).toEqual(Buffer.from([4, 5, 6]));
  });
});
