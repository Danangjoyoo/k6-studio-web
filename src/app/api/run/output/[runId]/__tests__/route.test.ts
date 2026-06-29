import { GET } from "@/app/api/run/output/[runId]/route";
import {
  _resetRunOutput,
  appendRunOutput,
} from "@/lib/run-output";

async function readNextSse(reader: ReadableStreamDefaultReader<Uint8Array>) {
  const { done, value } = await reader.read();
  return {
    done,
    text: value ? Buffer.from(value).toString("utf-8") : "",
  };
}

describe("GET /api/run/output/[runId]", () => {
  beforeEach(() => {
    _resetRunOutput();
  });

  it("replays buffered output for a run", async () => {
    appendRunOutput("run_1", { line: "first" });

    const response = await GET(
      new Request("http://localhost/api/run/output/run_1"),
      { params: Promise.resolve({ runId: "run_1" }) }
    );
    const reader = response.body?.getReader();
    if (!reader) throw new Error("missing response body");

    await expect(readNextSse(reader)).resolves.toEqual({
      done: false,
      text: 'data: {"line":"first"}\n\n',
    });
    await reader.cancel();
  });

  it("broadcasts future output and closes after completion", async () => {
    const response = await GET(
      new Request("http://localhost/api/run/output/run_1"),
      { params: Promise.resolve({ runId: "run_1" }) }
    );
    const reader = response.body?.getReader();
    if (!reader) throw new Error("missing response body");

    const firstRead = readNextSse(reader);
    appendRunOutput("run_1", { line: "next" });
    await expect(firstRead).resolves.toEqual({
      done: false,
      text: 'data: {"line":"next"}\n\n',
    });

    const doneRead = readNextSse(reader);
    appendRunOutput("run_1", { done: true, exitCode: 0, reportName: "a.html" });
    await expect(doneRead).resolves.toEqual({
      done: false,
      text: 'data: {"done":true,"exitCode":0,"reportName":"a.html"}\n\n',
    });

    await expect(readNextSse(reader)).resolves.toEqual({
      done: true,
      text: "",
    });
  });
});
