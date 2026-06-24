import { resolveScriptFilename } from "@/components/file-explorer/NewFileDialog";

describe("resolveScriptFilename", () => {
  it("appends .ts when no extension given", () => {
    expect(resolveScriptFilename("smoke")).toBe("smoke.ts");
  });

  it("keeps .ts extension when provided", () => {
    expect(resolveScriptFilename("smoke.ts")).toBe("smoke.ts");
  });

  it("keeps .js extension for backward compatibility", () => {
    expect(resolveScriptFilename("legacy.js")).toBe("legacy.js");
  });
});
