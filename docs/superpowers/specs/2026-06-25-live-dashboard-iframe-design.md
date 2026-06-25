# Live Dashboard Iframe Design

## Problem

The Live Dashboard tab can show the k6 dashboard shell while the embedded UI remains on `Loading...`, even though the k6 dashboard server has launched. The current implementation gates iframe rendering behind a `/api/dashboard/ui/` readiness probe and the E2E test only checks iframe visibility, so it can miss cases where the embedded dashboard has not rendered live data.

## Root Cause

k6 exposes the dashboard page before the dashboard UI has metric data. The dashboard receives that data through `/events`, and the default k6 dashboard period is 10 seconds. The app also does not mount the iframe until the Live Dashboard tab content is active, so opening the tab late starts a fresh dashboard UI session late in the run.

## Approved Behavior

- When the Live Dashboard tab is active and the selected script is the current running script, render the k6 dashboard iframe immediately.
- Do not wait for `/api/dashboard/ui/` before mounting the iframe.
- If k6 has not opened the dashboard port yet, the iframe may briefly show the proxy's unavailable response; while the run remains active, the iframe should retry automatically.
- When the selected script is not the current running script, do not mount the iframe.
- Set the default k6 dashboard update period to `1s`, while allowing an environment override.
- Verify dashboard rendering by asserting content inside the iframe, not just iframe visibility.
- The file explorer must scroll when the file tree exceeds the sidebar height.
- The file explorer must include a search box directly below the add-folder/add-script toolbar row.
- The search box width must follow the file explorer width.
- Search should filter visible folders and files by name or full path. Folder ancestors remain visible when a child matches.

## Architecture

`LiveDashboardTab` owns client-side iframe mounting behavior. It should render the existing empty states for no selected script or inactive/different script, and render the iframe directly when `isActiveRun` is true. A small retry key can remount the iframe on an interval while the active run continues.

`src/lib/k6.ts` owns k6 dashboard environment variables. It should add `K6_WEB_DASHBOARD_PERIOD`, defaulting to `1s`, and respect `process.env.K6_WEB_DASHBOARD_PERIOD` when present.

`e2e/k6-studio.spec.ts` should validate that the iframe renders real dashboard content. A passing check requires the iframe body to leave `Loading...` and show panel text such as `Iteration Rate`.

`FileExplorer` owns sidebar search and scroll behavior. The outer explorer and sidebar panel need `min-h-0` flex constraints so the existing scroll area can shrink and scroll. Search state stays local to `FileExplorer`, filters the in-memory tree returned by `/api/files`, and does not call the server.

## Testing

- Unit test `getK6RunEnv()` default period and override behavior.
- Unit test `LiveDashboardTab` renders the iframe immediately for an active selected run.
- Unit test `LiveDashboardTab` does not render the iframe for inactive runs.
- Unit test `LiveDashboardTab` increments the iframe retry key while the run remains active.
- Unit test `FileExplorer` renders a search input below the toolbar.
- Unit test `FileExplorer` filters files by name/path while preserving matching folder ancestors.
- Unit/style assertion for scroll layout classes on the explorer scroll region.
- E2E test waits for live dashboard iframe content, not only the iframe element.
- E2E test can search for a created/nested file in the file explorer before selecting it.

## Out Of Scope

- Replacing k6's dashboard frontend.
- Adding a separate external dashboard link.
- Keeping the dashboard iframe mounted while another script is selected.
- Server-side file search.
