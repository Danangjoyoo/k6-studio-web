import { tryAcquire, release, getStatus, _reset } from "@/lib/run-lock";

beforeEach(() => _reset());

describe("run-lock", () => {
  it("allows acquiring when nothing is running", () => {
    expect(tryAcquire("script.ts")).toBe(true);
  });

  it("rejects a second acquire while a run is held", () => {
    expect(tryAcquire("a.ts")).toBe(true);
    expect(tryAcquire("b.ts")).toBe(false);
    expect(tryAcquire("a.ts")).toBe(false);
  });

  it("allows acquiring again after release", () => {
    tryAcquire("a.ts");
    release();
    expect(tryAcquire("b.ts")).toBe(true);
  });

  it("release is idempotent", () => {
    release();
    release();
    expect(tryAcquire("a.ts")).toBe(true);
  });

  it("getStatus reports not running initially", () => {
    const s = getStatus();
    expect(s.running).toBe(false);
    expect(s.script).toBeNull();
    expect(s.startedAt).toBeNull();
    expect(s.activeRunners).toBe(0);
    expect(s.capacity).toBe(1);
  });

  it("getStatus reflects an active run", () => {
    const before = Date.now();
    tryAcquire("my-script.ts");
    const s = getStatus();
    expect(s.running).toBe(true);
    expect(s.script).toBe("my-script.ts");
    expect(s.activeRunners).toBe(1);
    expect(s.startedAt).toBeGreaterThanOrEqual(before);
  });

  it("getStatus reflects idle after release", () => {
    tryAcquire("a.ts");
    release();
    const s = getStatus();
    expect(s.running).toBe(false);
    expect(s.script).toBeNull();
    expect(s.activeRunners).toBe(0);
  });
});
