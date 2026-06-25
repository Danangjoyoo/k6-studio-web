/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { act, render, screen } from "@testing-library/react";
import LiveDashboardTab from "@/components/tabs/LiveDashboardTab";

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
    expect(global.fetch).not.toHaveBeenCalled();
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

  it("retries the iframe while the run remains active", () => {
    render(
      <LiveDashboardTab
        scriptName="smoke.js"
        isActiveRun={true}
        runEpoch={1}
      />
    );

    const first = screen.getByTitle("k6 Live Dashboard");

    act(() => {
      jest.advanceTimersByTime(2000);
    });

    const second = screen.getByTitle("k6 Live Dashboard");
    expect(second).toBeInTheDocument();
    expect(second).not.toBe(first);
    expect(second.getAttribute("src")).toBe("/api/dashboard/ui/?endpoint=/api/dashboard/");
  });
});
