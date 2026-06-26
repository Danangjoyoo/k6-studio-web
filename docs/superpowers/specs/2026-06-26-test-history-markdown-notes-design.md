# Test History Markdown Notes Design

## Goal

Replace Test History custom URL/browser tabs with per-report Markdown note tabs. The summary report remains pinned, while `+` creates saved notes that can contain Markdown text and pasted images.

## Current Problem

The current custom preview tabs store a URL and render it in an iframe. This does not work reliably for Datadog, AWS CloudWatch, GitHub, or other authenticated operational tools because browsers enforce those sites' framing policies and third-party-cookie behavior. The result is a broken preview such as "refused to connect."

## User Experience

- The Test History right preview still has tabbed content.
- `Summary` is always present, pinned, and has no close button.
- The `+` button appears after `Summary` and after any existing note tabs.
- Clicking `+` creates a draft note tab and focuses the note title or editor.
- Each note tab can be closed. Closing a saved note persists the remaining notes.
- A note tab shows a Markdown editor and a preview surface. The first implementation uses a compact toolbar with a preview toggle, not a full rich-text editor.
- Notes save explicitly with a Save button. Pasted images upload immediately and insert Markdown image syntax into the editor.

## Persistence

Notes are stored per individual report in the reports bucket sidecar object:

```json
{
  "version": 1,
  "notes": [
    {
      "id": "note_...",
      "title": "Investigation notes",
      "markdown": "## Findings\n...",
      "updatedAt": "2026-06-26T00:00:00.000Z"
    }
  ]
}
```

The existing `.tabs.json` sidecar suffix may be reused for compatibility with move/rename history handling, but the payload changes to `notes`. Existing URL tab payloads are ignored by the new UI rather than rendered as browser tabs.

## Image Assets

When the user pastes an image into a note editor:

1. The client reads the pasted image file from clipboard data.
2. The client posts it to a report note asset endpoint with the current report name and namespace.
3. The server stores the image in the reports bucket under a report-scoped path:

```text
NAMESPACE/.report-note-assets/<encoded-report-name>/<asset-id>.<ext>
```

4. The server returns an app-served asset URL.
5. The client inserts Markdown image syntax at the cursor:

```md
![pasted image](/api/reports/<report-name>/note-assets/<asset-id>?namespace=<namespace>)
```

Assets are served by the app from S3 so local MinIO and private S3 buckets still work.

## API

Use report-scoped API routes:

- `GET /api/reports/[name]/notes?namespace=...`
  - Returns `{ notes: ReportNote[] }`.
- `PUT /api/reports/[name]/notes?namespace=...`
  - Validates and stores the full notes array.
- `POST /api/reports/[name]/note-assets?namespace=...`
  - Accepts one image file, stores it, and returns `{ url, assetId }`.
- `GET /api/reports/[name]/note-assets/[assetId]?namespace=...`
  - Streams the stored image.

## Validation

- Note titles are strings. Empty or missing title becomes `Untitled note`.
- Note Markdown is a string. Missing Markdown becomes an empty string.
- Asset uploads accept `image/png`, `image/jpeg`, `image/gif`, and `image/webp`.
- Asset IDs are generated server-side and limited to safe filename characters.
- Invalid namespace/report names use the existing namespace validation and report name path behavior.

## Rendering

Markdown preview supports a restrained subset:

- headings
- paragraphs
- fenced code blocks
- inline code
- unordered lists
- links
- images

The implementation must avoid injecting unsanitized HTML. Raw HTML in Markdown is displayed as text or escaped.

## Tests

Add or update tests for:

- note payload normalization and backward-compatible empty parsing
- notes API GET/PUT
- image asset upload/read API
- UI create/save/delete note
- UI paste image upload inserts Markdown image syntax
- UI preview renders basic Markdown and images
- previous `+` button ordering remains correct

## Out Of Scope

- In-app remote browser
- iframe preview of arbitrary external URLs
- Datadog/AWS/GitHub authentication handling
- collaborative editing or autosave
- deleting orphaned image assets when Markdown references are removed

