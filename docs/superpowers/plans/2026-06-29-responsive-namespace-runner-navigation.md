# Responsive Header, Namespace Search, Runner Navigation

## Goal

Make the sidebar header usable at narrow widths, replace the namespace native select with a searchable dropdown, and let active-runner script entries navigate directly to the running script.

## Scope

1. File explorer header
   - Allow the scripts label/count and create buttons to wrap onto multiple lines.
   - Keep the existing search box, dialogs, and file tree behavior unchanged.

2. Namespace selector
   - Replace the native select with an interactive dropdown button.
   - Include a search input in the dropdown and filter namespace options locally.
   - Preserve namespace fetching, validation fallback to `default`, and create namespace dialog.

3. Active runner list
   - Render active scripts as clickable entries in the runner dropdown.
   - Wire clicks through the app shell so a selected active run switches namespace, opens that script, and returns to the editor view.

## Test Plan

1. Add focused Jest tests before implementation:
   - File explorer header includes wrapping layout classes.
   - Namespace selector opens a searchable option list and filters/selects namespaces.
   - App header calls a runner navigation callback from active script rows.
   - App shell passes active-run clicks into namespace/script/view state.

2. Run focused tests for the changed components.
3. Run full verification: Jest, lint, build, and TypeScript.
