import {
  _reset,
  cancelRun,
  getRunById,
  getRunnerCapacity,
  getStatus,
  registerCancelHandler,
  release,
  tryAcquire,
} from "@/lib/run-lock";

const originalTotalRunners = process.env.TOTAL_RUNNERS;
const originalDashboardPort = process.env.K6_DASHBOARD_PORT;

beforeEach(() => {
  delete process.env.TOTAL_RUNNERS;
  delete process.env.K6_DASHBOARD_PORT;
  _reset();
});

afterEach(() => {
  if (originalTotalRunners === undefined) {
    delete process.env.TOTAL_RUNNERS;
  } else {
    process.env.TOTAL_RUNNERS = originalTotalRunners;
  }
  if (originalDashboardPort === undefined) {
    delete process.env.K6_DASHBOARD_PORT;
  } else {
    process.env.K6_DASHBOARD_PORT = originalDashboardPort;
  }
  _reset();
});

describe("run-lock", () => {
  it("parses TOTAL_RUNNERS with a default of one", () => {
    expect(getRunnerCapacity()).toBe(1);
    process.env.TOTAL_RUNNERS = "3";
    expect(getRunnerCapacity()).toBe(3);
    process.env.TOTAL_RUNNERS = "0";
    expect(getRunnerCapacity()).toBe(1);
    process.env.TOTAL_RUNNERS = "bad";
    expect(getRunnerCapacity()).toBe(1);
  });

  it("caps TOTAL_RUNNERS at twenty fixed dashboard slots", () => {
    process.env.TOTAL_RUNNERS = "25";

    expect(getRunnerCapacity()).toBe(20);
    const runs = Array.from({ length: 20 }, (_value, index) =>
      tryAcquire(`script-${index}.ts`)
    );

    expect(runs).toHaveLength(20);
    expect(runs[0]).toMatchObject({ runnerIndex: 0, dashboardPort: 5665 });
    expect(runs[19]).toMatchObject({ runnerIndex: 19, dashboardPort: 5684 });
    expect(tryAcquire("script-20.ts")).toBeNull();
  });

  it("uses fixed dashboard ports instead of K6_DASHBOARD_PORT", () => {
    process.env.K6_DASHBOARD_PORT = "5999";
    process.env.TOTAL_RUNNERS = "2";

    expect(tryAcquire("a.ts")).toMatchObject({ dashboardPort: 5665 });
    expect(tryAcquire("b.ts")).toMatchObject({ dashboardPort: 5666 });
  });

  it("allows acquiring when nothing is running", () => {
    expect(tryAcquire("script.ts")).toMatchObject({
      namespace: "default",
      script: "script.ts",
      runnerIndex: 0,
      dashboardPort: 5665,
    });
  });

  it("allows concurrent acquisitions up to configured capacity", () => {
    process.env.TOTAL_RUNNERS = "2";
    const first = tryAcquire("a.ts");
    const second = tryAcquire("b.ts");

    expect(first).toMatchObject({
      script: "a.ts",
      runnerIndex: 0,
      dashboardPort: 5665,
    });
    expect(second).toMatchObject({
      script: "b.ts",
      runnerIndex: 1,
      dashboardPort: 5666,
    });
    expect(tryAcquire("c.ts")).toBeNull();
    expect(getStatus()).toMatchObject({
      running: true,
      activeRunners: 2,
      capacity: 2,
      runs: [
        expect.objectContaining({ script: "a.ts", dashboardPort: 5665 }),
        expect.objectContaining({ script: "b.ts", dashboardPort: 5666 }),
      ],
    });
  });

  it("allows acquiring again after release", () => {
    const first = tryAcquire("a.ts");
    release(first?.id);
    expect(tryAcquire("b.ts")).toMatchObject({ script: "b.ts" });
  });

  it("release is idempotent", () => {
    release();
    release();
    expect(tryAcquire("a.ts")).toMatchObject({ script: "a.ts" });
  });

  it("getStatus reports not running initially", () => {
    const s = getStatus();
    expect(s.running).toBe(false);
    expect(s.namespace).toBeNull();
    expect(s.script).toBeNull();
    expect(s.startedAt).toBeNull();
    expect(s.activeRunners).toBe(0);
    expect(s.capacity).toBe(1);
    expect(s.runs).toEqual([]);
  });

  it("getStatus reflects an active run", () => {
    const before = Date.now();
    const run = tryAcquire("my-script.ts");
    const s = getStatus();
    expect(s.running).toBe(true);
    expect(s.namespace).toBe("default");
    expect(s.script).toBe("my-script.ts");
    expect(s.activeRunners).toBe(1);
    expect(s.startedAt).toBeGreaterThanOrEqual(before);
    expect(s.runs).toEqual([expect.objectContaining({ id: run?.id })]);
    expect(getRunById(run?.id ?? "")).toMatchObject({ script: "my-script.ts" });
  });

  it("tracks the namespace for an active run", () => {
    expect(tryAcquire("smoke.ts", "team-a")).toMatchObject({
      namespace: "team-a",
    });
    expect(getStatus()).toMatchObject({
      running: true,
      script: "smoke.ts",
      namespace: "team-a",
    });
  });

  it("does not hold the lock when namespace validation fails", () => {
    expect(() => tryAcquire("x", "bad/name")).toThrow();
    expect(getStatus().running).toBe(false);
  });

  it("getStatus reflects idle after release", () => {
    const run = tryAcquire("a.ts");
    release(run?.id);
    const s = getStatus();
    expect(s.running).toBe(false);
    expect(s.namespace).toBeNull();
    expect(s.script).toBeNull();
    expect(s.activeRunners).toBe(0);
  });

  it("rejects duplicate namespace and script while already running", () => {
    process.env.TOTAL_RUNNERS = "2";
    expect(tryAcquire("a.ts", "team-a")).toMatchObject({ script: "a.ts" });
    expect(tryAcquire("a.ts", "team-a")).toBeNull();
    expect(tryAcquire("a.ts", "team-b")).toMatchObject({
      namespace: "team-b",
    });
  });

  it("release without an id clears all runs for tests and compatibility", () => {
    process.env.TOTAL_RUNNERS = "2";
    tryAcquire("a.ts");
    tryAcquire("b.ts");
    release();
    expect(getStatus().runs).toEqual([]);
  });

  it("calls a registered cancellation handler for an active run", () => {
    const run = tryAcquire("a.ts");
    const cancel = jest.fn();
    if (!run) throw new Error("run not acquired");

    registerCancelHandler(run.id, cancel);

    expect(cancelRun(run.id)).toBe(true);
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it("clears cancellation handlers when a run is released", () => {
    const run = tryAcquire("a.ts");
    const cancel = jest.fn();
    if (!run) throw new Error("run not acquired");

    registerCancelHandler(run.id, cancel);
    release(run.id);

    expect(cancelRun(run.id)).toBe(false);
    expect(cancel).not.toHaveBeenCalled();
  });
});
