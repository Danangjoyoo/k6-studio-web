import {
  DASHBOARD_PROXY_PREFIX,
  rewriteDashboardBody,
  sanitizeDashboardHeaders,
  shouldRewriteDashboardBody,
} from "@/lib/dashboard-proxy";

describe("dashboard-proxy", () => {
  describe("sanitizeDashboardHeaders", () => {
    it("removes X-Frame-Options and CSP", () => {
      const upstream = new Headers({
        "content-type": "text/html",
        "x-frame-options": "SAMEORIGIN",
        "content-security-policy": "frame-ancestors 'none'",
        "content-length": "100",
      });
      const result = sanitizeDashboardHeaders(upstream);
      expect(result.get("x-frame-options")).toBeNull();
      expect(result.get("content-security-policy")).toBeNull();
      expect(result.get("content-length")).toBeNull();
      expect(result.get("content-type")).toBe("text/html");
    });
  });

  describe("rewriteDashboardBody", () => {
    it("injects base href for HTML", () => {
      const html = "<html><head></head><body></body></html>";
      const result = rewriteDashboardBody(html);
      expect(result).toContain(`<base href="${DASHBOARD_PROXY_PREFIX}/">`);
    });

    it("rewrites root-absolute src paths", () => {
      const html = '<script src="/assets/app.js"></script>';
      const result = rewriteDashboardBody(html);
      expect(result).toContain(`src="${DASHBOARD_PROXY_PREFIX}/assets/app.js"`);
    });

    it("rewrites WebSocket URLs to proxied path", () => {
      const js = 'const ws = new WebSocket("ws://127.0.0.1:5665/ws");';
      const result = rewriteDashboardBody(js, { requestHost: "localhost:3000" });
      expect(result).toContain('ws://localhost:3000/api/dashboard/ws');
    });

    it("rewrites WebSocket URLs using 0.0.0.0 bind address", () => {
      const js = 'const ws = new WebSocket("ws://0.0.0.0:5665/ws");';
      const result = rewriteDashboardBody(js, { requestHost: "localhost:3000" });
      expect(result).toContain('ws://localhost:3000/api/dashboard/ws');
    });
  });

  describe("shouldRewriteDashboardBody", () => {
    it("returns true for html and javascript", () => {
      expect(shouldRewriteDashboardBody("text/html; charset=utf-8")).toBe(true);
      expect(shouldRewriteDashboardBody("application/javascript")).toBe(true);
      expect(shouldRewriteDashboardBody("application/json")).toBe(false);
    });
  });
});
