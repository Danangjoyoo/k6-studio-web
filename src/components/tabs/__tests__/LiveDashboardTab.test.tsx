/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { act, render, screen, waitFor } from "@testing-library/react";
import LiveDashboardTab from "@/components/tabs/LiveDashboardTab";

async function advanceRetryTimer(ms: number) {
  await act(async () => {
    jest.advanceTimersByTime(ms);
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function flushAsyncWork() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

function eventStreamResponse(): { ok: boolean; body: { getReader: () => { read: () => Promise<{ done: boolean; value?: Uint8Array }> } } } {
  let readCount = 0;
  return {
    ok: true,
    body: {
      getReader: () => ({
        read: async () => {
          readCount += 1;
          if (readCount === 1) {
            return {
              done: false,
              value: new Uint8Array([1]),
            };
          }
          return { done: true };
        },
      }),
    },
  };
}

describe("LiveDashboardTab", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    global.fetch = jest.fn().mockResolvedValue(eventStreamResponse()) as jest.Mock;
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("shows select-script empty state when no script selected", () => {
    render(
      <LiveDashboardTab scriptName={null} isActiveRun={false} runEpoch={0} />
    );
    expect(screen.getByText(/select a script/i)).toBeInTheDocument();
  });

  it("shows offline when script is not actively running", () => {
    render(
      <LiveDashboardTab
        scriptName="smoke.js"
        isActiveRun={false}
        runEpoch={0}
      />
    );
    expect(screen.getByText(/dashboard only available during a run/i)).toBeInTheDocument();
  });

  it("renders the iframe immediately for the active selected run", () => {
    global.fetch = jest.fn(() => new Promise(() => undefined)) as jest.Mock;

    render(
      <LiveDashboardTab
        scriptName="smoke.js"
        isActiveRun={true}
        runEpoch={1}
      />
    );

    const iframe = screen.getByTitle("k6 Live Dashboard");
    expect(iframe).toBeInTheDocument();
    expect(iframe.getAttribute("src")).toBe("/k6/api/dashboard/ui/?endpoint=/k6/api/dashboard/");
  });

  it("renders a run-specific dashboard iframe when run id is provided", () => {
    global.fetch = jest.fn(() => new Promise(() => undefined)) as jest.Mock;

    render(
      <LiveDashboardTab
        scriptName="smoke.js"
        isActiveRun={true}
        runEpoch={1}
        runId="run_1"
      />
    );

    expect(screen.getByTitle("k6 Live Dashboard")).toHaveAttribute(
      "src",
      "/k6/api/dashboard/run/run_1/ui/?endpoint=%2Fk6%2Fapi%2Fdashboard%2Frun%2Frun_1%2F"
    );
  });

  it("does not render the iframe when the selected script is not actively running", () => {
    render(
      <LiveDashboardTab
        scriptName="other.js"
        isActiveRun={false}
        runEpoch={1}
      />
    );

    expect(screen.queryByTitle("k6 Live Dashboard")).not.toBeInTheDocument();
    expect(screen.getByText(/dashboard only available during a run/i)).toBeInTheDocument();
  });

  it("retries the iframe while the dashboard is unavailable", async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({ ok: false })
      .mockResolvedValueOnce(eventStreamResponse());
    render(
      <LiveDashboardTab
        scriptName="smoke.js"
        isActiveRun={true}
        runEpoch={1}
      />
    );

    screen.getByTitle("k6 Live Dashboard");
    await flushAsyncWork();

    await advanceRetryTimer(2000);

    expect(global.fetch).toHaveBeenCalledTimes(2);
    await waitFor(() => {
      expect(screen.getByTitle("k6 Live Dashboard").getAttribute("src")).toBe(
        "/k6/api/dashboard/ui/?endpoint=/k6/api/dashboard/&_reload=1"
      );
    });
  });

  it("probes the run events stream before remounting a previously blank iframe", async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({ ok: false })
      .mockResolvedValueOnce(eventStreamResponse());

    render(
      <LiveDashboardTab
        scriptName="smoke.js"
        isActiveRun={true}
        runEpoch={1}
        runId="run_1"
      />
    );

    screen.getByTitle("k6 Live Dashboard");
    await flushAsyncWork();
    expect(global.fetch).toHaveBeenCalledWith(
      "/k6/api/dashboard/run/run_1/events",
      expect.objectContaining({ cache: "no-store" })
    );

    await advanceRetryTimer(2000);

    expect(global.fetch).toHaveBeenCalledTimes(2);
    await waitFor(() => {
      expect(screen.getByTitle("k6 Live Dashboard").getAttribute("src")).toBe(
        "/k6/api/dashboard/run/run_1/ui/?endpoint=%2Fk6%2Fapi%2Fdashboard%2Frun%2Frun_1%2F&_reload=1"
      );
    });
    const second = screen.getByTitle("k6 Live Dashboard");

    await advanceRetryTimer(6000);

    expect(screen.getByTitle("k6 Live Dashboard")).toBe(second);
  });

  it("keeps the same iframe after the dashboard is reachable", async () => {
    render(
      <LiveDashboardTab
        scriptName="smoke.js"
        isActiveRun={true}
        runEpoch={1}
      />
    );

    const first = screen.getByTitle("k6 Live Dashboard");

    await advanceRetryTimer(6000);

    expect(screen.getByTitle("k6 Live Dashboard")).toBe(first);
  });
});
