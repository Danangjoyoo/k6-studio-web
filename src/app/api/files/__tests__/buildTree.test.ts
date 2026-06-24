import { buildTree, KEEP_SUFFIX } from "@/lib/files-tree";

describe("buildTree", () => {
  it("returns empty array for empty input", () => {
    expect(buildTree([])).toEqual([]);
  });

  it("returns flat files with no folders", () => {
    const tree = buildTree(["a.ts", "b.ts"]);
    expect(tree).toHaveLength(2);
    expect(tree[0]).toMatchObject({ path: "a.ts", name: "a.ts", type: "file" });
    expect(tree[1]).toMatchObject({ path: "b.ts", name: "b.ts", type: "file" });
  });

  it("groups files inside a folder", () => {
    const tree = buildTree(["auth/login.ts", "auth/logout.ts"]);
    expect(tree).toHaveLength(1);
    const folder = tree[0];
    expect(folder.type).toBe("folder");
    expect(folder.name).toBe("auth");
    expect(folder.children).toHaveLength(2);
    expect(folder.children?.[0]).toMatchObject({ path: "auth/login.ts", type: "file" });
  });

  it("nests multiple levels", () => {
    const tree = buildTree(["a/b/c.ts"]);
    expect(tree[0].type).toBe("folder");
    expect(tree[0].children?.[0].type).toBe("folder");
    expect(tree[0].children?.[0].children?.[0]).toMatchObject({ path: "a/b/c.ts", type: "file" });
  });

  it("synthesises empty folder node from .keep sentinel", () => {
    const tree = buildTree([`emptydir${KEEP_SUFFIX}`, "script.ts"]);
    expect(tree).toHaveLength(2);
    const folder = tree.find((n) => n.type === "folder");
    expect(folder).toBeDefined();
    expect(folder?.name).toBe("emptydir");
    expect(folder?.children).toHaveLength(0);
    const file = tree.find((n) => n.type === "file");
    expect(file).toMatchObject({ path: "script.ts", type: "file" });
  });

  it("mixes root files and folders", () => {
    const tree = buildTree(["root.ts", "folder/nested.ts"]);
    expect(tree).toHaveLength(2);
    const types = new Set(tree.map((n) => n.type));
    expect(types).toContain("file");
    expect(types).toContain("folder");
  });
});
