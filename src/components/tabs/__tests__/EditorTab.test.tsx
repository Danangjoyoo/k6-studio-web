/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { fireEvent, render, screen } from "@testing-library/react";
import EditorTab from "@/components/tabs/EditorTab";
import ScriptEditor from "@/components/editor/ScriptEditor";

const mockWorkspace = {
  namespace: "team-a",
  selectedFile: null as string | null,
  setSelectedFile: jest.fn(),
  draft: null as { content: string; suggestedName: string } | null,
  builderAppliedContent: null as {
    content: string;
    filename: string;
    revision: number;
    suggestedName: string;
  } | null,
  clearBuilderAppliedContent: jest.fn(),
  clearDraft: jest.fn(),
  applyBuilderToEditor: jest.fn(),
  getSession: () => ({
    lines: [],
    isRunning: false,
    lastExitCode: null,
    lastReportName: null,
  }),
  runScript: jest.fn(),
  cancelRun: jest.fn(),
  runningScript: null,
  globalRunning: false,
  globalRunningNamespace: null as string | null,
  globalRunningScript: null as string | null,
  globalRuns: [] as Array<{
    id: string;
    namespace: string;
    script: string;
    startedAt: number;
    runnerIndex: number;
    dashboardPort: number;
  }>,
  activeRunners: 0,
  runnerCapacity: 1,
};

jest.mock("react-resizable-panels", () => ({
  PanelGroup: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="panel-group">{children}</div>
  ),
  Panel: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  PanelResizeHandle: () => <div data-testid="resize-handle" />,
}));

jest.mock("next/dynamic", () => ({
  __esModule: true,
  // Return a simple component directly; Terminal is also mocked below
  default: () =>
    function DynamicTerminal({ lines }: { lines: string[] }) {
      return <div data-testid="terminal">{lines.join(",")}</div>;
    },
}));

jest.mock("@/components/editor/ScriptEditor", () => ({
  __esModule: true,
  default: jest.fn(() => <div data-testid="editor" />),
}));

jest.mock("@/components/terminal/Terminal", () => ({
  __esModule: true,
  default: jest.fn(({ lines }: { lines: string[] }) => (
    <div data-testid="terminal">{lines.join(",")}</div>
  )),
}));

jest.mock("@/contexts/ScriptWorkspaceContext", () => ({
  useScriptWorkspace: () => mockWorkspace,
}));

