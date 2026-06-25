/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import AppHeader from "@/components/layout/AppHeader";

jest.mock("@/components/layout/NamespaceSelector", () => ({
  __esModule: true,
  default: ({
    namespace,
    onNamespaceChange,
  }: {
    namespace: string;
    onNamespaceChange: (namespace: string) => void;
  }) => (
    <button type="button" onClick={() => onNamespaceChange("team-b")}>
      namespace:{namespace}
    </button>
  ),
}));

describe("AppHeader", () => {
  it("exposes a stable active runner status target when idle", () => {
    render(
      <AppHeader
        namespace="default"
        onNamespaceChange={jest.fn()}
        activeRunners={0}
        runningScript={null}
      />
    );

    expect(
      screen.getByTestId("active-runner-status").textContent?.trim()
    ).toBe(
      "Active runner: 0/1"
    );
    expect(screen.getByRole("button", { name: "namespace:default" })).toBeInTheDocument();
  });

  it("exposes a stable active runner status target when running", () => {
    render(
      <AppHeader
        namespace="team-a"
        onNamespaceChange={jest.fn()}
        activeRunners={1}
        runningScript="load.ts"
      />
    );

    expect(
      screen.getByTestId("active-runner-status").textContent?.trim()
    ).toBe(
      "Active runner: 1/1"
    );
    expect(screen.getByText("load.ts")).toBeInTheDocument();
  });

  it("uses a wide responsive badge for the running script path", () => {
    const runningScript = "team-a/folder/deeply/nested/load-test-script.ts";
    render(
      <AppHeader
        namespace="team-a"
        onNamespaceChange={jest.fn()}
        activeRunners={1}
        runningScript={runningScript}
      />
    );

    const scriptBadge = screen.getByText(runningScript);
    expect(scriptBadge).toHaveAttribute("title", runningScript);
    expect(scriptBadge.className).toContain("max-w-[min(52vw,720px)]");
  });
});
