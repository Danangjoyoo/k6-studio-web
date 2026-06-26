/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { act, render, screen } from "@testing-library/react";
import LiveDashboardTab from "@/components/tabs/LiveDashboardTab";

async function advanceRetryTimer(ms: number) {
  await act(async () => {
    jest.advanceTimersByTime(ms);
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("LiveDashboardTab", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    global.fetch = jest.fn().mockResolvedValue({ ok: true }) as jest.Mock;
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
    expect(iframe.getAttribute("src")).toBe("/api/dashboard/ui/?endpoint=/api/dashboard/");
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
      "/api/dashboard/run/run_1/ui/?endpoint=%2Fapi%2Fdashboard%2Frun%2Frun_1%2F"
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
    (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: false });
    render(
      <LiveDashboardTab
        scriptName="smoke.js"
        isActiveRun={true}
        runEpoch={1}
      />
    );

    const first = screen.getByTitle("k6 Live Dashboard");

    await advanceRetryTimer(2000);

    const second = screen.getByTitle("k6 Live Dashboard");
    expect(second).toBeInTheDocument();
    expect(second).not.toBe(first);
    expect(second.getAttribute("src")).toBe("/api/dashboard/ui/?endpoint=/api/dashboard/");
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
