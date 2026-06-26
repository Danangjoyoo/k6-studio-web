# Test History Preview Tabs Design

Date: 2026-06-26

## Goal

Add tabbed preview workspaces to each saved test history report. Every selected report keeps its pinned k6 HTML summary tab and can also persist user-added URL tabs in S3.

## Approved Behavior

When a user clicks a test history result, the right preview area becomes a tabbed surface.

The first tab is always the report summary:

- It is labeled `Summary`.
- It displays the existing saved k6 HTML report iframe.
- It is pinned and cannot be closed.
- It is always present for every report, even when no custom tabs are saved.

Custom tabs are report-specific:

- Tabs are saved per individual report result, not per script.
- Switching to another report loads that report's custom tabs.
- Switching back restores the tabs saved for the original report.
- Custom tabs can be closed with an `x` button.
- Closing a persisted custom tab updates S3.

The tab bar has a `+` button:

- Clicking `+` creates a focused draft tab locally.
- The draft tab shows a browser-style URL input and iframe area.
- The draft tab is not persisted until the user submits a URL.
- Empty draft tabs are discarded when closed or when another report is selected.

Custom URL tabs behave like lightweight browser tabs:

- The URL input accepts only `http://` and `https://` URLs.
- Pressing Enter or submitting the URL navigates the tab iframe.
- Updating a persisted tab URL saves the new URL to S3.
- The tab title defaults to the URL hostname and can be derived client-side from the URL.
- Invalid URLs show an inline error and are not saved.
- The tab has reload, back, and forward buttons.
- Reload refreshes the iframe.
- Back and forward navigate only the URL history submitted through that tab's URL input.
- Back and forward stacks are browser-session cache only and are not persisted in S3.

## Storage Model

The saved k6 report HTML remains the source of truth for the summary tab:

```text
k6-reports/<namespace>/<script-path>-<timestamp>.html
```

Custom tab metadata is stored as a sidecar object next to the report:

```text
k6-reports/<namespace>/<script-path>-<timestamp>.html.tabs.json
```

The sidecar stores only custom tabs. The summary tab is implicit so old reports without sidecars still open normally.

Sidecar JSON shape:

```json
{
  "version": 1,
  "tabs": [
    {
      "id": "tab_1790000000000_abcd",
      "url": "https://grafana.example.local/d/load-summary",
      "title": "grafana.example.local",
      "updatedAt": "2026-06-26T00:00:00.000Z"
    }
  ]
}
```

## API Design

Existing report APIs remain compatible:

- `GET /api/reports?namespace=<namespace>` continues returning only HTML report entries and must hide `.tabs.json` sidecar objects.
- `GET /api/reports/[name]?namespace=<namespace>` continues serving the report summary HTML.

Add a metadata route:

- `GET /api/reports/[name]/tabs?namespace=<namespace>` returns `{ tabs: ReportPreviewCustomTab[] }`.
- Missing sidecar objects return `{ tabs: [] }` with status `200`.
- Malformed sidecar JSON returns `{ tabs: [] }` with status `200` so a broken sidecar does not block the report summary.
- `PUT /api/reports/[name]/tabs?namespace=<namespace>` accepts `{ tabs: ReportPreviewCustomTab[] }`, validates all URLs as `http(s)`, normalizes titles, and writes the sidecar JSON.

The metadata route rejects invalid namespaces and invalid URL schemes with `400`.

## Move And Rename Behavior

Report history must remain accessible after script or folder moves. Since custom tabs belong to a report result, report sidecars move with their corresponding report HTML objects.

When a report object moves from:

```text
src/a.ts-111.html
```

to:

```text
dest/a.ts-111.html
```

its sidecar moves from:

```text
src/a.ts-111.html.tabs.json
```

to:

```text
dest/a.ts-111.html.tabs.json
```

Move and rename conflict checks apply to both report HTML objects and sidecar objects.

## UI Architecture

Keep `TestHistoryTab` as the report list owner, but extract the right-side preview into a focused client component:

```text
src/components/tabs/TestHistoryReportPreview.tsx
```

Responsibilities:

- Render the pinned summary tab and custom tabs.
- Load custom tabs when `namespace` or `reportName` changes.
- Save custom tabs after add, edit, or close.
- Manage per-tab local history stacks for submitted URLs.
- Render browser controls and iframe for custom URL tabs.

`TestHistoryTab` remains responsible for fetching the report list, filtering by script, and choosing the selected report.

## Error Handling

If tab metadata fails to load, the summary tab still opens and the custom tab list is empty.

If saving tab metadata fails, keep the local UI state visible and show a compact inline error in the preview toolbar.

If a custom URL iframe refuses to render due to third-party frame restrictions, the app cannot bypass that. The tab still shows the URL and browser controls.

## Testing Strategy

Follow TDD:

- Unit-test report tab metadata helpers for URL validation, sidecar names, and normalization.
- Route-test `GET` and `PUT /api/reports/[name]/tabs`.
- Route-test that `GET /api/reports` hides sidecar objects.
- Route-test move/rename planning moves `.html.tabs.json` sidecars with report HTML.
- Component-test that selecting a report renders a pinned summary tab with no close button.
- Component-test that `+` creates a draft tab, URL submit persists the custom tab, and the iframe points at the URL.
- Component-test that closing a custom tab persists the updated tab list.
- Component-test that back/forward history is local and not included in the saved payload.

Final verification must run:

```bash
npx jest --runInBand
npx tsc --noEmit
npm run lint
npm run build
docker compose up --build -d
```

## Non-Goals

- No authentication or per-tab permissions.
- No persisted browser history stacks.
- No iframe content scraping or cross-origin navigation inspection.
- No custom tab title editor beyond deriving a readable title from the URL.
- No cross-report or cross-script shared custom tabs.
