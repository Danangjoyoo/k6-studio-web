/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import TestHistoryTab from "@/components/tabs/TestHistoryTab";

global.fetch = jest.fn().mockResolvedValue({
  ok: true,
  json: async () => ({
    reports: [
      {
        name: "smoke.js-1719200000000.html",
        size: 40000,
        lastModified: "2024-06-24T00:00:00.000Z",
      },
      {
        name: "other.js-1719200000000.html",
        size: 20000,
        lastModified: "2024-06-24T00:00:00.000Z",
      },
    ],
  }),
}) as jest.Mock;

function deferredReports(reports: unknown[]) {
  let resolve!: () => void;
  const released = new Promise<void>((r) => {
    resolve = r;
  });
  return {
    resolve,
    response: Promise.resolve({
      ok: true,
      json: async () => {
        await released;
        return { reports };
      },
    }),
  };
}

describe("TestHistoryTab", () => {
  beforeEach(() => {
    (global.fetch as jest.Mock).mockClear();
  });

  it("shows select-script empty state when no script selected", () => {
    render(<TestHistoryTab namespace="default" scriptName={null} />);
    expect(screen.getByText(/select a script/i)).toBeInTheDocument();
  });

  it("filters reports by selected script", async () => {
    render(<TestHistoryTab namespace="default" scriptName="smoke.js" />);
    await waitFor(() => {
      expect(
        screen.getByText("smoke.js-1719200000000.html")
      ).toBeInTheDocument();
    });
    expect(
      screen.queryByText("other.js-1719200000000.html")
    ).not.toBeInTheDocument();
  });

  it("fetches reports for the selected namespace", async () => {
    render(<TestHistoryTab namespace="team-a" scriptName="smoke.js" />);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith("/k6/api/reports?namespace=team-a");
    });
  });

  it("uses a namespaced encoded iframe URL for selected reports", async () => {
    render(<TestHistoryTab namespace="team-a" scriptName="smoke.js" />);

    fireEvent.click(await screen.findByText("smoke.js-1719200000000.html"));

    expect(screen.getByTitle("smoke.js-1719200000000.html")).toHaveAttribute(
      "src",
      "/k6/api/reports/smoke.js-1719200000000.html?namespace=team-a"
    );
  });

  it("ignores stale namespace report responses after switching namespaces", async () => {
    const namespaceA = deferredReports([
      {
        name: "smoke.js-a-report.html",
        size: 40000,
        lastModified: "2024-06-24T00:00:00.000Z",
      },
    ]);
    const namespaceB = deferredReports([
      {
        name: "smoke.js-b-report.html",
        size: 40000,
        lastModified: "2024-06-25T00:00:00.000Z",
      },
    ]);
    const namespaceBRefresh = deferredReports([
      {
        name: "smoke.js-b-report-refreshed.html",
        size: 40000,
        lastModified: "2024-06-26T00:00:00.000Z",
      },
    ]);
    let teamBCalls = 0;
    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url === "/k6/api/reports?namespace=team-a") return namespaceA.response;
      if (url === "/k6/api/reports?namespace=team-b") {
        teamBCalls += 1;
        return teamBCalls === 1 ? namespaceB.response : namespaceBRefresh.response;
      }
      throw new Error(`unexpected url: ${url}`);
    });

    const { rerender } = render(
      <TestHistoryTab namespace="team-a" scriptName="smoke.js" />
    );
    rerender(<TestHistoryTab namespace="team-b" scriptName="smoke.js" />);

    namespaceB.resolve();
    expect(await screen.findByText("smoke.js-b-report.html")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Refresh reports" }));
    expect(screen.getByRole("button", { name: "Refresh reports" })).toBeDisabled();
    await act(async () => {
      namespaceA.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.getByText("smoke.js-b-report.html")).toBeInTheDocument();
    expect(screen.queryByText("smoke.js-a-report.html")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Refresh reports" })).toBeDisabled();
  });
});
