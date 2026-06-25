/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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
      expect(global.fetch).toHaveBeenCalledWith("/api/reports?namespace=team-a");
    });
  });

  it("uses a namespaced encoded iframe URL for selected reports", async () => {
    render(<TestHistoryTab namespace="team-a" scriptName="smoke.js" />);

    fireEvent.click(await screen.findByText("smoke.js-1719200000000.html"));

    expect(screen.getByTitle("smoke.js-1719200000000.html")).toHaveAttribute(
      "src",
      "/api/reports/smoke.js-1719200000000.html?namespace=team-a"
    );
  });
});
