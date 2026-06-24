/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import EditorTab from "@/components/tabs/EditorTab";

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

jest.mock("@/hooks/useK6Runner", () => ({
  useK6Runner: () => ({
    state: {
      lines: [],
      isRunning: false,
      lastExitCode: null,
      lastReportName: null,
    },
    run: jest.fn(),
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
});
