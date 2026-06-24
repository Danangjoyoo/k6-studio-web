export const DASHBOARD_PROXY_PREFIX = "/api/dashboard";

export function sanitizeDashboardHeaders(upstream: Headers): Headers {
  const headers = new Headers(upstream);
  headers.delete("x-frame-options");
  headers.delete("content-security-policy");
  headers.delete("content-length");
  headers.delete("transfer-encoding");
  return headers;
}

export function shouldRewriteDashboardBody(contentType: string | null): boolean {
  if (!contentType) return false;
  const lower = contentType.toLowerCase();
  return (
    lower.includes("text/html") ||
    lower.includes("application/javascript") ||
    lower.includes("text/javascript")
  );
}

export function rewriteDashboardBody(
  body: string,
  options: {
    proxyPrefix?: string;
    dashboardPort?: string;
    requestHost?: string;
  } = {}
): string {
  const prefix = options.proxyPrefix ?? DASHBOARD_PROXY_PREFIX;
  const port = options.dashboardPort ?? "5665";
  const host = options.requestHost ?? "localhost";

  let result = body;

  // WebSocket URLs -> same-origin proxied path
  const wsPatterns = [
    new RegExp(`wss?://127\\.0\\.0\\.1:${port}`, "g"),
    new RegExp(`wss?://localhost:${port}`, "g"),
    new RegExp(`wss?://0\\.0\\.0\\.0:${port}`, "g"),
  ];
  const wsTarget = `ws://${host}${prefix}`;
  for (const pattern of wsPatterns) {
    result = result.replace(pattern, wsTarget);
  }

  // Root-absolute asset paths (avoid double-prefix)
  result = result.replace(
    /(\s(?:src|href)=["'])\/(?!api\/dashboard\/)/g,
    `$1${prefix}/`
  );

  // Inject <base> for HTML documents missing one
  if (/<html[\s>]/i.test(result) && !/<base\s/i.test(result)) {
    result = result.replace(
      /<head([^>]*)>/i,
      `<head$1><base href="${prefix}/">`
    );
  }

  return result;
}
