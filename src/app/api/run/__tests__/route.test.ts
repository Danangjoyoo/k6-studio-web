import { writeFile } from "fs/promises";
import { Readable } from "stream";
import { POST } from "@/app/api/run/route";
import { POST as CANCEL_POST } from "@/app/api/run/cancel/route";
import { getStatus, _reset } from "@/lib/run-lock";
import { REPORTS_BUCKET, SCRIPTS_BUCKET } from "@/lib/minio";

const mockEnsureBuckets = jest.fn();
const mockGetObject = jest.fn();
const mockPutObject = jest.fn();
const mockRunK6 = jest.fn();
const mockWaitForPortFree = jest.fn();
const originalTotalRunners = process.env.TOTAL_RUNNERS;

jest.mock("@/lib/minio", () => ({
  ensureBuckets: () => mockEnsureBuckets(),
  getMinioClient: () => ({
    getObject: mockGetObject,
    putObject: mockPutObject,
  }),
  SCRIPTS_BUCKET: "k6-scripts",
  REPORTS_BUCKET: "k6-reports",
}));

jest.mock("@/lib/k6", () => ({
  runK6: (...args: unknown[]) => mockRunK6(...args),
  waitForPortFree: (...args: unknown[]) => mockWaitForPortFree(...args),
}));

function objectStream(content: string) {
  return Readable.from([Buffer.from(content)]);
}

function errorStream(error: Error) {
  return new Readable({
    read() {
      this.destroy(error);
    },
  });
}

async function readSse(response: Response) {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("missing body");
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf-8");
}

