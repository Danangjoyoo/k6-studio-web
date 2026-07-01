import { normalizeNamespace } from "@/lib/namespaces";

export const SUMMARY_REPORT_TAB_ID = "summary";

export type MainView = "builder" | "editor" | "live-dashboard" | "test-history";

export interface NavigationState {
  namespace: string | null;
  view: MainView;
  script: string | null;
  report: string | null;
  reportTab: string;
}

const MAIN_VIEWS = new Set<MainView>([
  "builder",
  "editor",
  "live-dashboard",
  "test-history",
]);

export function parseNavigationState(search: string): NavigationState {
  const params = new URLSearchParams(search);
  const view = parseMainView(params.get("view"));

  return {
    namespace: parseNamespace(params.get("namespace")),
    view,
    script: nonEmpty(params.get("script")),
    report: nonEmpty(params.get("report")),
    reportTab: nonEmpty(params.get("reportTab")) ?? SUMMARY_REPORT_TAB_ID,
  };
}

export function buildNavigationSearch(state: NavigationState): string {
  const params = new URLSearchParams();
  if (state.namespace) {
    params.set("namespace", state.namespace);
  }
  params.set("view", state.view);

  if (state.script) {
    params.set("script", state.script);
  }

  if (state.view === "test-history" && state.report) {
    params.set("report", state.report);
    if (state.reportTab && state.reportTab !== SUMMARY_REPORT_TAB_ID) {
      params.set("reportTab", state.reportTab);
    }
  }

  const search = params.toString();
  return search ? `?${search}` : "";
}

function parseMainView(value: string | null): MainView {
  return MAIN_VIEWS.has(value as MainView) ? (value as MainView) : "editor";
}

function parseNamespace(value: string | null): string | null {
  if (value === null) return null;
  try {
    return normalizeNamespace(value);
  } catch {
    return null;
  }
}

function nonEmpty(value: string | null): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}
