export const dynamic = "force-dynamic";

const DASHBOARD_ORIGIN = `http://localhost:${
  process.env.K6_DASHBOARD_PORT ?? "5665"
}`;

type Params = { params: Promise<{ path?: string[] }> };

async function proxy(request: Request, pathSegments: string[]): Promise<Response> {
  const url = new URL(request.url);
  const target = `${DASHBOARD_ORIGIN}/${pathSegments.join("/")}${url.search}`;

  try {
    const upstream = await fetch(target, {
      method: request.method,
      headers: Object.fromEntries(request.headers),
      body:
        request.method !== "GET" && request.method !== "HEAD"
          ? request.body
          : undefined,
    });
    const body = await upstream.arrayBuffer();
    return new Response(body, {
      status: upstream.status,
      headers: upstream.headers,
    });
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