describe("EditorTab", () => {
  beforeEach(() => {
    (ScriptEditor as unknown as jest.Mock).mockClear();
    mockWorkspace.namespace = "team-a";
    mockWorkspace.selectedFile = null;
    mockWorkspace.draft = null;
    mockWorkspace.globalRunning = false;
    mockWorkspace.globalRunningNamespace = null;
    mockWorkspace.globalRunningScript = null;
    mockWorkspace.globalRuns = [];
    mockWorkspace.builderAppliedContent = null;
    mockWorkspace.activeRunners = 0;
    mockWorkspace.runnerCapacity = 1;
    mockWorkspace.runScript.mockReset();
    mockWorkspace.cancelRun.mockReset();
    mockWorkspace.setSelectedFile.mockReset();
    mockWorkspace.clearDraft.mockReset();
    mockWorkspace.clearBuilderAppliedContent.mockReset();
    mockWorkspace.applyBuilderToEditor.mockReset();
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ name: "built.ts" }),
    }) as unknown as typeof fetch;
  });

  it("renders placeholder when no file is selected", () => {
    render(<EditorTab filename={null} />);
    expect(screen.getByText(/select a file/i)).toBeInTheDocument();
  });

  it("renders a draft as an unsaved buffer when no file is selected", () => {
    mockWorkspace.draft = {
      content: "// Built by Script Builder",
      suggestedName: "built.ts",
    };

    render(<EditorTab filename={null} />);

    expect(screen.getByText(/untitled/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /run test/i })).toBeDisabled();
    expect(ScriptEditor).toHaveBeenCalledWith(
      expect.objectContaining({
        filename: undefined,
        initialContent: "// Built by Script Builder",
      }),
      undefined
    );
  });

  it("saves a draft through the existing files API and selects it", async () => {
    mockWorkspace.draft = {
      content: "// Built by Script Builder",
      suggestedName: "built",
    };
    const editorMock = ScriptEditor as unknown as jest.Mock;
    editorMock.mockImplementationOnce((_props, ref) => {
      if (ref && typeof ref === "object") {
        ref.current = {
          save: jest.fn(),
          getContent: () => "// generated",
        };
      }
      return <div data-testid="editor" />;
    });

    render(<EditorTab filename={null} />);

    fireEvent.click(screen.getByRole("button", { name: /save script/i }));
    fireEvent.click(screen.getByRole("button", { name: /^save script$/i }));

    await screen.findByTestId("editor");
    expect(global.fetch).toHaveBeenCalledWith(
      "/k6/api/files",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          namespace: "team-a",
          name: "built.ts",
          content: "// Built by Script Builder",
        }),
      })
    );
    expect(mockWorkspace.clearDraft).toHaveBeenCalled();
    expect(mockWorkspace.setSelectedFile).toHaveBeenCalledWith("built.ts");
  });

  it("renders editor and terminal when a file is selected", () => {
    render(<EditorTab filename="script.js" />);
    expect(screen.getByTestId("editor")).toBeInTheDocument();
    expect(screen.getByTestId("terminal")).toBeInTheDocument();
    expect(ScriptEditor).toHaveBeenCalledWith(
      expect.objectContaining({
        namespace: "team-a",
        filename: "script.js",
      }),
      undefined
    );
  });

  it("passes matching builder-applied content to the selected file editor", () => {
    mockWorkspace.builderAppliedContent = {
      content: "// generated",
      filename: "script.js",
      revision: 3,
      suggestedName: "built-by-builder.ts",
    };

    render(<EditorTab filename="script.js" />);

    expect(ScriptEditor).toHaveBeenCalledWith(
      expect.objectContaining({
        filename: "script.js",
        appliedContent: mockWorkspace.builderAppliedContent,
        onAppliedContentConsumed: mockWorkspace.clearBuilderAppliedContent,
      }),
      undefined
    );
  });

  it("renders resize handle between editor and terminal", () => {
    render(<EditorTab filename="script.js" />);
    expect(screen.getByTestId("resize-handle")).toBeInTheDocument();
  });

  it("blocks running the selected script when it is already active", () => {
    mockWorkspace.globalRunning = true;
    mockWorkspace.activeRunners = 1;
    mockWorkspace.runnerCapacity = 2;
    mockWorkspace.globalRuns = [
      {
        id: "run_1",
        namespace: "team-a",
        script: "script.js",
        startedAt: 1,
        runnerIndex: 0,
        dashboardPort: 5665,
      },
    ];

    render(<EditorTab filename="script.js" />);

    expect(screen.getByRole("button", { name: /running/i })).toBeDisabled();
  });

  it("allows running another script when capacity remains", () => {
    mockWorkspace.globalRunning = true;
    mockWorkspace.activeRunners = 1;
    mockWorkspace.runnerCapacity = 2;
    mockWorkspace.globalRuns = [
      {
        id: "run_1",
        namespace: "team-b",
        script: "script.js",
        startedAt: 1,
        runnerIndex: 0,
        dashboardPort: 5665,
      },
    ];

    render(<EditorTab filename="script.js" />);

    expect(screen.getByRole("button", { name: /run test/i })).toBeEnabled();
  });

  it("blocks running another script when runner capacity is full", () => {
    mockWorkspace.globalRunning = true;
    mockWorkspace.activeRunners = 2;
    mockWorkspace.runnerCapacity = 2;
    mockWorkspace.globalRuns = [
      {
        id: "run_1",
        namespace: "team-b",
        script: "script.js",
        startedAt: 1,
        runnerIndex: 0,
        dashboardPort: 5665,
      },
      {
        id: "run_2",
        namespace: "team-a",
        script: "other.js",
        startedAt: 2,
        runnerIndex: 1,
        dashboardPort: 5666,
      },
    ];

    render(<EditorTab filename="script.js" />);

    expect(screen.getByRole("button", { name: /run test/i })).toBeDisabled();
  });

  it("disables cancelling when the selected script is idle", () => {
    render(<EditorTab filename="script.js" />);

    expect(screen.getByRole("button", { name: /cancel run/i })).toBeDisabled();
  });

  it("enables cancelling when the selected script is active", () => {
    mockWorkspace.activeRunners = 1;
    mockWorkspace.globalRuns = [
      {
        id: "run_1",
        namespace: "team-a",
        script: "script.js",
        startedAt: 1,
        runnerIndex: 0,
        dashboardPort: 5665,
      },
    ];

    render(<EditorTab filename="script.js" />);

    expect(screen.getByRole("button", { name: /cancel run/i })).toBeEnabled();
  });

  it("confirms before cancelling the active selected script", () => {
    mockWorkspace.activeRunners = 1;
    mockWorkspace.globalRuns = [
      {
        id: "run_1",
        namespace: "team-a",
        script: "script.js",
        startedAt: 1,
        runnerIndex: 0,
        dashboardPort: 5665,
      },
    ];

    render(<EditorTab filename="script.js" />);

    fireEvent.click(screen.getByRole("button", { name: /cancel run/i }));
    expect(
      screen.getByRole("heading", { name: "Cancel running test?" })
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Confirm cancel" }));

    expect(mockWorkspace.cancelRun).toHaveBeenCalledWith("run_1");
  });
});
