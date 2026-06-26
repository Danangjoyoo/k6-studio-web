import { REPORT_TABS_SUFFIX } from "@/lib/report-tabs";

export interface ReportNote {
  id: string;
  title: string;
  markdown: string;
  updatedAt?: string;
}

export interface ReportNotesPayload {
  version: 1;
  notes: ReportNote[];
}

export class ReportNotesValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReportNotesValidationError";
  }
}

export function reportNotesSidecarName(reportName: string): string {
  return `${reportName}${REPORT_TABS_SUFFIX}`;
}

export function normalizeReportNotes(value: unknown): ReportNote[] {
  if (!Array.isArray(value)) {
    throw new ReportNotesValidationError("notes must be an array");
  }

  return value.map((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new ReportNotesValidationError(`note ${index} must be an object`);
    }

    const record = item as Record<string, unknown>;
    const id =
      typeof record.id === "string" && record.id.trim()
        ? record.id.trim()
        : `note_${Date.now()}_${index}`;
    const title =
      typeof record.title === "string" && record.title.trim()
        ? record.title.trim()
        : "Untitled note";
    const markdown =
      typeof record.markdown === "string" ? record.markdown : "";
    const updatedAt =
      typeof record.updatedAt === "string" && record.updatedAt.trim()
        ? record.updatedAt.trim()
        : undefined;

    return { id, title, markdown, ...(updatedAt ? { updatedAt } : {}) };
  });
}

export function parseReportNotesPayload(value: unknown): ReportNote[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const notes = (value as { notes?: unknown }).notes;
  try {
    return normalizeReportNotes(notes ?? []);
  } catch {
    return [];
  }
}

export function validateReportNoteAssetId(assetId: string): string {
  if (!/^[a-zA-Z0-9._-]+$/.test(assetId)) {
    throw new ReportNotesValidationError("Invalid note asset id");
  }
  return assetId;
}

export function reportNoteAssetObjectName(assetId: string): string {
  return `.report-note-assets/${validateReportNoteAssetId(assetId)}`;
}

export function reportNoteAssetUrl(
  reportName: string,
  assetId: string,
  namespace: string
): string {
  return `/api/reports/${encodeURIComponent(reportName)}/note-assets/${encodeURIComponent(
    validateReportNoteAssetId(assetId)
  )}?namespace=${encodeURIComponent(namespace)}`;
}
