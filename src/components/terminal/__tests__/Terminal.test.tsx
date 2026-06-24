/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { render } from "@testing-library/react";
import { createReadOnlyTerminalOptions } from "@/lib/terminal-options";

const mockWriteln = jest.fn();
const mockScrollToBottom = jest.fn();
const mockClear = jest.fn();
const mockOpen = jest.fn();
const mockDispose = jest.fn();
const mockLoadAddon = jest.fn();
const mockFit = jest.fn();
const mockTerminalCtor = jest.fn();

jest.mock("@xterm/addon-fit", () => ({
  FitAddon: jest.fn(() => ({
    fit: mockFit,
  })),
}));

jest.mock("@xterm/xterm", () => ({
  Terminal: jest.fn((options) => {
    mockTerminalCtor(options);
    return {
      open: mockOpen,
      writeln: mockWriteln,
      scrollToBottom: mockScrollToBottom,
      clear: mockClear,
      loadAddon: mockLoadAddon,
      dispose: mockDispose,
    };
  }),
}));

import Terminal from "@/components/terminal/Terminal";

describe("Terminal", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.ResizeObserver = jest.fn(() => ({
      observe: jest.fn(),
      disconnect: jest.fn(),
      unobserve: jest.fn(),
    }));
  });

  it("writes new lines via writeln and scrolls to bottom", () => {
    const { rerender } = render(
      <Terminal lines={["line 1"]} isRunning={false} resetKey="a.ts" />
    );

    expect(mockWriteln).toHaveBeenCalledWith("line 1");
    expect(mockScrollToBottom).toHaveBeenCalled();

    mockWriteln.mockClear();
    mockScrollToBottom.mockClear();

    rerender(
      <Terminal
        lines={["line 1", "line 2"]}
        isRunning={false}
        resetKey="a.ts"
      />
    );

    expect(mockWriteln).toHaveBeenCalledTimes(1);
    expect(mockWriteln).toHaveBeenCalledWith("line 2");
    expect(mockScrollToBottom).toHaveBeenCalled();
  });

  it("clears terminal when resetKey changes", () => {
    const { rerender } = render(
      <Terminal lines={["line 1"]} isRunning={false} resetKey="a.ts" />
    );

    mockClear.mockClear();
    mockWriteln.mockClear();

    rerender(
      <Terminal lines={["other"]} isRunning={false} resetKey="b.ts" />
    );

    expect(mockClear).toHaveBeenCalled();
    expect(mockWriteln).toHaveBeenCalledWith("other");
  });

  it("clears terminal when lines reset to empty after output", () => {
    const { rerender } = render(
      <Terminal lines={["line 1"]} isRunning={true} resetKey="a.ts" />
    );

    mockClear.mockClear();

    rerender(<Terminal lines={[]} isRunning={true} resetKey="a.ts" />);

    expect(mockClear).toHaveBeenCalled();
  });

  it("creates read-only xterm with disableStdin", () => {
    render(<Terminal lines={[]} isRunning={false} resetKey="a.ts" />);

    expect(mockTerminalCtor).toHaveBeenCalledWith(
      createReadOnlyTerminalOptions()
    );
    expect(mockTerminalCtor.mock.calls[0][0].disableStdin).toBe(true);
  });

  it("never calls scrollIntoView when lines update", () => {
    const scrollIntoView = jest.fn();
    HTMLElement.prototype.scrollIntoView = scrollIntoView;

    const { rerender } = render(
      <Terminal lines={["line 1"]} isRunning={false} resetKey="a.ts" />
    );
    rerender(
      <Terminal
        lines={["line 1", "line 2"]}
        isRunning={false}
        resetKey="a.ts"
      />
    );

    expect(scrollIntoView).not.toHaveBeenCalled();
  });
});
