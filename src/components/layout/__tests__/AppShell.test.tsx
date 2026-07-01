/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { fireEvent, render, screen } from "@testing-library/react";
import AppShell from "@/components/layout/AppShell";

let mockOnFileDeleted: ((name: string) => void) | undefined;
let mockFileExplorerProps:
  | {
      namespace: string;
      selectedFile: string | null;
      globalRunningScript?: string | null;
      globalRunningScripts?: string[];
      onFileRenamed?: (
        oldPath: string,
        newPath: string,
        type?: "file" | "folder"
      ) => void;
    }
  | undefined;
let mockWorkspaceProviderProps:
  | {
      namespace?: string;
      selectedFile: string | null;
    }
  | undefined;
let mockEditorTabProps: { filename: string | null } | undefined;
let mockLiveDashboardTabProps:
  | {
      scriptName: string | null;
      isActiveRun: boolean;
      runEpoch: number;
      runId?: string | null;
    }
  | undefined;
let mockTestHistoryTabProps:
  | {
      namespace: string;
      scriptName: string | null;
      selectedReportName?: string | null;
      activeReportTabId?: string;
      onSelectedReportChange?: (reportName: string | null) => void;
      onActiveReportTabChange?: (tabId: string) => void;
    }
  | undefined;
let mockBuilderTabRenderCount = 0;
let mockWorkspaceState = {
  namespace: "default",
  runEpoch: 0,
  globalRunning: false,
  globalRunningNamespace: "default" as string | null,
  globalRunningScript: "running.js" as string | null,
  activeRunners: 0,
  runnerCapacity: 1,
  globalRuns: [] as Array<{
    id: string;
    namespace: string;
    script: string;
    startedAt: number;
    runnerIndex: number;
    dashboardPort: number;
  }>,
};

jest.mock("@/contexts/ScriptWorkspaceContext", () => ({
  ScriptWorkspaceProvider: ({
    children,
    namespace,
    selectedFile,
  }: {
    children: React.ReactNode;
    namespace?: string;
    selectedFile: string | null;
  }) => {
    mockWorkspaceProviderProps = { namespace, selectedFile };
    mockWorkspaceState.namespace = namespace ?? "default";
    return <>{children}</>;
  },
  useScriptWorkspace: () => ({
    ...mockWorkspaceState,
  }),
}));

jest.mock("react-resizable-panels", () => ({
  PanelGroup: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="panel-group">{children}</div>
  ),
  Panel: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  PanelResizeHandle: () => <div data-testid="resize-handle" />,
}));

jest.mock("@/components/file-explorer/FileExplorer", () => ({
  __esModule: true,
  default: ({
    namespace,
    selectedFile,
    onSelectFile,
    onFileDeleted,
    onFileRenamed,
    globalRunningScript,
    globalRunningScripts,
  }: {
    namespace: string;
    selectedFile: string | null;
    onSelectFile: (name: string) => void;
    onFileDeleted?: (name: string) => void;
    onFileRenamed?: (
      oldPath: string,
      newPath: string,
      type?: "file" | "folder"
    ) => void;
    globalRunningScript?: string | null;
    globalRunningScripts?: string[];
  }) => {
    mockOnFileDeleted = onFileDeleted;
    mockFileExplorerProps = {
      namespace,
      selectedFile,
      onFileRenamed,
      globalRunningScript,
      globalRunningScripts,
    };
    return (
      <div data-testid="file-explorer">
        <button type="button" onClick={() => onSelectFile("test.js")}>
          select-test
        </button>
        <button type="button" onClick={() => onSelectFile("src/a.ts")}>
          select-src-a
        </button>
        <button type="button" onClick={() => onSelectFile("src/nested/a.ts")}>
          select-src-nested-a
        </button>
        <button type="button" onClick={() => onFileDeleted?.("test.js")}>
          delete-test
        </button>
        <button
          type="button"
          onClick={() => onFileRenamed?.("test.js", "moved/test.js", "file")}
        >
          move-test
        </button>
        <button
          type="button"
          onClick={() => onFileRenamed?.("src/a.ts", "dest/a.ts", "file")}
        >
          complete-file-move
        </button>
        <button
          type="button"
          onClick={() => onFileRenamed?.("src", "dest/src", "folder")}
        >
          complete-folder-move
        </button>
        <button
          type="button"
          onClick={() => onFileRenamed?.("src", "source", "folder")}
        >
          complete-folder-rename
        </button>
      </div>
    );
  },
}));

