import { EventEmitter } from "events";

const spawnMock = jest.fn();
jest.mock("child_process", () => ({
  spawn: (...args: unknown[]) => spawnMock(...args),
}));

const createConnectionMock = jest.fn();
jest.mock("net", () => ({
  createConnection: (...args: unknown[]) => createConnectionMock(...args),
}));

import {
  getK6RunArgs,
  getK6RunEnv,
  runK6,
  isK6SummaryLine,
  waitForPortFree,
} from "@/lib/k6";

function makeFakeChild() {
  const child = new EventEmitter() as EventEmitter & {
    stdout: EventEmitter;
    stderr: EventEmitter;
    kill: jest.Mock;
  };
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.kill = jest.fn();
  return child;
}

function makeFakeSocket(behavior: "connect" | "error") {
  const sock = new EventEmitter() as EventEmitter & { destroy: jest.Mock };
  sock.destroy = jest.fn();
  setImmediate(() => sock.emit(behavior));
  return sock;
}

describe("k6", () => {
  it("getK6RunArgs returns run command with script path only", () => {
    const args = getK6RunArgs("/tmp/script.js");
    expect(args).toEqual(["run", "/tmp/script.js"]);
    expect(args.some((a) => a.includes("web-dashboard"))).toBe(false);
  });

  it("getK6RunEnv enables built-in web dashboard with export path", () => {
    const env = getK6RunEnv("/tmp/report.html");
    expect(env.K6_WEB_DASHBOARD).toBe("true");
    expect(env.K6_WEB_DASHBOARD_HOST).toBe("0.0.0.0");
    expect(env.K6_WEB_DASHBOARD_PORT).toBe("5665");
    expect(env.K6_WEB_DASHBOARD_OPEN).toBe("false");
    expect(env.K6_WEB_DASHBOARD_EXPORT).toBe("/tmp/report.html");
  });

  it("getK6RunEnv respects K6_WEB_DASHBOARD_HOST env override", () => {
    process.env.K6_WEB_DASHBOARD_HOST = "127.0.0.1";
    const env = getK6RunEnv("/tmp/report.html");
    expect(env.K6_WEB_DASHBOARD_HOST).toBe("127.0.0.1");
    delete process.env.K6_WEB_DASHBOARD_HOST;
  });

  describe("isK6SummaryLine", () => {
    it("returns true for the iteration_duration line", () => {
      expect(isK6SummaryLine("     iteration_duration.............: avg=29ms")).toBe(true);
      expect(isK6SummaryLine("iteration_duration...: avg=1s")).toBe(true);
    });

    it("returns false for a regular log line", () => {
      expect(isK6SummaryLine("running (5s), 1/1 VUs")).toBe(false);
    });

    it("returns false for log text that mentions iteration_duration", () => {
      expect(isK6SummaryLine("console.log iteration_duration before the run is done")).toBe(false);
    });
  });

  describe("waitForPortFree", () => {
    beforeEach(() => createConnectionMock.mockReset());

    it("resolves immediately when connection is refused (port free)", async () => {
      createConnectionMock.mockImplementation(() =>
        makeFakeSocket("error")
      );
      await expect(waitForPortFree(5665, 1000)).resolves.toBeUndefined();
    });

    it("polls until the port stops accepting then resolves", async () => {
      let calls = 0;
      createConnectionMock.mockImplementation(() => {
        calls++;
        return makeFakeSocket(calls < 2 ? "connect" : "error");
      });
      await expect(waitForPortFree(5665, 1000)).resolves.toBeUndefined();
      expect(calls).toBeGreaterThanOrEqual(2);
    });
  });

  describe("runK6 process lifecycle", () => {
    beforeEach(() => spawnMock.mockReset());

    it("kills the child process when the abort signal fires", () => {
      const child = makeFakeChild();
      spawnMock.mockReturnValue(child);
      const controller = new AbortController();

      runK6("/tmp/s.js", "/tmp/r.html", () => {}, controller.signal);
      expect(child.kill).not.toHaveBeenCalled();

      controller.abort();
      expect(child.kill).toHaveBeenCalledWith("SIGTERM");
    });

    it("does not attempt to kill once the process has already closed", () => {
      const child = makeFakeChild();
      spawnMock.mockReturnValue(child);
      const controller = new AbortController();

      const promise = runK6("/tmp/s.js", "/tmp/r.html", () => {}, controller.signal);
      child.emit("close", 0);

      controller.abort();
      expect(child.kill).not.toHaveBeenCalled();
      return expect(promise).resolves.toBe(0);
    });

    it("detects a summary line split across stdout chunks and starts grace shutdown", async () => {
      jest.useFakeTimers();
      const child = makeFakeChild();
      spawnMock.mockReturnValue(child);

      const promise = runK6("/tmp/s.js", "/tmp/r.html", () => {});

      child.stdout.emit("data", Buffer.from("     iteration_"));
      child.stdout.emit("data", Buffer.from("duration.............: avg=29ms\n"));

      jest.advanceTimersByTime(2000);
      expect(child.kill).toHaveBeenCalledWith("SIGTERM");

      child.emit("close", 0);
      await expect(promise).resolves.toBe(0);
      jest.useRealTimers();
    });

    it("resolves with the exit code", async () => {
      const child = makeFakeChild();
      spawnMock.mockReturnValue(child);
      const p = runK6("/tmp/s.js", "/tmp/r.html", () => {});
      child.emit("close", 0);
      await expect(p).resolves.toBe(0);
    });
  });
});
