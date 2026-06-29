/* eslint-disable @typescript-eslint/no-require-imports */

describe("docker dashboard routing helpers", () => {
  it("routes run-scoped dashboard websocket URLs to the runner slot port", async () => {
    const {
      resolveDashboardTarget,
      stripDashboardPrefix,
    } = require("../docker-dashboard-routing.cjs");

    expect(
      resolveDashboardTarget("/api/dashboard/run/run_1790000000000_4_3/ws", [
        { id: "run_1790000000000_4_3", dashboardPort: 5668 },
      ])
    ).toBe("http://127.0.0.1:5668");
    expect(
      stripDashboardPrefix("/api/dashboard/run/run_1790000000000_4_3/ws?x=1")
    ).toBe("/ws?x=1");
    expect(
      resolveDashboardTarget("/k6/api/dashboard/run/run_1790000000000_4_3/ws", [
        { id: "run_1790000000000_4_3", dashboardPort: 5668 },
      ])
    ).toBe("http://127.0.0.1:5668");
    expect(
      stripDashboardPrefix("/k6/api/dashboard/run/run_1790000000000_4_3/ws?x=1")
    ).toBe("/ws?x=1");
  });

  it("falls back to the first dashboard port for unscoped or invalid run URLs", async () => {
    const {
      isDashboardUrl,
      resolveDashboardTarget,
      stripDashboardPrefix,
    } = require("../docker-dashboard-routing.cjs");

    expect(isDashboardUrl("/api/dashboard/ws")).toBe(true);
    expect(isDashboardUrl("/k6/api/dashboard/ws")).toBe(true);
    expect(isDashboardUrl("/k6/api/run/status")).toBe(false);
    expect(resolveDashboardTarget("/api/dashboard/ws")).toBe(
      "http://127.0.0.1:5665"
    );
    expect(resolveDashboardTarget("/k6/api/dashboard/ws")).toBe(
      "http://127.0.0.1:5665"
    );
    expect(resolveDashboardTarget("/api/dashboard/run/run_1_1_20/ws")).toBeNull();
    expect(stripDashboardPrefix("/api/dashboard/ws")).toBe("/ws");
    expect(stripDashboardPrefix("/k6/api/dashboard/ws")).toBe("/ws");
  });

  it("does not fall back when a scoped run id is stale", () => {
    const {
      resolveDashboardTarget,
    } = require("../docker-dashboard-routing.cjs");

    expect(
      resolveDashboardTarget("/api/dashboard/run/run_1790000000000_4_3/ws", [
        { id: "another-run", dashboardPort: 5665 },
      ])
    ).toBeNull();
  });
});
