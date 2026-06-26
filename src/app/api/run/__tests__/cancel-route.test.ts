import { POST } from "@/app/api/run/cancel/route";
import {
  _reset,
  cancelRun,
  registerCancelHandler,
  tryAcquire,
} from "@/lib/run-lock";

describe("POST /api/run/cancel", () => {
  beforeEach(() => {
    _reset();
  });

  afterEach(() => {
    _reset();
  });

  it("returns 400 when runId is missing", async () => {
    const response = await POST(
      new Request("http://localhost/api/run/cancel", {
        method: "POST",
        body: JSON.stringify({}),
      })
    );

    await expect(response.json()).resolves.toEqual({
      error: "runId required",
    });
    expect(response.status).toBe(400);
  });

  it("returns 404 when the run cannot be cancelled", async () => {
    const response = await POST(
      new Request("http://localhost/api/run/cancel", {
        method: "POST",
        body: JSON.stringify({ runId: "missing" }),
      })
    );

    await expect(response.json()).resolves.toEqual({
      error: "run not found",
    });
    expect(response.status).toBe(404);
  });

  it("triggers cancellation for an active run", async () => {
    const activeRun = tryAcquire("api/smoke.ts", "team-a");
    const cancel = jest.fn();
    if (!activeRun) throw new Error("run not acquired");
    registerCancelHandler(activeRun.id, cancel);

    const response = await POST(
      new Request("http://localhost/api/run/cancel", {
        method: "POST",
        body: JSON.stringify({ runId: activeRun.id }),
      })
    );

    await expect(response.json()).resolves.toEqual({ cancelled: true });
    expect(response.status).toBe(200);
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(cancelRun(activeRun.id)).toBe(true);
  });
});
