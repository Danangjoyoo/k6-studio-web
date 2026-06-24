/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import AppHeader from "@/components/layout/AppHeader";

describe("AppHeader", () => {
  it("exposes a stable active runner status target when idle", () => {
    render(<AppHeader activeRunners={0} runningScript={null} />);

    expect(
      screen.getByTestId("active-runner-status").textContent?.trim()
    ).toBe(
      "Active runner: 0/1"
    );
  });

  it("exposes a stable active runner status target when running", () => {
    render(<AppHeader activeRunners={1} runningScript="load.ts" />);

    expect(
      screen.getByTestId("active-runner-status").textContent?.trim()
    ).toBe(
      "Active runner: 1/1"
    );
    expect(screen.getByText("load.ts")).toBeInTheDocument();
  });
});
