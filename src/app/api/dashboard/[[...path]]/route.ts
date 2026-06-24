export const dynamic = "force-dynamic";

import {
  DASHBOARD_PROXY_PREFIX,
  rewriteDashboardBody,
  rewriteDashboardLocation,
  sanitizeDashboardHeaders,
  shouldRewriteDashboardBody,
} from "@/lib/dashboard-proxy";

const DASHBOARD_ORIGIN = `http://127.0.0.1:${
  process.env.K6_DASHBOARD_PORT ?? "5665"
}`;

function buildProxyHeaders(request: Request): HeadersInit {
  const headers = new Headers(request.headers);
  headers.delete("host");
  headers.delete("connection");
  headers.delete("content-length");
  return headers;
}

async function proxy(request: Request): Promise<Response> {
  const url = new URL(request.url);
  // Reconstruct the upstream path directly from the request URL rather than the
  // catch-all params, so the trailing slash is preserved (k6's `/ui/` returns
  // the dashboard HTML, while `/ui` 301-redirects away).
  let path = url.pathname.slice(DASHBOARD_PROXY_PREFIX.length);
  if (path === "") path = "/";
  const target = `${DASHBOARD_ORIGIN}${path}${url.search}`;

  try {
    const upstream = await fetch(target, {
      method: request.method,
      headers: buildProxyHeaders(request),
      body:
        request.method !== "GET" && request.method !== "HEAD"
          ? request.body
          : undefined,
      redirect: "manual",
    });

    const contentType = upstream.headers.get("content-type");
    const headers = sanitizeDashboardHeaders(upstream.headers);

    const location = rewriteDashboardLocation(upstream.headers.get("location"));
    if (location) {
      headers.set("location", location);
    }

    if (!shouldRewriteDashboardBody(contentType)) {
      // Stream the body through unmodified. This is essential for the dashboard
      // SSE stream (text/event-stream at /events), which is long-lived and must
      // not be buffered, and is also correct for static assets.
      return new Response(upstream.body, { status: upstream.status, headers });
    }

    const text = await upstream.text();
    const rewritten = rewriteDashboardBody(text, {
      requestHost: url.host,
      dashboardPort: process.env.K6_DASHBOARD_PORT ?? "5665",
    });
    return new Response(rewritten, { status: upstream.status, headers });
  } catch {
    return new Response("k6 dashboard is not running", { status: 503 });
  }
}

export async function GET(request: Request) {
  return proxy(request);
}

export async function POST(request: Request) {
  return proxy(request);
}
