import type { ITerminalOptions } from "@xterm/xterm";

export const TERMINAL_BG = "#0a0e14";
export const TERMINAL_FG = "#a8b0c4";

export function createReadOnlyTerminalOptions(): ITerminalOptions {
  return {
    disableStdin: true,
    convertEol: true,
    cursorBlink: false,
    cursorInactiveStyle: "none",
    fontFamily: "var(--font-mono), monospace",
    fontSize: 12,
    theme: {
      background: TERMINAL_BG,
      foreground: TERMINAL_FG,
    },
  };
}
