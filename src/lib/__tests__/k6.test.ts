import { EventEmitter } from "events";

const spawnMock = jest.fn();
jest.mock("child_process", () => ({
  spawn: (...args: unknown[]) => spawnMock(...args),
}));

import { getK6RunArgs, getK6RunEnv, runK6 } from "@/lib/k6";

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

    it("kills a still-running previous run before starting a new one", () => {
      const first = makeFakeChild();
      const second = makeFakeChild();
      spawnMock.mockReturnValueOnce(first).mockReturnValueOnce(second);

      runK6("/tmp/a.js", "/tmp/a.html", () => {});
      // first run still alive (no close emitted)
      runK6("/tmp/b.js", "/tmp/b.html", () => {});

      expect(first.kill).toHaveBeenCalled();
      expect(second.kill).not.toHaveBeenCalled();
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
  });
});
