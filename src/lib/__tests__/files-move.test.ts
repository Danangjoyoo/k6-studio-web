import { buildMovePlan, buildRenamePlan } from "@/lib/files-move";

describe("report tab sidecar moves", () => {
  it("moves report tab sidecars with a moved file report", () => {
    const plan = buildMovePlan({
      items: [{ path: "src/a.ts", type: "file" }],
      targetFolder: "dest",
      existingScriptObjectKeys: ["src/a.ts"],
      existingReportObjectKeys: [
        "src/a.ts-111.html",
        "src/a.ts-111.html.tabs.json",
      ],
    });

    expect(plan.reportObjectMoves).toEqual([
      { from: "src/a.ts-111.html", to: "dest/a.ts-111.html" },
      {
        from: "src/a.ts-111.html.tabs.json",
        to: "dest/a.ts-111.html.tabs.json",
      },
    ]);
  });

  it("moves report tab sidecars with a folder rename", () => {
    const plan = buildRenamePlan({
      from: "src",
      to: "renamed",
      type: "folder",
      existingScriptObjectKeys: ["src/a.ts"],
      existingReportObjectKeys: [
        "src/a.ts-111.html",
        "src/a.ts-111.html.tabs.json",
      ],
    });

    expect(plan.reportObjectMoves).toEqual([
      { from: "src/a.ts-111.html", to: "renamed/a.ts-111.html" },
      {
        from: "src/a.ts-111.html.tabs.json",
        to: "renamed/a.ts-111.html.tabs.json",
      },
    ]);
  });
});

describe("multiple active runner protections", () => {
  it("blocks moving any file that is currently running", () => {
    expect(() =>
      buildMovePlan({
        items: [{ path: "src/b.ts", type: "file" }],
        targetFolder: "dest",
        existingScriptObjectKeys: ["src/a.ts", "src/b.ts"],
        existingReportObjectKeys: [],
        activeRunningScripts: ["src/a.ts", "src/b.ts"],
      })
    ).toThrow("Cannot move a script while it is running");
  });

  it("blocks moving a folder containing any currently running script", () => {
    expect(() =>
      buildRenamePlan({
        from: "src",
        to: "renamed",
        type: "folder",
        existingScriptObjectKeys: ["src/a.ts", "src/nested/b.ts"],
        existingReportObjectKeys: [],
        activeRunningScripts: ["src/nested/b.ts"],
      })
    ).toThrow("Cannot move a folder containing the running script");
  });
});
