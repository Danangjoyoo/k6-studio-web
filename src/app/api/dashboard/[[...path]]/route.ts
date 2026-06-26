export const dynamic = "force-dynamic";

import {
  DASHBOARD_PROXY_PREFIX,
  rewriteDashboardBody,
  rewriteDashboardLocation,
  sanitizeDashboardHeaders,
  shouldRewriteDashboardBody,
} from "@/lib/dashboard-proxy";
import { getDashboardBasePort, getRunById, getStatus } from "@/lib/run-lock";

function buildProxyHeaders(request: Request): HeadersInit {
  const headers = new Headers(request.headers);
  headers.delete("host");
  headers.delete("connection");
  headers.delete("content-length");
  return headers;
}

function resolveDashboardPort(runId: string | null): number | null {
  if (runId) {
    const run = getRunById(runId);
    return run?.dashboardPort ?? null;
  }
  return getStatus().runs[0]?.dashboardPort ?? getDashboardBasePort();
}

function extractRunScopedPath(path: string): {
  path: string;
  runId: string | null;
} {
  const segments = path.split("/");
  if (segments[1] !== "run" || !segments[2]) {
    return { path, runId: null };
  }

  const scopedPath = `/${segments.slice(3).join("/")}`;
  return {
    path: scopedPath,
    runId: decodeURIComponent(segments[2]),
  };
}

async function proxy(request: Request): Promise<Response> {
  const url = new URL(request.url);
  // Reconstruct the upstream path directly from the request URL rather than the
  // catch-all params, so the trailing slash is preserved (k6's `/ui/` returns
  // the dashboard HTML, while `/ui` 301-redirects away).
  let path = url.pathname.slice(DASHBOARD_PROXY_PREFIX.length);
  if (path === "") path = "/";
  const scoped = extractRunScopedPath(path);
  path = scoped.path;
  const requestedRunId = scoped.runId ?? url.searchParams.get("runId");
  const dashboardPort = resolveDashboardPort(requestedRunId);
  if (dashboardPort === null) {
    return new Response("k6 dashboard run not found", { status: 404 });
  }
  const proxyPrefix = requestedRunId
    ? `${DASHBOARD_PROXY_PREFIX}/run/${encodeURIComponent(requestedRunId)}`
    : DASHBOARD_PROXY_PREFIX;
  const target = `http://127.0.0.1:${dashboardPort}${path}${url.search}`;

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

    const location = rewriteDashboardLocation(
      upstream.headers.get("location"),
      proxyPrefix
    );
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
      proxyPrefix,
      requestHost: url.host,
      dashboardPort: String(dashboardPort),
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
