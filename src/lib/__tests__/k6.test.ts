import { getK6RunArgs, getK6RunEnv } from "@/lib/k6";

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
});
