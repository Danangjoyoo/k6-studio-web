/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { fireEvent, render, screen } from "@testing-library/react";
import EditorTab from "@/components/tabs/EditorTab";
import ScriptEditor from "@/components/editor/ScriptEditor";

const mockWorkspace = {
  namespace: "team-a",
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
    mockWorkspace.namespace = "team-a";
    mockWorkspace.globalRunning = false;
    mockWorkspace.globalRunningNamespace = null;
    mockWorkspace.globalRunningScript = null;
    mockWorkspace.globalRuns = [];
    mockWorkspace.activeRunners = 0;
    mockWorkspace.runnerCapacity = 1;
    mockWorkspace.runScript.mockReset();
    mockWorkspace.cancelRun.mockReset();
  });

  it("renders placeholder when no file is selected", () => {
    render(<EditorTab filename={null} />);
    expect(screen.getByText(/select a file/i)).toBeInTheDocument();
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
