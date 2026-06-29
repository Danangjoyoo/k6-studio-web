import { GET } from "@/app/api/dashboard/[[...path]]/route";

const mockGetRunById = jest.fn();
const mockGetStatus = jest.fn();

jest.mock("@/lib/run-lock", () => ({
  getRunById: (...args: unknown[]) => mockGetRunById(...args),
  getStatus: (...args: unknown[]) => mockGetStatus(...args),
  getDashboardBasePort: () => 5665,
}));

describe("dashboard proxy route", () => {
  beforeEach(() => {
    mockGetRunById.mockReset();
    mockGetStatus.mockReset().mockReturnValue({ runs: [] });
    global.fetch = jest.fn().mockResolvedValue(
      new Response("ok", {
        status: 200,
        headers: { "content-type": "text/plain" },
      })
    ) as jest.Mock;
  });

  it("proxies to the dashboard port for the requested run id", async () => {
    mockGetRunById.mockReturnValue({
      id: "run_1",
      dashboardPort: 5667,
    });

    const response = await GET(
      new Request("http://localhost/k6/api/dashboard/ui/?runId=run_1")
    );

    expect(response.status).toBe(200);
    expect(global.fetch).toHaveBeenCalledWith(
      "http://127.0.0.1:5667/ui/?runId=run_1",
      expect.any(Object)
    );
  });

  it("proxies path-scoped dashboard URLs to the requested run id", async () => {
    mockGetRunById.mockReturnValue({
      id: "run_1",
      dashboardPort: 5667,
    });

    const response = await GET(
      new Request("http://localhost/k6/api/dashboard/run/run_1/events")
    );

    expect(response.status).toBe(200);
    expect(global.fetch).toHaveBeenCalledWith(
      "http://127.0.0.1:5667/events",
      expect.any(Object)
    );
  });

  it("keeps rewritten dashboard websocket URLs scoped to the requested run id", async () => {
    mockGetRunById.mockReturnValue({
      id: "run_1",
      dashboardPort: 5667,
    });
    global.fetch = jest.fn().mockResolvedValue(
      new Response('const ws = new WebSocket("ws://127.0.0.1:5667/ws");', {
        status: 200,
        headers: { "content-type": "application/javascript" },
      })
    ) as jest.Mock;

    const response = await GET(
      new Request("http://localhost/k6/api/dashboard/run/run_1/ui/app.js")
    );

    await expect(response.text()).resolves.toContain(
      'ws://localhost/k6/api/dashboard/run/run_1/ws'
    );
  });

  it("keeps dashboard redirects scoped to the requested run id", async () => {
    mockGetRunById.mockReturnValue({
      id: "run_1",
      dashboardPort: 5667,
    });
    global.fetch = jest.fn().mockResolvedValue(
      new Response(null, {
        status: 308,
        headers: { location: "/ui/" },
      })
    ) as jest.Mock;

    const response = await GET(
      new Request("http://localhost/k6/api/dashboard/run/run_1/ui")
    );

    expect(response.headers.get("location")).toBe(
      "/k6/api/dashboard/run/run_1/ui/"
    );
  });

  it("returns 404 instead of falling back when a requested run id is stale", async () => {
    mockGetRunById.mockReturnValue(null);

    const response = await GET(
      new Request("http://localhost/k6/api/dashboard/run/stale-run/ui/")
    );

    expect(response.status).toBe(404);
    expect(await response.text()).toBe("k6 dashboard run not found");
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("falls back to the oldest active run when run id is missing", async () => {
    mockGetStatus.mockReturnValue({
      runs: [
        { id: "run_1", dashboardPort: 5666 },
        { id: "run_2", dashboardPort: 5667 },
      ],
    });

    await GET(new Request("http://localhost/k6/api/dashboard/ui/"));

    expect(global.fetch).toHaveBeenCalledWith(
      "http://127.0.0.1:5666/ui/",
      expect.any(Object)
    );
  });
});
