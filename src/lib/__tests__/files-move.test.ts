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
