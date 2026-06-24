/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen, waitFor } from "@testing-library/react";
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

  it("polls and renders iframe when active run and dashboard is up", async () => {
    render(
      <LiveDashboardTab
        scriptName="smoke.js"
        isActiveRun={true}
        runEpoch={1}
      />
    );

    await waitFor(() => {
      const iframe = screen.getByTitle("k6 Live Dashboard");
      expect(iframe).toBeInTheDocument();
      expect(iframe.getAttribute("src")).toBe("/api/dashboard/ui/?endpoint=/api/dashboard/");
    });
    expect(global.fetch).toHaveBeenCalledWith("/api/dashboard/ui/");
  });
});
