# Test History Markdown Notes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace arbitrary URL preview tabs in Test History with per-report Markdown note tabs that can save text and pasted images.

**Architecture:** Keep the pinned report Summary tab, and treat all user-created tabs as note documents. Persist note metadata in the existing report sidecar object so report move/rename behavior continues to carry notes with history. Store pasted images as app-served report note assets in S3 and insert Markdown image syntax into the editor.

**Tech Stack:** Next.js App Router route handlers, React 19 client components, TypeScript strict mode, MinIO/S3 storage, Jest and Testing Library.

---

## File Structure

- Create `src/lib/report-notes.ts`: note payload validation, sidecar naming, asset id/path helpers.
- Create `src/lib/__tests__/report-notes.test.ts`: normalization and asset helper tests.
- Create `src/app/api/reports/[name]/notes/route.ts`: GET/PUT notes payload for a report.
- Create `src/app/api/reports/[name]/notes/__tests__/route.test.ts`: notes route tests.
- Create `src/app/api/reports/[name]/note-assets/route.ts`: POST pasted image assets.
- Create `src/app/api/reports/[name]/note-assets/[assetId]/route.ts`: GET note image assets.
- Create `src/app/api/reports/[name]/note-assets/__tests__/route.test.ts`: upload/read route tests.
- Create `src/components/tabs/MarkdownPreview.tsx`: restrained Markdown preview renderer.
- Modify `src/components/tabs/TestHistoryReportPreview.tsx`: remove URL browser controls and render note editor/preview.
- Modify `src/components/tabs/__tests__/TestHistoryReportPreview.test.tsx`: replace URL tab tests with notes and pasted-image tests.

## Task 1: Notes Data Model

**Files:**
- Create: `src/lib/report-notes.ts`
- Create: `src/lib/__tests__/report-notes.test.ts`

- [ ] **Step 1: Write failing tests**

Add tests for normalized notes, empty malformed payloads, sidecar naming, safe asset IDs, and asset URLs.

```ts
import {
  normalizeReportNotes,
  parseReportNotesPayload,
  reportNotesSidecarName,
  reportNoteAssetObjectName,
  reportNoteAssetUrl,
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
      { id: expect.stringMatching(/^note_/), title: "Untitled note", markdown: "" },
    ]);
  });

  it("parses missing or legacy url-tab payloads as no notes", () => {
    expect(parseReportNotesPayload({ tabs: [{ id: "tab_1", url: "https://x.test", title: "x" }] })).toEqual([]);
    expect(parseReportNotesPayload(null)).toEqual([]);
  });

  it("uses the existing tabs sidecar suffix for move compatibility", () => {
    expect(reportNotesSidecarName("api/smoke.ts-1.html")).toBe("api/smoke.ts-1.html.tabs.json");
  });

  it("builds safe app-served asset URLs", () => {
    expect(validateReportNoteAssetId("asset_abc123.png")).toBe("asset_abc123.png");
    expect(() => validateReportNoteAssetId("../x.png")).toThrow("Invalid note asset id");
    expect(reportNoteAssetObjectName("asset_abc123.png")).toBe(".report-note-assets/asset_abc123.png");
    expect(reportNoteAssetUrl("api/smoke.ts-1.html", "asset_abc123.png", "team-a")).toBe(
      "/api/reports/api%2Fsmoke.ts-1.html/note-assets/asset_abc123.png?namespace=team-a"
    );
  });
});
```

- [ ] **Step 2: Run tests to verify red**

Run: `npx jest src/lib/__tests__/report-notes.test.ts --runInBand`

Expected: FAIL because `@/lib/report-notes` does not exist.

- [ ] **Step 3: Implement the model**

Create `src/lib/report-notes.ts` with:

```ts
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
```

- [ ] **Step 4: Run tests to verify green**

Run: `npx jest src/lib/__tests__/report-notes.test.ts --runInBand`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/report-notes.ts src/lib/__tests__/report-notes.test.ts
git commit -m "feat: add report notes model"
```

## Task 2: Notes API

**Files:**
- Create: `src/app/api/reports/[name]/notes/route.ts`
- Create: `src/app/api/reports/[name]/notes/__tests__/route.test.ts`

- [ ] **Step 1: Write failing route tests**

Test GET missing sidecar, GET existing notes, PUT validation and persistence with namespacing.

- [ ] **Step 2: Run tests to verify red**

Run: `npx jest 'src/app/api/reports/[name]/notes/__tests__/route.test.ts' --runInBand`

Expected: FAIL because route file does not exist.

- [ ] **Step 3: Implement notes route**

Follow the existing `/api/reports/[name]/tabs` route structure, but import `normalizeReportNotes`, `parseReportNotesPayload`, `reportNotesSidecarName`, and `ReportNotesValidationError`.

- [ ] **Step 4: Run notes API tests**

Run: `npx jest 'src/app/api/reports/[name]/notes/__tests__/route.test.ts' --runInBand`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add 'src/app/api/reports/[name]/notes/route.ts' 'src/app/api/reports/[name]/notes/__tests__/route.test.ts'
git commit -m "feat: persist report notes"
```

