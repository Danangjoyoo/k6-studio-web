import {
  SUMMARY_REPORT_TAB_ID,
  buildNavigationSearch,
  parseNavigationState,
} from "@/lib/navigation-state";

describe("navigation-state", () => {
  it("parses namespace, view, script, report, and report tab", () => {
    expect(
      parseNavigationState(
        "?namespace=team-a&view=test-history&script=api%2Fsmoke.ts&report=api%2Fsmoke.ts-1.html&reportTab=note_1"
      )
    ).toEqual({
      namespace: "team-a",
      view: "test-history",
      script: "api/smoke.ts",
      report: "api/smoke.ts-1.html",
      reportTab: "note_1",
    });
  });

  it("defaults invalid view and report tab values", () => {
    expect(
      parseNavigationState("?namespace=bad/name&view=wrong&reportTab=")
    ).toEqual({
      namespace: null,
      view: "editor",
      script: null,
      report: null,
      reportTab: SUMMARY_REPORT_TAB_ID,
    });
  });

  it("builds a search string for namespace-only navigation", () => {
    expect(
      buildNavigationSearch({
        namespace: "team-a",
        view: "editor",
        script: null,
        report: null,
        reportTab: SUMMARY_REPORT_TAB_ID,
      })
    ).toBe("?namespace=team-a&view=editor");
  });

  it("omits report context outside history and without a report", () => {
    expect(
      buildNavigationSearch({
        namespace: "team-a",
        view: "live-dashboard",
        script: "api/smoke.ts",
        report: "api/smoke.ts-1.html",
        reportTab: "note_1",
      })
    ).toBe("?namespace=team-a&view=live-dashboard&script=api%2Fsmoke.ts");

    expect(
      buildNavigationSearch({
        namespace: "team-a",
        view: "test-history",
        script: "api/smoke.ts",
        report: null,
        reportTab: "note_1",
      })
    ).toBe("?namespace=team-a&view=test-history&script=api%2Fsmoke.ts");
  });
});