jest.mock("@/components/layout/AppHeader", () => ({
  __esModule: true,
  default: ({
    namespace,
    onNamespaceChange,
    activeRunners,
    runnerCapacity,
    activeRuns,
    onActiveRunSelect,
  }: {
    namespace: string;
    onNamespaceChange: (namespace: string) => void;
    activeRunners?: number;
    runnerCapacity?: number;
    activeRuns?: typeof mockWorkspaceState.globalRuns;
    onActiveRunSelect?: (run: typeof mockWorkspaceState.globalRuns[number]) => void;
  }) => (
    <div data-testid="app-header">
      <span data-testid="header-namespace">{namespace}</span>
      <span data-testid="header-active-runners">
        {activeRunners}/{runnerCapacity}
      </span>
      <button type="button" onClick={() => onNamespaceChange("team-a")}>
        switch-team-a
      </button>
      {activeRuns?.map((run) => (
        <button
          key={run.id}
          type="button"
          onClick={() => onActiveRunSelect?.(run)}
        >
          open-run:{run.namespace}/{run.script}
        </button>
      ))}
    </div>
  ),
}));

jest.mock("@/components/tabs/EditorTab", () => ({
  __esModule: true,
  default: ({ filename }: { filename: string | null }) => {
    mockEditorTabProps = { filename };
    return <div data-testid="editor-tab">{filename ?? "none"}</div>;
  },
}));

jest.mock("@/components/builder/BuilderTab", () => ({
  __esModule: true,
  default: () => {
    mockBuilderTabRenderCount += 1;
    return <div data-testid="builder-tab">builder</div>;
  },
}));

jest.mock("@/components/tabs/LiveDashboardTab", () => ({
  __esModule: true,
  default: (props: {
    scriptName: string | null;
    isActiveRun: boolean;
    runEpoch: number;
    runId?: string | null;
  }) => {
    mockLiveDashboardTabProps = props;
    return <div data-testid="live-dashboard-tab" />;
  },
}));

jest.mock("@/components/tabs/TestHistoryTab", () => ({
  __esModule: true,
  default: (props: {
    namespace: string;
    scriptName: string | null;
    selectedReportName?: string | null;
    activeReportTabId?: string;
    onSelectedReportChange?: (reportName: string | null) => void;
    onActiveReportTabChange?: (tabId: string) => void;
  }) => {
    mockTestHistoryTabProps = props;
    return (
      <div data-testid="test-history-tab">
        <button
          type="button"
          onClick={() => props.onSelectedReportChange?.("test.js-1.html")}
        >
          select-report
        </button>
        <button
          type="button"
          onClick={() => props.onActiveReportTabChange?.("note_1")}
        >
          select-note-tab
        </button>
      </div>
    );
  },
}));

