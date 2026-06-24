import {
  getLinesToAppend,
  shouldResetTerminal,
} from "@/lib/terminal-writer";

describe("terminal-writer", () => {
  describe("getLinesToAppend", () => {
    it("returns only lines after writtenCount", () => {
      expect(getLinesToAppend(["a", "b"], 1)).toEqual(["b"]);
    });

    it("returns empty when writtenCount exceeds lines length", () => {
      expect(getLinesToAppend(["a"], 2)).toEqual([]);
    });

    it("returns all lines when writtenCount is zero", () => {
      expect(getLinesToAppend(["a", "b"], 0)).toEqual(["a", "b"]);
    });
  });

  describe("shouldResetTerminal", () => {
    it("returns true when lines cleared after prior output", () => {
      expect(
        shouldResetTerminal({ prevCount: 3, nextCount: 0, prevKey: "a.ts", nextKey: "a.ts" })
      ).toBe(true);
    });

    it("returns true when resetKey changes", () => {
      expect(
        shouldResetTerminal({ prevCount: 2, nextCount: 2, prevKey: "a.ts", nextKey: "b.ts" })
      ).toBe(true);
    });

    it("returns false when same key and lines grow", () => {
      expect(
        shouldResetTerminal({ prevCount: 1, nextCount: 2, prevKey: "a.ts", nextKey: "a.ts" })
      ).toBe(false);
    });

    it("returns false when both empty on same key", () => {
      expect(
        shouldResetTerminal({ prevCount: 0, nextCount: 0, prevKey: "a.ts", nextKey: "a.ts" })
      ).toBe(false);
    });
  });
});
