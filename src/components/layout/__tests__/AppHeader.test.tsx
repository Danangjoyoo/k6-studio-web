/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { fireEvent, render, screen } from "@testing-library/react";
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
        runnerCapacity={1}
        activeRuns={[]}
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
        runnerCapacity={2}
        activeRuns={[
          {
            id: "run_1",
            namespace: "team-a",
            script: "load.ts",
            startedAt: 1,
            runnerIndex: 0,
            dashboardPort: 5665,
          },
        ]}
      />
    );

    expect(
      screen.getByTestId("active-runner-status").textContent?.trim()
    ).toBe(
      "Active runner: 1/2"
    );
  });

  it("opens a list of active running scripts from the runner label", () => {
    render(
      <AppHeader
        namespace="team-a"
        onNamespaceChange={jest.fn()}
        activeRunners={2}
        runnerCapacity={3}
        activeRuns={[
          {
            id: "run_1",
            namespace: "team-a",
            script: "folder/deeply/nested/load-test-script.ts",
            startedAt: 1,
            runnerIndex: 0,
            dashboardPort: 5665,
          },
          {
            id: "run_2",
            namespace: "default",
            script: "smoke.ts",
            startedAt: 2,
            runnerIndex: 1,
            dashboardPort: 5666,
          },
        ]}
      />
    );

    expect(
      screen.queryByText("team-a/folder/deeply/nested/load-test-script.ts")
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Active runner: 2/3" }));

    expect(
      screen.getByText("team-a/folder/deeply/nested/load-test-script.ts")
    ).toBeInTheDocument();
    expect(screen.getByText("default/smoke.ts")).toBeInTheDocument();
  });

  it("places the namespace selector beside the app identity before runner status", () => {
    render(
      <AppHeader
        namespace="team-a"
        onNamespaceChange={jest.fn()}
        activeRunners={0}
        runnerCapacity={1}
        activeRuns={[]}
      />
    );

    const header = screen.getByRole("banner");
    const namespaceControl = screen.getByRole("button", {
      name: "namespace:team-a",
    });
    const runnerStatus = screen.getByTestId("active-runner-status");
    const nodes = Array.from(header.querySelectorAll("*"));

    expect(nodes.indexOf(namespaceControl)).toBeGreaterThan(-1);
    expect(nodes.indexOf(runnerStatus)).toBeGreaterThan(-1);
    expect(nodes.indexOf(namespaceControl)).toBeLessThan(
      nodes.indexOf(runnerStatus)
    );
    expect(
      namespaceControl.closest("[data-testid='app-header-left']")
    ).not.toBeNull();
  });
});