describe("AppShell", () => {
  beforeEach(() => {
    mockFileExplorerProps = undefined;
    mockOnFileDeleted = undefined;
    mockWorkspaceProviderProps = undefined;
    mockEditorTabProps = undefined;
    mockLiveDashboardTabProps = undefined;
    mockTestHistoryTabProps = undefined;
    mockBuilderTabRenderCount = 0;
    localStorage.clear();
    mockWorkspaceState = {
      namespace: "default",
      runEpoch: 0,
      globalRunning: false,
      globalRunningNamespace: "default",
      globalRunningScript: "running.js",
      activeRunners: 0,
      runnerCapacity: 1,
      globalRuns: [],
    };
    window.history.replaceState(null, "", "/k6");
  });

  it("renders file explorer and tab navigation", () => {
    render(<AppShell />);
    expect(screen.getByTestId("file-explorer")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /builder/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /editor/i })).toBeInTheDocument();
    expect(
      screen.getByRole("tab", { name: /live dashboard/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("tab", { name: /test history/i })
    ).toBeInTheDocument();
    expect(screen.getByTestId("resize-handle")).toBeInTheDocument();
  });

  it("shows the Builder tab first", () => {
    render(<AppShell />);

    const builderTab = screen.getAllByRole("tab")[0];
    expect(builderTab).toHaveTextContent(/builder/i);
    fireEvent.click(builderTab);
    expect(mockBuilderTabRenderCount).toBeGreaterThan(0);
  });

  it("defaults namespace to default and propagates it to workspace clients", () => {
    render(<AppShell />);

    expect(mockWorkspaceProviderProps?.namespace).toBe("default");
    expect(mockFileExplorerProps?.namespace).toBe("default");
    expect(screen.getByTestId("header-namespace")).toHaveTextContent("default");
    fireEvent.click(screen.getByRole("tab", { name: /test history/i }));
    expect(mockTestHistoryTabProps?.namespace).toBe("default");
  });

  it("hydrates namespace from localStorage after mount and clears selected file when it changes", async () => {
    localStorage.setItem("k6-studio-namespace", "team-b");

    render(<AppShell />);

    await screen.findByText("team-b", { selector: "[data-testid='header-namespace']" });
    expect(mockWorkspaceProviderProps?.namespace).toBe("team-b");
    expect(mockFileExplorerProps?.namespace).toBe("team-b");

    fireEvent.click(screen.getByRole("button", { name: /select-test/i }));
    expect(screen.getByTestId("editor-tab")).toHaveTextContent("test.js");

    fireEvent.click(screen.getByRole("button", { name: /switch-team-a/i }));

    expect(screen.getByTestId("editor-tab")).toHaveTextContent("none");
    expect(mockWorkspaceProviderProps?.namespace).toBe("team-a");
    expect(mockFileExplorerProps?.namespace).toBe("team-a");
    expect(localStorage.getItem("k6-studio-namespace")).toBe("team-a");
  });

  it("hydrates shareable route state from the current URL", async () => {
    window.history.replaceState(
      null,
      "",
      "/k6?namespace=team-a&view=test-history&script=api%2Fsmoke.ts&report=api%2Fsmoke.ts-1.html&reportTab=note_1"
    );

    render(<AppShell />);

    await screen.findByText("team-a", {
      selector: "[data-testid='header-namespace']",
    });
    expect(mockWorkspaceProviderProps).toEqual({
      namespace: "team-a",
      selectedFile: "api/smoke.ts",
    });
    expect(mockTestHistoryTabProps).toMatchObject({
      namespace: "team-a",
      scriptName: "api/smoke.ts",
      selectedReportName: "api/smoke.ts-1.html",
      activeReportTabId: "note_1",
    });
  });

  it("updates the URL when selecting a script and switching main tabs", () => {
    render(<AppShell />);

    fireEvent.click(screen.getByRole("button", { name: /select-src-a/i }));
    expect(window.location.search).toBe(
      "?namespace=default&view=editor&script=src%2Fa.ts"
    );

    fireEvent.click(screen.getByRole("tab", { name: /live dashboard/i }));
    expect(window.location.search).toBe(
      "?namespace=default&view=live-dashboard&script=src%2Fa.ts"
    );

    fireEvent.click(screen.getByRole("tab", { name: /test history/i }));
    expect(window.location.search).toBe(
      "?namespace=default&view=test-history&script=src%2Fa.ts"
    );
  });

  it("navigates from Builder to Editor when a script is selected", () => {
    render(<AppShell />);

    fireEvent.click(screen.getByRole("tab", { name: /builder/i }));
    expect(screen.getByRole("tab", { name: /builder/i })).toHaveAttribute(
      "aria-selected",
      "true"
    );

    fireEvent.click(screen.getByRole("button", { name: /select-test/i }));

    expect(screen.getByRole("tab", { name: /editor/i })).toHaveAttribute(
      "aria-selected",
      "true"
    );
    expect(window.location.search).toBe(
      "?namespace=default&view=editor&script=test.js"
    );
  });

  it("updates the URL when history report and report tab change", () => {
    render(<AppShell />);

    fireEvent.click(screen.getByRole("button", { name: /select-test/i }));
    fireEvent.click(screen.getByRole("tab", { name: /test history/i }));
    fireEvent.click(screen.getByRole("button", { name: /select-report/i }));

    expect(window.location.search).toBe(
      "?namespace=default&view=test-history&script=test.js&report=test.js-1.html"
    );

    fireEvent.click(screen.getByRole("button", { name: /select-note-tab/i }));
    expect(window.location.search).toBe(
      "?namespace=default&view=test-history&script=test.js&report=test.js-1.html&reportTab=note_1"
    );
  });

  it("updates namespace in the URL and clears script/report context", async () => {
    window.history.replaceState(
      null,
      "",
      "/k6?namespace=default&view=test-history&script=test.js&report=test.js-1.html&reportTab=note_1"
    );

    render(<AppShell />);

    await screen.findByText("default", {
      selector: "[data-testid='header-namespace']",
    });
    fireEvent.click(screen.getByRole("button", { name: /switch-team-a/i }));

    expect(window.location.search).toBe("?namespace=team-a&view=test-history");
    expect(mockWorkspaceProviderProps).toEqual({
      namespace: "team-a",
      selectedFile: null,
    });
  });

  it("clears selectedFile when the deleted file was selected", () => {
    render(<AppShell />);

    fireEvent.click(screen.getByRole("button", { name: /select-test/i }));
    expect(screen.getByTestId("editor-tab")).toHaveTextContent("test.js");

    fireEvent.click(screen.getByRole("button", { name: /delete-test/i }));
    expect(screen.getByTestId("editor-tab")).toHaveTextContent("none");
    expect(mockOnFileDeleted).toBeDefined();
  });

  it("passes running script and updates selectedFile when FileExplorer reports a move", () => {
    mockWorkspaceState = {
      ...mockWorkspaceState,
      activeRunners: 1,
      globalRuns: [
        {
          id: "run_1",
          namespace: "default",
          script: "running.js",
          startedAt: 1,
          runnerIndex: 0,
          dashboardPort: 5665,
        },
      ],
    };

    render(<AppShell />);

    expect(mockFileExplorerProps?.globalRunningScript).toBe("running.js");

    fireEvent.click(screen.getByRole("button", { name: /select-test/i }));
    expect(screen.getByTestId("editor-tab")).toHaveTextContent("test.js");

    fireEvent.click(screen.getByRole("button", { name: /move-test/i }));
    expect(screen.getByTestId("editor-tab")).toHaveTextContent("moved/test.js");
  });

  it("only treats a global run as active in the selected namespace", () => {
    mockWorkspaceState = {
      namespace: "default",
      runEpoch: 3,
      globalRunning: true,
      globalRunningNamespace: "team-b",
      globalRunningScript: "test.js",
      activeRunners: 1,
      runnerCapacity: 1,
      globalRuns: [
        {
          id: "run_1",
          namespace: "team-b",
          script: "test.js",
          startedAt: 1,
          runnerIndex: 0,
          dashboardPort: 5665,
        },
      ],
    };

    render(<AppShell />);
    fireEvent.click(screen.getByRole("button", { name: /select-test/i }));
    fireEvent.click(screen.getByRole("tab", { name: /live dashboard/i }));

    expect(mockFileExplorerProps?.globalRunningScript).toBeNull();
    expect(mockLiveDashboardTabProps?.isActiveRun).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: /switch-team-a/i }));
    expect(mockLiveDashboardTabProps?.scriptName).toBeNull();
  });

  it("marks the dashboard active when namespace and script both match", () => {
    mockWorkspaceState = {
      namespace: "default",
      runEpoch: 7,
      globalRunning: true,
      globalRunningNamespace: "default",
      globalRunningScript: "test.js",
      activeRunners: 1,
      runnerCapacity: 1,
      globalRuns: [
        {
          id: "run_1",
          namespace: "default",
          script: "test.js",
          startedAt: 1,
          runnerIndex: 0,
          dashboardPort: 5665,
        },
      ],
    };

    render(<AppShell />);
    fireEvent.click(screen.getByRole("button", { name: /select-test/i }));
    fireEvent.click(screen.getByRole("tab", { name: /live dashboard/i }));

    expect(mockFileExplorerProps?.globalRunningScript).toBe("test.js");
    expect(mockLiveDashboardTabProps).toEqual({
      scriptName: "test.js",
      isActiveRun: true,
      runEpoch: 7,
      runId: "run_1",
    });
    expect(screen.getByTestId("header-active-runners")).toHaveTextContent("1/1");
    expect(mockEditorTabProps?.filename).toBe("test.js");
  });

  it("navigates to a running script from the active runner list", () => {
    mockWorkspaceState = {
      namespace: "default",
      runEpoch: 9,
      globalRunning: true,
      globalRunningNamespace: "team-b",
      globalRunningScript: "api/load.ts",
      activeRunners: 1,
      runnerCapacity: 2,
      globalRuns: [
        {
          id: "run_1",
          namespace: "team-b",
          script: "api/load.ts",
          startedAt: 1,
          runnerIndex: 0,
          dashboardPort: 5665,
        },
      ],
    };

    render(<AppShell />);

    fireEvent.click(screen.getByRole("tab", { name: /test history/i }));
    fireEvent.click(
      screen.getByRole("button", { name: "open-run:team-b/api/load.ts" })
    );

    expect(mockWorkspaceProviderProps).toEqual({
      namespace: "team-b",
      selectedFile: "api/load.ts",
    });
    expect(screen.getByTestId("editor-tab")).toHaveTextContent("api/load.ts");
    expect(window.location.search).toBe(
      "?namespace=team-b&view=editor&script=api%2Fload.ts"
    );
  });

  it("maps the current selected file when a file move completes after selection changes", () => {
    render(<AppShell />);

    fireEvent.click(screen.getByRole("button", { name: /select-src-a/i }));
    expect(screen.getByTestId("editor-tab")).toHaveTextContent("src/a.ts");

    fireEvent.click(screen.getByRole("button", { name: /complete-file-move/i }));
    expect(screen.getByTestId("editor-tab")).toHaveTextContent("dest/a.ts");
  });

  it("maps the current selected descendant when a folder move completes after selection changes", () => {
    render(<AppShell />);

    fireEvent.click(screen.getByRole("button", { name: /select-src-nested-a/i }));
    expect(screen.getByTestId("editor-tab")).toHaveTextContent("src/nested/a.ts");

    fireEvent.click(screen.getByRole("button", { name: /complete-folder-move/i }));
    expect(screen.getByTestId("editor-tab")).toHaveTextContent("dest/src/nested/a.ts");
  });

  it("maps the current selected descendant when a folder rename completes after selection changes", () => {
    render(<AppShell />);

    fireEvent.click(screen.getByRole("button", { name: /select-src-a/i }));
    expect(screen.getByTestId("editor-tab")).toHaveTextContent("src/a.ts");

    fireEvent.click(screen.getByRole("button", { name: /complete-folder-rename/i }));
    expect(screen.getByTestId("editor-tab")).toHaveTextContent("source/a.ts");
  });
});
