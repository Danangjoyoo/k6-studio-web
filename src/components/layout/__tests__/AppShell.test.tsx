/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { fireEvent, render, screen } from "@testing-library/react";
import AppShell from "@/components/layout/AppShell";

let mockOnFileDeleted: ((name: string) => void) | undefined;
let mockFileExplorerProps:
  | {
      selectedFile: string | null;
      globalRunningScript?: string | null;
      onFileRenamed?: (oldPath: string, newPath: string) => void;
    }
  | undefined;
let mockWorkspaceState = {
  runEpoch: 0,
  globalRunning: false,
  globalRunningScript: "running.js" as string | null,
};

jest.mock("@/contexts/ScriptWorkspaceContext", () => ({
  ScriptWorkspaceProvider: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
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
    selectedFile,
    onSelectFile,
    onFileDeleted,
    onFileRenamed,
    globalRunningScript,
  }: {
    selectedFile: string | null;
    onSelectFile: (name: string) => void;
    onFileDeleted?: (name: string) => void;
    onFileRenamed?: (oldPath: string, newPath: string) => void;
    globalRunningScript?: string | null;
  }) => {
    mockOnFileDeleted = onFileDeleted;
    mockFileExplorerProps = {
      selectedFile,
      onFileRenamed,
      globalRunningScript,
    };
    return (
      <div data-testid="file-explorer">
        <button type="button" onClick={() => onSelectFile("test.js")}>
          select-test
        </button>
        <button type="button" onClick={() => onFileDeleted?.("test.js")}>
          delete-test
        </button>
        <button
          type="button"
          onClick={() => onFileRenamed?.("test.js", "moved/test.js")}
        >
          move-test
        </button>
      </div>
    );
  },
}));

jest.mock("@/components/tabs/EditorTab", () => ({
  __esModule: true,
  default: ({ filename }: { filename: string | null }) => (
    <div data-testid="editor-tab">{filename ?? "none"}</div>
  ),
}));

jest.mock("@/components/tabs/LiveDashboardTab", () => ({
  __esModule: true,
  default: () => <div data-testid="live-dashboard-tab" />,
}));

jest.mock("@/components/tabs/TestHistoryTab", () => ({
  __esModule: true,
  default: () => <div data-testid="test-history-tab" />,
}));

describe("AppShell", () => {
  beforeEach(() => {
    mockFileExplorerProps = undefined;
    mockOnFileDeleted = undefined;
    mockWorkspaceState = {
      runEpoch: 0,
      globalRunning: false,
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
});
