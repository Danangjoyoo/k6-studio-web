# File Explorer Progressive Selection Design

Date: 2026-06-25

## Goal

Replace always-visible move checkboxes in the file explorer with a progressive multi-select interaction. The explorer should stay compact by default, while still supporting bulk selection, drag-to-move, active-run move protection, and accessible selection controls.

## Current Context

`FileExplorer` owns the file tree, search query, bulk move selection, drag source, drop target, and move error state. `FileItem` and `FolderItem` render row controls and currently show a checkbox whenever selection handlers are passed.

The backend move and rename behavior is already in place. It rejects duplicate destination names, blocks moves for the currently running script or containing folders, and preserves report history when files move. This design does not change those server rules.

## Approved Behavior

- Explorer rows do not show a checkbox by default.
- A row shows its checkbox when hovered, keyboard-focused, selected for move, or when any move selection already exists.
- `Cmd+click` on macOS and `Ctrl+click` on Windows/Linux toggles a file or folder in the move selection.
- `Shift+click` selects a contiguous range in the currently visible explorer order.
- A normal click keeps existing behavior: file rows open/select the script, and folder rows expand or collapse.
- Dragging a selected row moves all selected top-level items.
- Dragging an unselected row moves only that row.
- Running script rows and folders containing the running script cannot be selected or dragged.
- Existing create, delete, rename, search, scroll, and drop behavior remains intact.

## Selection Model

`FileExplorer` keeps the current `selection` map keyed by item type and path. It adds a `lastSelectionKey` so `Shift+click` can select a range from the last toggled row to the clicked row.

The explorer computes a visible row list from the filtered tree and expanded folder state. Range selection uses this visible list, so collapsed children are not included in a `Shift+click` range. Disabled rows are skipped when applying modifier or range selection.

Selecting a folder still represents moving that folder as a single item. Before a move request, nested selections are pruned so selected children inside a selected parent folder are not sent twice.

## Folder Expansion State

To make visible-range selection deterministic, folder expansion moves from local `FolderItem` state into `FileExplorer`.

`FileExplorer` stores expanded folder paths in a set. Folder rows receive `isOpen` and `onToggleOpen` props. Newly discovered folders default to open so current behavior is preserved. Search results still show matching ancestors and descendants according to the existing filtering rules.

## Row Interaction

`FileItem` and `FolderItem` receive a single row selection handler that includes the click event intent:

- No modifier: run the existing file-select or folder-toggle action.
- `Cmd/Ctrl`: toggle that row in move selection and stop the normal row action.
- `Shift`: select a visible range and stop the normal row action.

The checkbox remains a real input for accessibility and pointer users. Clicking it toggles move selection without triggering file selection or folder expansion.

## Accessibility

Rows expose selected state with `aria-selected` when they are in the move selection. The checkbox remains keyboard reachable on hover/focus/selected rows and has the same label as today.

Keyboard behavior:

- `Enter` keeps the current row action.
- `Space` toggles move selection for the focused row when the row can be moved.
- Disabled move rows keep normal navigation behavior but cannot toggle selection.

## Visual Design

The checkbox column keeps its current compact width. When hidden, it uses opacity and pointer-event changes rather than layout removal, so row text does not shift on hover or selection changes.

Selected rows continue using the existing selected row styling. A row can be both the active editor file and selected for move; the visual state should remain clear by using existing `data-selected` styling without adding a new palette.

## Testing

Component or integration coverage:

- Default rows do not visibly show checkboxes.
- Hovered, focused, and selected rows show their checkbox.
- `Cmd/Ctrl+click` toggles file and folder move selection without opening/toggling the row.
- `Shift+click` selects a visible range and skips disabled running-script rows.
- `Space` toggles move selection for a focused movable row.
- Dragging a selected row still posts all selected top-level items.
- Dragging an unselected row still posts only that row.
- Running script rows and containing folders cannot be selected or dragged.

E2E coverage updates:

- Replace always-visible checkbox assumptions with modifier-click or hover/focus checkbox interactions.
- Keep existing drag, duplicate rejection, history preservation, and active-run move protection scenarios.

## Out Of Scope

- Reordering files or folders.
- Persisting selection across reloads.
- Touch-specific multi-select gestures.
- Keyboard-only drag and drop.
- Backend move API changes.

## Acceptance Criteria

- The file explorer is compact by default with no always-visible checkbox column content.
- Users can bulk-select with `Cmd/Ctrl+click`, range-select with `Shift+click`, and still use visible checkboxes when rows are hovered, focused, or selected.
- Existing file open, folder toggle, rename, delete, create, search, scroll, drag, and drop workflows continue working.
- Active-run move protection remains enforced in the UI and by the server.
- Focused tests, TypeScript, lint, build, and relevant Playwright coverage pass.
