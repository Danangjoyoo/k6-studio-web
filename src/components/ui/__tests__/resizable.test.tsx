/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";

jest.mock("react-resizable-panels", () => ({
  PanelGroup: ({
    children,
    className,
  }: {
    children: React.ReactNode;
    className?: string;
  }) => (
    <div data-testid="panel-group" className={className}>
      {children}
    </div>
  ),
  Panel: ({
    children,
    className,
  }: {
    children: React.ReactNode;
    className?: string;
  }) => <div className={className}>{children}</div>,
  PanelResizeHandle: ({
    children,
    className,
    "data-testid": testId,
  }: {
    children?: React.ReactNode;
    className?: string;
    "data-testid"?: string;
  }) => (
    <div data-testid={testId ?? "resize-handle"} className={className}>
      {children}
    </div>
  ),
}));

describe("ResizableHandle", () => {
  it("renders with data-testid='resize-handle'", () => {
    render(
      <ResizablePanelGroup direction="horizontal">
        <ResizablePanel>Left</ResizablePanel>
        <ResizableHandle />
        <ResizablePanel>Right</ResizablePanel>
      </ResizablePanelGroup>
    );
    expect(screen.getByTestId("resize-handle")).toBeInTheDocument();
  });

  it("applies col-resize cursor class for horizontal direction", () => {
    render(
      <ResizablePanelGroup direction="horizontal">
        <ResizablePanel>Left</ResizablePanel>
        <ResizableHandle direction="horizontal" />
        <ResizablePanel>Right</ResizablePanel>
      </ResizablePanelGroup>
    );
    const handle = screen.getByTestId("resize-handle");
    expect(handle.className).toContain("cursor-col-resize");
  });

  it("applies row-resize cursor class for vertical direction", () => {
    render(
      <ResizablePanelGroup direction="vertical">
        <ResizablePanel>Top</ResizablePanel>
        <ResizableHandle direction="vertical" />
        <ResizablePanel>Bottom</ResizablePanel>
      </ResizablePanelGroup>
    );
    const handle = screen.getByTestId("resize-handle");
    expect(handle.className).toContain("cursor-row-resize");
  });

  it("renders grip icon when withHandle is true", () => {
    const { container } = render(
      <ResizablePanelGroup direction="horizontal">
        <ResizablePanel>Left</ResizablePanel>
        <ResizableHandle withHandle direction="horizontal" />
        <ResizablePanel>Right</ResizablePanel>
      </ResizablePanelGroup>
    );
    // The grip icon container div should be present inside the handle
    const handle = screen.getByTestId("resize-handle");
    expect(handle.firstChild).not.toBeNull();
    // The svg icon from lucide should be in the DOM
    const svg = container.querySelector("svg");
    expect(svg).toBeInTheDocument();
  });
});
