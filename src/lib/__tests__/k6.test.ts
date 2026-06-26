import { EventEmitter } from "events";

const spawnMock = jest.fn();
jest.mock("child_process", () => ({
  spawn: (...args: unknown[]) => spawnMock(...args),
}));

const createConnectionMock = jest.fn();
jest.mock("net", () => ({
  createConnection: (...args: unknown[]) => createConnectionMock(...args),
}));

const statMock = jest.fn();
jest.mock("fs/promises", () => ({
  stat: (...args: unknown[]) => statMock(...args),
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
  beforeEach(() => {
    statMock.mockReset();
    statMock.mockRejectedValue(new Error("report not ready"));
  });

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

  it("getK6RunEnv accepts an explicit dashboard port", () => {
    const env = getK6RunEnv("/tmp/report.html", 5667);
    expect(env.K6_WEB_DASHBOARD_PORT).toBe("5667");
  });

  it("getK6RunEnv sets a fast dashboard update period by default", () => {
    const env = getK6RunEnv("/tmp/report.html");
    expect(env.K6_WEB_DASHBOARD_PERIOD).toBe("1s");
  });

  it("getK6RunEnv respects K6_WEB_DASHBOARD_PERIOD env override", () => {
    process.env.K6_WEB_DASHBOARD_PERIOD = "2s";
    const env = getK6RunEnv("/tmp/report.html");
    expect(env.K6_WEB_DASHBOARD_PERIOD).toBe("2s");
    delete process.env.K6_WEB_DASHBOARD_PERIOD;
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

    it("passes an explicit dashboard port to the spawned k6 environment", async () => {
      const child = makeFakeChild();
      spawnMock.mockReturnValue(child);

      const promise = runK6("/tmp/s.js", "/tmp/r.html", () => {}, undefined, 5668);
      child.emit("close", 0);
      await expect(promise).resolves.toBe(0);

      expect(spawnMock).toHaveBeenCalledWith(
        expect.any(String),
        ["run", "/tmp/s.js"],
        expect.objectContaining({
          env: expect.objectContaining({
            K6_WEB_DASHBOARD_PORT: "5668",
          }),
        })
      );
    });

    it("kills the child process when the abort signal fires", async () => {
      const child = makeFakeChild();
      spawnMock.mockReturnValue(child);
      const controller = new AbortController();

      const promise = runK6(
        "/tmp/s.js",
        "/tmp/r.html",
        () => {},
        controller.signal
      );
      expect(child.kill).not.toHaveBeenCalled();

      controller.abort();
      expect(child.kill).toHaveBeenCalledWith("SIGTERM");

      child.emit("close", 1);
      await expect(promise).resolves.toBe(1);
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

    it("starts grace shutdown after the exported report is stable without a summary", async () => {
      jest.useFakeTimers();
      const child = makeFakeChild();
      spawnMock.mockReturnValue(child);
      statMock
        .mockRejectedValueOnce(new Error("report not ready"))
        .mockResolvedValueOnce({ size: 1024 })
        .mockResolvedValueOnce({ size: 1024 });

      const promise = runK6("/tmp/s.js", "/tmp/r.html", () => {});

      await jest.advanceTimersByTimeAsync(1500);
      expect(child.kill).not.toHaveBeenCalled();

      await jest.advanceTimersByTimeAsync(2000);
      expect(child.kill).toHaveBeenCalledWith("SIGTERM");

      child.emit("close", 0);
      await expect(promise).resolves.toBe(0);
      jest.useRealTimers();
    });

    it("does not start grace shutdown from complete progress rows before report export", async () => {
      jest.useFakeTimers();
      const child = makeFakeChild();
      spawnMock.mockReturnValue(child);

      const promise = runK6("/tmp/s.js", "/tmp/r.html", () => {});

      child.stdout.emit(
        "data",
        Buffer.from(
          [
            "running (04.0s), 0/1 VUs, 4 complete and 0 interrupted iterations",
            "default \u2713 [ 100% ] 1 VUs  4s",
            "",
            "",
          ].join("\n")
        )
      );

      await jest.advanceTimersByTimeAsync(5000);
      expect(child.kill).not.toHaveBeenCalled();

      child.emit("close", 0);
      await expect(promise).resolves.toBe(0);
      jest.useRealTimers();
    });

    it("does not start grace shutdown during a gap before a waiting scenario", async () => {
      jest.useFakeTimers();
      const child = makeFakeChild();
      spawnMock.mockReturnValue(child);

      const promise = runK6("/tmp/s.js", "/tmp/r.html", () => {});

      child.stdout.emit(
        "data",
        Buffer.from(
          [
            "running (03.0s), 0/2 VUs, 4 complete and 0 interrupted iterations",
            "first  \u2713 [ 100% ] 1 VUs    2s",
            "second \u2022 [   0% ] waiting  3.0s",
            "",
            "",
          ].join("\n")
        )
      );

      await jest.advanceTimersByTimeAsync(5000);
      expect(child.kill).not.toHaveBeenCalled();

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