## Task 3: Note Image Asset API

**Files:**
- Create: `src/app/api/reports/[name]/note-assets/route.ts`
- Create: `src/app/api/reports/[name]/note-assets/[assetId]/route.ts`
- Create: `src/app/api/reports/[name]/note-assets/__tests__/route.test.ts`

- [ ] **Step 1: Write failing upload/read tests**

Test accepted image upload returns an app URL and stores object in the reports bucket. Test invalid MIME returns 400. Test GET streams object with stored content type.

- [ ] **Step 2: Run tests to verify red**

Run: `npx jest 'src/app/api/reports/[name]/note-assets/__tests__/route.test.ts' --runInBand`

Expected: FAIL because routes do not exist.

- [ ] **Step 3: Implement asset routes**

Use `request.formData()`, accept one `file` field, generate `asset_${crypto.randomUUID()}.${ext}`, store under `reportNoteAssetObjectName(assetId)`, and return `reportNoteAssetUrl(reportName, assetId, namespace)`.

- [ ] **Step 4: Run asset API tests**

Run: `npx jest 'src/app/api/reports/[name]/note-assets/__tests__/route.test.ts' --runInBand`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add 'src/app/api/reports/[name]/note-assets/route.ts' 'src/app/api/reports/[name]/note-assets/[assetId]/route.ts' 'src/app/api/reports/[name]/note-assets/__tests__/route.test.ts'
git commit -m "feat: store pasted report note images"
```

## Task 4: Markdown Notes UI

**Files:**
- Create: `src/components/tabs/MarkdownPreview.tsx`
- Modify: `src/components/tabs/TestHistoryReportPreview.tsx`
- Modify: `src/components/tabs/__tests__/TestHistoryReportPreview.test.tsx`

- [ ] **Step 1: Write failing UI tests**

Replace URL-browser tests with tests for: create note tab, save note payload, close saved note, preview Markdown heading/image, paste image uploads and inserts Markdown image syntax, and `+` after note tabs.

- [ ] **Step 2: Run UI tests to verify red**

Run: `npx jest src/components/tabs/__tests__/TestHistoryReportPreview.test.tsx --runInBand`

Expected: FAIL because the UI still expects URL tabs and browser iframes.

- [ ] **Step 3: Implement Markdown preview**

Create a small renderer that splits Markdown into escaped React elements for headings, paragraphs, code blocks, unordered lists, links, inline code, and images. Do not use `dangerouslySetInnerHTML`.

- [ ] **Step 4: Replace custom URL tab UI**

Use `/api/reports/[name]/notes` for load/save. Note tab state should include `id`, `title`, `markdown`, `persisted`, `dirty`, and `error`. The active note shows a title input, Save button, Edit/Preview toggle, editor textarea, and preview.

- [ ] **Step 5: Implement paste image handling**

On textarea paste, find the first image item, upload it to `/api/reports/[name]/note-assets`, and insert `![pasted image](url)` at the cursor or append it if selection information is unavailable.

- [ ] **Step 6: Run UI tests**

Run: `npx jest src/components/tabs/__tests__/TestHistoryReportPreview.test.tsx --runInBand`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/components/tabs/MarkdownPreview.tsx src/components/tabs/TestHistoryReportPreview.tsx src/components/tabs/__tests__/TestHistoryReportPreview.test.tsx
git commit -m "feat: replace report browser tabs with notes"
```

## Task 5: Verification

**Files:**
- Verify all touched files.

- [ ] **Step 1: Run focused tests**

```bash
npx jest src/lib/__tests__/report-notes.test.ts 'src/app/api/reports/[name]/notes/__tests__/route.test.ts' 'src/app/api/reports/[name]/note-assets/__tests__/route.test.ts' src/components/tabs/__tests__/TestHistoryReportPreview.test.tsx --runInBand
```

Expected: all focused tests pass.

- [ ] **Step 2: Run broad checks**

```bash
npx jest --runInBand
npx tsc --noEmit
npm run lint
npm run build
```

Expected: all commands exit 0.

- [ ] **Step 3: Check working tree**

```bash
git status --short
```

Expected: no uncommitted changes except intentional generated artifacts, if any.

