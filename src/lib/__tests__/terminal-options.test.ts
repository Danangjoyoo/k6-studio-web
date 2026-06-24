import { createReadOnlyTerminalOptions } from "@/lib/terminal-options";

describe("terminal-options", () => {
  it("creates read-only terminal options", () => {
    const options = createReadOnlyTerminalOptions();
    expect(options.disableStdin).toBe(true);
    expect(options.cursorBlink).toBe(false);
    expect(options.convertEol).toBe(true);
    expect(options.cursorInactiveStyle).toBe("none");
  });

  it("uses Load Lab terminal theme colors", () => {
    const options = createReadOnlyTerminalOptions();
    expect(options.theme?.background).toBe("#0a0e14");
    expect(options.theme?.foreground).toBe("#a8b0c4");
  });
});
