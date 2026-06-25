# Dialog Close And Shift Selection Design

Date: 2026-06-25

## Goal

Fix two UI issues:

- Dialog close buttons should not overlap the dialog border.
- File explorer row checkboxes should appear only while hovering/focusing a row with Shift held, then remain visible while any checkbox is selected, and collapse again when no checkbox is selected.

## Design

Move the shared `DialogContent` close button inward from the top-right edge so namespace creation and other dialogs inherit the corrected placement.

Track Shift key state in `FileExplorer` using window `keydown`/`keyup`, `blur`, and visibility cleanup. Pass a row-level reveal flag to `FileItem` and `FolderItem`. Row items keep zero-width hidden controls by default. They enable hover/focus reveal only when Shift is currently held, or show controls persistently when selection mode is active or the row is checked.

## Tests

Add focused component tests:

- `DialogContent` close button uses inset positioning away from the border.
- `FileItem` and `FolderItem` controls stay hidden on hover unless Shift reveal is enabled.
- `FileExplorer` shows controls when Shift is held and a row is hovered, keeps them visible after a selection, and collapses them after the selection is cleared.
