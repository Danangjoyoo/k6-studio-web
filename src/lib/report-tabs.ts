export const REPORT_TABS_SUFFIX = ".tabs.json";

export interface ReportPreviewCustomTab {
  id: string;
  url: string;
  title: string;
  updatedAt?: string;
}

export interface ReportPreviewTabsPayload {
  version: 1;
  tabs: ReportPreviewCustomTab[];
}

export class ReportTabsValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReportTabsValidationError";
  }
}

export function reportTabsSidecarName(reportName: string): string {
  return `${reportName}${REPORT_TABS_SUFFIX}`;
}

export function isReportTabsSidecar(name: string): boolean {
  return name.endsWith(REPORT_TABS_SUFFIX);
}

export function normalizeReportPreviewTabs(
  value: unknown
): ReportPreviewCustomTab[] {
  if (!Array.isArray(value)) {
    throw new ReportTabsValidationError("tabs must be an array");
  }

  return value.map((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new ReportTabsValidationError(`tab ${index} must be an object`);
    }

    const record = item as Record<string, unknown>;
    const id =
      typeof record.id === "string" && record.id.trim()
        ? record.id.trim()
        : `tab_${Date.now()}_${index}`;
    const url =
      typeof record.url === "string" ? normalizeHttpUrl(record.url) : null;
    if (!url) {
      throw new ReportTabsValidationError(
        "Only http and https URLs are supported"
      );
    }

    const title =
      typeof record.title === "string" && record.title.trim()
        ? record.title.trim()
        : new URL(url).hostname;
    const updatedAt =
      typeof record.updatedAt === "string" && record.updatedAt.trim()
        ? record.updatedAt.trim()
        : undefined;

    return { id, url, title, ...(updatedAt ? { updatedAt } : {}) };
  });
}

export function parseReportPreviewTabsPayload(
  value: unknown
): ReportPreviewCustomTab[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const tabs = (value as { tabs?: unknown }).tabs;
  try {
    return normalizeReportPreviewTabs(tabs ?? []);
  } catch {
    return [];
  }
}

function normalizeHttpUrl(value: string): string | null {
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.toString();
  } catch {
    return null;
  }
}
