import {
  normalizeReportNotes,
  parseReportNotesPayload,
  reportNoteAssetObjectName,
  reportNoteAssetUrl,
  reportNotesSidecarName,
  validateReportNoteAssetId,
} from "@/lib/report-notes";

describe("report notes", () => {
  it("normalizes note payloads", () => {
    expect(
      normalizeReportNotes([
        { id: " n1 ", title: " Findings ", markdown: "## ok" },
        { id: "", title: "", markdown: 10 },
      ])
    ).toEqual([
      { id: "n1", title: "Findings", markdown: "## ok" },
      {
        id: expect.stringMatching(/^note_/),
        title: "Untitled note",
        markdown: "",
      },
    ]);
  });

  it("parses missing or legacy url-tab payloads as no notes", () => {
    expect(
      parseReportNotesPayload({
        tabs: [{ id: "tab_1", url: "https://x.test", title: "x" }],
      })
    ).toEqual([]);
    expect(parseReportNotesPayload(null)).toEqual([]);
  });

  it("uses the existing tabs sidecar suffix for move compatibility", () => {
    expect(reportNotesSidecarName("api/smoke.ts-1.html")).toBe(
      "api/smoke.ts-1.html.tabs.json"
    );
  });

  it("builds safe app-served asset URLs", () => {
    expect(validateReportNoteAssetId("asset_abc123.png")).toBe(
      "asset_abc123.png"
    );
    expect(() => validateReportNoteAssetId("../x.png")).toThrow(
      "Invalid note asset id"
    );
    expect(reportNoteAssetObjectName("asset_abc123.png")).toBe(
      ".report-note-assets/asset_abc123.png"
    );
    expect(
      reportNoteAssetUrl(
        "api/smoke.ts-1.html",
        "asset_abc123.png",
        "team-a"
      )
    ).toBe(
      "/api/reports/api%2Fsmoke.ts-1.html/note-assets/asset_abc123.png?namespace=team-a"
    );
  });
});
