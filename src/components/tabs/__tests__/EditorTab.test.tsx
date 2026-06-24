/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import EditorTab from "@/components/tabs/EditorTab";

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
  useScriptWorkspace: () => ({
    getSession: () => ({
      lines: [],
      isRunning: false,
      lastExitCode: null,
      lastReportName: null,
    }),
    runScript: jest.fn(),
    runningScript: null,
  }),
}));

describe("EditorTab", () => {
  it("renders placeholder when no file is selected", () => {
    render(<EditorTab filename={null} />);
    expect(screen.getByText(/select a file/i)).toBeInTheDocument();
  });

  it("renders editor and terminal when a file is selected", () => {
    render(<EditorTab filename="script.js" />);
    expect(screen.getByTestId("editor")).toBeInTheDocument();
    expect(screen.getByTestId("terminal")).toBeInTheDocument();
  });

  it("renders resize handle between editor and terminal", () => {
    render(<EditorTab filename="script.js" />);
    expect(screen.getByTestId("resize-handle")).toBeInTheDocument();
  });
});
