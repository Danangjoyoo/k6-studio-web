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
    ],
  }),
}) as jest.Mock;

describe("TestHistoryTab", () => {
  it("renders report list from API", async () => {
    render(<TestHistoryTab />);
    await waitFor(() => {
      expect(
        screen.getByText("smoke.js-1719200000000.html")
      ).toBeInTheDocument();
    });
  });
});