describe("POST /api/run", () => {
  beforeEach(() => {
    _reset();
    delete process.env.TOTAL_RUNNERS;
    jest.useRealTimers();
    jest.restoreAllMocks();
    mockEnsureBuckets.mockReset().mockResolvedValue(undefined);
    mockGetObject
      .mockReset()
      .mockImplementation(async () => objectStream("export default {}"));
    mockPutObject.mockReset().mockResolvedValue(undefined);
    mockRunK6
      .mockReset()
      .mockImplementation(async (_scriptPath: string, reportPath: string) => {
        await writeFile(reportPath, "<html></html>", "utf-8");
        return 0;
      });
    mockWaitForPortFree.mockReset().mockResolvedValue(undefined);
  });

  afterEach(() => {
    if (originalTotalRunners === undefined) {
      delete process.env.TOTAL_RUNNERS;
    } else {
      process.env.TOTAL_RUNNERS = originalTotalRunners;
    }
    _reset();
  });

  it("runs namespace-relative scripts and stores reports under the namespace", async () => {
    jest.spyOn(Date, "now").mockReturnValue(1790000000000);

    const response = await POST(
      new Request("http://localhost/api/run", {
        method: "POST",
        body: JSON.stringify({
          namespace: "team-a",
          filename: "api/smoke.ts",
        }),
      })
    );
    const text = await readSse(response);

    expect(mockGetObject).toHaveBeenCalledWith(
      SCRIPTS_BUCKET,
      "team-a/api/smoke.ts"
    );
    expect(mockPutObject).toHaveBeenCalledWith(
      REPORTS_BUCKET,
      "team-a/api/smoke.ts-1790000000000.html",
      expect.anything()
    );
    expect(text).toContain(
      'data: {"done":true,"exitCode":0,"reportName":"api/smoke.ts-1790000000000.html"}'
    );
  });

  it("emits a start line before invoking k6", async () => {
    const response = await POST(
      new Request("http://localhost/api/run", {
        method: "POST",
        body: JSON.stringify({
          namespace: "team-a",
          filename: "api/smoke.ts",
        }),
      })
    );
    const text = await readSse(response);

    expect(text).toContain(
      'data: {"line":"[starting] k6 run for team-a/api/smoke.ts on dashboard port 5665"}'
    );
  });

  it("emits an error and completion event when k6 rejects", async () => {
    mockRunK6.mockRejectedValueOnce(new Error("spawn /usr/local/bin/k6 ENOEXEC"));

    const response = await POST(
      new Request("http://localhost/api/run", {
        method: "POST",
        body: JSON.stringify({
          namespace: "team-a",
          filename: "api/smoke.ts",
        }),
      })
    );
    const text = await readSse(response);

    expect(text).toContain(
      'data: {"line":"[error] spawn /usr/local/bin/k6 ENOEXEC"}'
    );
    expect(text).toContain(
      'data: {"done":true,"exitCode":1,"reportName":null}'
    );
    expect(getStatus().running).toBe(false);
  });

  it("returns 400 for an invalid namespace", async () => {
    const response = await POST(
      new Request("http://localhost/api/run", {
        method: "POST",
        body: JSON.stringify({
          namespace: "bad/name",
          filename: "api/smoke.ts",
        }),
      })
    );

    await expect(response.json()).resolves.toEqual({
      error: "Invalid namespace",
    });
    expect(response.status).toBe(400);
    expect(mockRunK6).not.toHaveBeenCalled();
  });

  it("releases the run lock when script stream setup fails", async () => {
    mockGetObject.mockResolvedValueOnce(errorStream(new Error("read failed")));

    await expect(
      POST(
        new Request("http://localhost/api/run", {
          method: "POST",
          body: JSON.stringify({
            namespace: "team-a",
            filename: "api/smoke.ts",
          }),
        })
      )
    ).rejects.toThrow("read failed");

    expect(getStatus().running).toBe(false);
  });

  it("includes namespace in conflict status", async () => {
    let finishRun!: (exitCode: number) => void;
    mockRunK6.mockImplementation(
      () =>
        new Promise<number>((resolve) => {
          finishRun = resolve;
        })
    );

    const first = await POST(
      new Request("http://localhost/api/run", {
        method: "POST",
        body: JSON.stringify({
          namespace: "team-a",
          filename: "api/smoke.ts",
        }),
      })
    );

    const response = await POST(
      new Request("http://localhost/api/run", {
        method: "POST",
        body: JSON.stringify({
          namespace: "team-b",
          filename: "api/other.ts",
        }),
      })
    );

    await expect(response.json()).resolves.toMatchObject({
      error: "A run is already in progress",
      status: {
        namespace: "team-a",
        script: "api/smoke.ts",
      },
    });
    expect(response.status).toBe(409);
    finishRun(0);
    await readSse(first);
  });

  it("allows concurrent runs up to TOTAL_RUNNERS and uses distinct dashboard ports", async () => {
    process.env.TOTAL_RUNNERS = "2";
    const finishRun: Array<(exitCode: number) => void> = [];
    mockRunK6.mockImplementation(
      () =>
        new Promise<number>((resolve) => {
          finishRun.push(resolve);
        })
    );

    const first = await POST(
      new Request("http://localhost/api/run", {
        method: "POST",
        body: JSON.stringify({
          namespace: "team-a",
          filename: "api/a.ts",
        }),
      })
    );
    const second = await POST(
      new Request("http://localhost/api/run", {
        method: "POST",
        body: JSON.stringify({
          namespace: "team-a",
          filename: "api/b.ts",
        }),
      })
    );
    const rejected = await POST(
      new Request("http://localhost/api/run", {
        method: "POST",
        body: JSON.stringify({
          namespace: "team-a",
          filename: "api/c.ts",
        }),
      })
    );

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(mockRunK6.mock.calls[0][4]).toBe(5665);
    expect(mockRunK6.mock.calls[1][4]).toBe(5666);
    expect(rejected.status).toBe(409);
    await expect(rejected.json()).resolves.toMatchObject({
      status: {
        activeRunners: 2,
        capacity: 2,
        runs: [
          expect.objectContaining({ script: "api/a.ts", dashboardPort: 5665 }),
          expect.objectContaining({ script: "api/b.ts", dashboardPort: 5666 }),
        ],
      },
    });

    finishRun[0](0);
    await readSse(first);
    expect(getStatus()).toMatchObject({
      activeRunners: 1,
      runs: [expect.objectContaining({ script: "api/b.ts" })],
    });

    finishRun[1](0);
    await readSse(second);
    expect(getStatus().activeRunners).toBe(0);
  });

  it("skips report upload and history metadata when the run is cancelled", async () => {
    let capturedSignal!: AbortSignal;
    mockRunK6.mockImplementation(
      (
        _scriptPath: string,
        _reportPath: string,
        onLine: (line: string) => void,
        signal: AbortSignal
      ) =>
        new Promise<number>((resolve) => {
          capturedSignal = signal;
          onLine("running");
          signal.addEventListener(
            "abort",
            () => {
              onLine("[cancelled] run cancelled by user");
              resolve(130);
            },
            { once: true }
          );
        })
    );

    const response = await POST(
      new Request("http://localhost/api/run", {
        method: "POST",
        body: JSON.stringify({
          namespace: "team-a",
          filename: "api/smoke.ts",
        }),
      })
    );
    const runId = getStatus().runs[0]?.id;
    if (!runId) throw new Error("missing active run");

    const cancelResponse = await CANCEL_POST(
      new Request("http://localhost/api/run/cancel", {
        method: "POST",
        body: JSON.stringify({ runId }),
      })
    );
    const text = await readSse(response);

    await expect(cancelResponse.json()).resolves.toEqual({ cancelled: true });
    expect(capturedSignal.aborted).toBe(true);
    expect(mockPutObject).not.toHaveBeenCalled();
    expect(text).toContain('"line":"[cancelled] run cancelled by user"');
    expect(text).toContain(
      'data: {"done":true,"cancelled":true,"exitCode":null,"reportName":null}'
    );
    expect(getStatus().running).toBe(false);
  });
});
