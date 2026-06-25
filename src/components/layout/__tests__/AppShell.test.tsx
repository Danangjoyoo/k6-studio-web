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
  | { scriptName: string | null; isActiveRun: boolean; runEpoch: number }
  | undefined;
let mockTestHistoryTabProps:
  | { namespace: string; scriptName: string | null }
  | undefined;
let mockWorkspaceState = {
  namespace: "default",
  runEpoch: 0,
  globalRunning: false,
  globalRunningNamespace: "default" as string | null,
  globalRunningScript: "running.js" as string | null,
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
  }) => {
    mockOnFileDeleted = onFileDeleted;
    mockFileExplorerProps = {
      namespace,
      selectedFile,
      onFileRenamed,
      globalRunningScript,
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
    runningScript,
  }: {
    namespace: string;
    onNamespaceChange: (namespace: string) => void;
    runningScript?: string | null;
  }) => (
    <div data-testid="app-header">
      <span data-testid="header-namespace">{namespace}</span>
      <span data-testid="header-running-script">{runningScript ?? "none"}</span>
      <button type="button" onClick={() => onNamespaceChange("team-a")}>
        switch-team-a
      </button>
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

jest.mock("@/components/tabs/LiveDashboardTab", () => ({
  __esModule: true,
  default: (props: {
    scriptName: string | null;
    isActiveRun: boolean;
    runEpoch: number;
  }) => {
    mockLiveDashboardTabProps = props;
    return <div data-testid="live-dashboard-tab" />;
  },
}));

jest.mock("@/components/tabs/TestHistoryTab", () => ({
  __esModule: true,
  default: (props: { namespace: string; scriptName: string | null }) => {
    mockTestHistoryTabProps = props;
    return <div data-testid="test-history-tab" />;
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
    localStorage.clear();
    mockWorkspaceState = {
      namespace: "default",
      runEpoch: 0,
      globalRunning: false,
      globalRunningNamespace: "default",
      globalRunningScript: "running.js",
    };
  });

  it("renders file explorer and tab navigation", () => {
    render(<AppShell />);
    expect(screen.getByTestId("file-explorer")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /editor/i })).toBeInTheDocument();
    expect(
      screen.getByRole("tab", { name: /live dashboard/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("tab", { name: /test history/i })
    ).toBeInTheDocument();
    expect(screen.getByTestId("resize-handle")).toBeInTheDocument();
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

  it("clears selectedFile when the deleted file was selected", () => {
    render(<AppShell />);

    fireEvent.click(screen.getByRole("button", { name: /select-test/i }));
    expect(screen.getByTestId("editor-tab")).toHaveTextContent("test.js");

    fireEvent.click(screen.getByRole("button", { name: /delete-test/i }));
    expect(screen.getByTestId("editor-tab")).toHaveTextContent("none");
    expect(mockOnFileDeleted).toBeDefined();
  });

  it("passes running script and updates selectedFile when FileExplorer reports a move", () => {
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
    };

    render(<AppShell />);
    fireEvent.click(screen.getByRole("button", { name: /select-test/i }));
    fireEvent.click(screen.getByRole("tab", { name: /live dashboard/i }));

    expect(mockFileExplorerProps?.globalRunningScript).toBe("test.js");
    expect(mockLiveDashboardTabProps).toEqual({
      scriptName: "test.js",
      isActiveRun: true,
      runEpoch: 7,
    });
    expect(screen.getByTestId("header-running-script")).toHaveTextContent(
      "default/test.js"
    );
    expect(mockEditorTabProps?.filename).toBe("test.js");
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
