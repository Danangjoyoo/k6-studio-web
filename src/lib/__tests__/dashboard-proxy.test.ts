import {
  DASHBOARD_PROXY_PREFIX,
  rewriteDashboardBody,
  rewriteDashboardLocation,
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
    it("does NOT inject a <base> tag (relative assets resolve under /ui/)", () => {
      const html = "<html><head></head><body></body></html>";
      const result = rewriteDashboardBody(html);
      expect(result).not.toContain("<base ");
    });

    it("leaves relative asset paths untouched", () => {
      const html = '<script src="./assets/app.js"></script>';
      const result = rewriteDashboardBody(html);
      expect(result).toContain('src="./assets/app.js"');
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

  describe("rewriteDashboardLocation", () => {
    it("prefixes root-absolute redirect targets so they stay under the proxy", () => {
      expect(rewriteDashboardLocation("/ui/")).toBe(`${DASHBOARD_PROXY_PREFIX}/ui/`);
      expect(rewriteDashboardLocation("/ui?endpoint=/")).toBe(
        `${DASHBOARD_PROXY_PREFIX}/ui?endpoint=/`
      );
    });

    it("leaves already-prefixed locations untouched", () => {
      expect(rewriteDashboardLocation(`${DASHBOARD_PROXY_PREFIX}/ui/`)).toBe(
        `${DASHBOARD_PROXY_PREFIX}/ui/`
      );
    });

    it("leaves absolute URLs and missing locations untouched", () => {
      expect(rewriteDashboardLocation("http://example.com/ui/")).toBe(
        "http://example.com/ui/"
      );
      expect(rewriteDashboardLocation(null)).toBeNull();
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
