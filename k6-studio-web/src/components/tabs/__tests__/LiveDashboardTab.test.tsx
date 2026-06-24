/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen, waitFor } from "@testing-library/react";
import LiveDashboardTab from "@/components/tabs/LiveDashboardTab";

global.fetch = jest.fn().mockResolvedValue({ ok: true }) as jest.Mock;

describe("LiveDashboardTab", () => {
  it("renders an iframe pointing to the dashboard proxy when available", async () => {
    render(<LiveDashboardTab />);
    await waitFor(() => {
      const iframe = screen.getByTitle("k6 Live Dashboard");
      expect(iframe).toBeInTheDocument();
      expect(iframe.getAttribute("src")).toBe("/api/dashboard/");
    });
  });
});
