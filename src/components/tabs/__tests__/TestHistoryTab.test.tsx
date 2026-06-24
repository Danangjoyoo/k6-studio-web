/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen, waitFor } from "@testing-library/react";
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
  it("shows select-script empty state when no script selected", () => {
    render(<TestHistoryTab scriptName={null} />);
    expect(screen.getByText(/select a script/i)).toBeInTheDocument();
  });

  it("filters reports by selected script", async () => {
    render(<TestHistoryTab scriptName="smoke.js" />);
    await waitFor(() => {
      expect(
        screen.getByText("smoke.js-1719200000000.html")
      ).toBeInTheDocument();
    });
    expect(
      screen.queryByText("other.js-1719200000000.html")
    ).not.toBeInTheDocument();
  });
});
