export const dynamic = "force-dynamic";

import {
  rewriteDashboardBody,
  sanitizeDashboardHeaders,
  shouldRewriteDashboardBody,
} from "@/lib/dashboard-proxy";

const DASHBOARD_ORIGIN = `http://127.0.0.1:${
  process.env.K6_DASHBOARD_PORT ?? "5665"
}`;

type Params = { params: Promise<{ path?: string[] }> };

function buildProxyHeaders(request: Request): HeadersInit {
  const headers = new Headers(request.headers);
  headers.delete("host");
  headers.delete("connection");
  headers.delete("content-length");
  return headers;
}

async function proxy(
  request: Request,
  pathSegments: string[]
): Promise<Response> {
  const url = new URL(request.url);
  const target = `${DASHBOARD_ORIGIN}/${pathSegments.join("/")}${url.search}`;

  try {
    const upstream = await fetch(target, {
      method: request.method,
      headers: buildProxyHeaders(request),
      body:
        request.method !== "GET" && request.method !== "HEAD"
          ? request.body
          : undefined,
    });

    const contentType = upstream.headers.get("content-type");
    const headers = sanitizeDashboardHeaders(upstream.headers);

    if (!shouldRewriteDashboardBody(contentType)) {
      const body = await upstream.arrayBuffer();
      return new Response(body, { status: upstream.status, headers });
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

export async function GET(request: Request, { params }: Params) {
  const { path = [] } = await params;
  return proxy(request, path);
}

export async function POST(request: Request, { params }: Params) {
  const { path = [] } = await params;
  return proxy(request, path);
}
