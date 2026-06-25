import {
  DEFAULT_NAMESPACE,
  NAMESPACE_KEEP_OBJECT,
  getNamespaceFromRequest,
  normalizeNamespace,
  stripNamespacePrefix,
  toNamespacedKey,
} from "@/lib/namespaces";

describe("namespace helpers", () => {
  it("normalizes missing namespace to default", () => {
    expect(normalizeNamespace(undefined)).toBe(DEFAULT_NAMESPACE);
    expect(normalizeNamespace("")).toBe(DEFAULT_NAMESPACE);
    expect(normalizeNamespace("  team-a  ")).toBe("team-a");
  });

  it("rejects invalid namespace path segments", () => {
    expect(() => normalizeNamespace("team/a")).toThrow("Invalid namespace");
    expect(() => normalizeNamespace("../team")).toThrow("Invalid namespace");
    expect(() => normalizeNamespace("team a")).toThrow("Invalid namespace");
  });

  it("prefixes and strips storage keys", () => {
    expect(toNamespacedKey("team-a", "folder/script.ts")).toBe(
      "team-a/folder/script.ts"
    );
    expect(stripNamespacePrefix("team-a", "team-a/folder/script.ts")).toBe(
      "folder/script.ts"
    );
    expect(stripNamespacePrefix("team-a", "team-b/folder/script.ts")).toBeNull();
  });

  it("reads namespace from URL query strings", () => {
    const req = new Request("http://localhost/api/files?namespace=team-a");
    expect(getNamespaceFromRequest(req)).toBe("team-a");
  });

  it("uses a namespace marker object", () => {
    expect(NAMESPACE_KEEP_OBJECT("team-a")).toBe("team-a/.keep");
  });
});
