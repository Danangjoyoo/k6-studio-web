import {
  _resetRunOutput,
  appendRunOutput,
  closeRunOutput,
  getRunOutputSnapshot,
  subscribeRunOutput,
} from "@/lib/run-output";

describe("run-output", () => {
  beforeEach(() => {
    _resetRunOutput();
  });

  it("replays existing output and broadcasts future output", () => {
    const received: unknown[] = [];

    appendRunOutput("run_1", { line: "first" });
    const unsubscribe = subscribeRunOutput("run_1", (message) => {
      received.push(message);
    });
    appendRunOutput("run_1", { line: "second" });
    unsubscribe();
    appendRunOutput("run_1", { line: "third" });

    expect(getRunOutputSnapshot("run_1")).toEqual([
      { line: "first" },
      { line: "second" },
      { line: "third" },
    ]);
    expect(received).toEqual([{ line: "second" }]);
  });

  it("keeps only the newest 1000 messages per run", () => {
    for (let i = 0; i < 1005; i += 1) {
      appendRunOutput("run_1", { line: `line ${i}` });
    }

    const snapshot = getRunOutputSnapshot("run_1");
    expect(snapshot).toHaveLength(1000);
    expect(snapshot[0]).toEqual({ line: "line 5" });
    expect(snapshot[999]).toEqual({ line: "line 1004" });
  });

  it("clears output after a run is closed", () => {
    appendRunOutput("run_1", { line: "first" });
    closeRunOutput("run_1");

    expect(getRunOutputSnapshot("run_1")).toEqual([]);
  });
});
