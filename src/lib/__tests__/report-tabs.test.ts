import {
  REPORT_TABS_SUFFIX,
  isReportTabsSidecar,
  normalizeReportPreviewTabs,
  reportTabsSidecarName,
} from "@/lib/report-tabs";

describe("report tab metadata helpers", () => {
  it("builds and detects report sidecar names", () => {
    expect(REPORT_TABS_SUFFIX).toBe(".tabs.json");
    expect(reportTabsSidecarName("api/smoke.ts-111.html")).toBe(
      "api/smoke.ts-111.html.tabs.json"
    );
    expect(isReportTabsSidecar("api/smoke.ts-111.html.tabs.json")).toBe(true);
    expect(isReportTabsSidecar("api/smoke.ts-111.html")).toBe(false);
  });

  it("normalizes http and https tabs with derived host titles", () => {
    expect(
      normalizeReportPreviewTabs([
        { id: "x", url: "https://grafana.example.local/d/a", title: "" },
        { id: "y", url: "http://localhost:3001/path", title: "Local board" },
      ])
    ).toEqual([
      {
        id: "x",
        url: "https://grafana.example.local/d/a",
        title: "grafana.example.local",
      },
      {
        id: "y",
        url: "http://localhost:3001/path",
        title: "Local board",
      },
    ]);
  });

  it("rejects non-http urls", () => {
    expect(() =>
      normalizeReportPreviewTabs([{ id: "x", url: "javascript:alert(1)" }])
    ).toThrow("Only http and https URLs are supported");
    expect(() =>
      normalizeReportPreviewTabs([{ id: "x", url: "/api/reports/a.html" }])
    ).toThrow("Only http and https URLs are supported");
  });
});
