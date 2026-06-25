# File Explorer Drag, Bulk Select, And Conflict-Safe Move Design

Date: 2026-06-25

## Goal

Add file explorer interactions for dragging scripts and folders, selecting multiple items, and moving them as a batch. Moves must be all-or-nothing: if any moved file or folder would duplicate an existing destination name or overwrite an existing object, the server rejects the whole request and does not copy or delete anything. A move must not affect any script that is currently executing, and existing test history must remain accessible from the script's new path after a successful move.

## Current Context

The file explorer renders a recursive tree from `FileNode[]` in `src/components/file-explorer/FileExplorer.tsx`. `FileItem` and `FolderItem` own row interactions such as click selection, double-click rename, folder collapse, and delete/create buttons.

Files and folders are stored in MinIO under `SCRIPTS_BUCKET`. Folders are represented by object prefixes plus `.keep` sentinels for empty folders. Existing rename behavior is implemented by `src/app/api/files/rename/route.ts` using copy followed by delete.

Reports are stored in `REPORTS_BUCKET`. Current history lookup filters report object names by selected script path with `report.name.startsWith(`${scriptName}-`)`. Run completion saves reports using the current script path as the report-name prefix. Therefore, preserving history after a script move requires moving matching report objects from the old script-path prefix to the new script-path prefix.

Because MinIO has no native atomic rename or move, duplicate rejection must happen server-side before any copy starts.

## User-Facing Behavior

- Every file and folder row shows a compact checkbox for bulk selection.
- Clicking a file row still selects the script for editing.
- Clicking a folder row still toggles that folder open or closed.
- Clicking a row checkbox toggles that row in the bulk selection without triggering row click behavior.
- Dragging a selected row moves all currently selected rows.
- Dragging an unselected row moves only that row.
- Dropping on a folder row moves the dragged item set into that folder.
- Dropping on the root drop area moves the dragged item set to the root.
- A successful move refreshes the tree and clears moved selections.
- A rejected move leaves the tree and selection unchanged and shows a concise explorer-level error.
- Rows for the currently running script, and folders containing the currently running script, cannot be selected for move and cannot be dragged.
- If a move succeeds, the Test history tab for the moved script's new path still shows reports created before the move.

## Invalid Moves

The client disables visual drop affordances for obviously invalid drops. The server enforces all invalid-move checks regardless of client behavior.

Reject the request when:

- The request has no items.
- Any item path or type is malformed.
- Any source item does not exist.
- Any source item is the script currently executing a run.
- Any source folder contains the script currently executing a run.
- A folder is moved into itself or into one of its descendants.
- Any destination path would duplicate an existing file or folder name.
- Any folder descendant copy would overwrite an existing object.
- Any report object needed to preserve moved script history would overwrite an existing report object.
- Any two moved items would collide at the destination.
- A source item is both selected directly and indirectly through a selected parent folder.

When a request is rejected, the server returns `409` for conflicts and does not perform copy or delete operations.

## Destination Rules

The destination path preserves the moved item's basename.

Examples:

```text
src: folder/a.ts
targetFolder: target/
dest: target/a.ts

src: folder/api/
targetFolder: target/
dest: target/api/

src: folder/a.ts
targetFolder: null
dest: a.ts
```

Folder paths are normalized with one trailing slash. File paths have no trailing slash. The root destination is represented as `null` or an empty string in the API and normalized server-side.

## API Design

Add `POST /api/files/move`.

Request:

```json
{
  "items": [
    { "path": "folder/a.ts", "type": "file" },
    { "path": "folder/api/", "type": "folder" }
  ],
  "targetFolder": "new-parent/"
}
```

Response on success:

```json
{
  "moved": [
    { "from": "folder/a.ts", "to": "new-parent/a.ts", "type": "file" },
    { "from": "folder/api/", "to": "new-parent/api/", "type": "folder" }
  ]
}
```

Response on conflict:

```json
{
  "error": "Move rejected because a destination already exists.",
  "conflicts": ["new-parent/a.ts"]
}
```

The route preflights all objects before moving:

1. Normalize and de-duplicate source items.
2. Expand folder items to the object keys under each source prefix.
3. Determine moved script paths from file items and folder descendants.
4. Reject the move if any moved script path equals the active running script, or if any moved folder contains the active running script.
5. Compute every destination key in `SCRIPTS_BUCKET`.
6. Compute every history-preservation destination key in `REPORTS_BUCKET`.
7. List relevant destination prefixes and exact destination keys across both buckets.
8. Reject conflicts before copying.
9. Copy all source script keys and report keys to destination keys.
10. Delete original script keys and report keys only after every copy succeeds.

The move route reads the active run state from `getStatus()` in `src/lib/run-lock.ts`. Client-side active-run checks are only usability affordances; the server is authoritative.

If a copy operation fails after preflight, return `500` and do not delete source keys. This can leave copied destination keys behind in a rare partial-copy failure, but it preserves user data. The UI will refresh and show the actual tree. Rollback cleanup is out of scope for this iteration.

## History Preservation

History follows moved scripts. The move operation must preserve access to old reports from the new script path.

For each moved script path:

```text
old script path: folder/a.ts
new script path: target/a.ts
old report prefix: folder/a.ts-
new report prefix: target/a.ts-
```

Every report object whose name starts with the old report prefix is copied to the corresponding new report name. After all script objects and report objects copy successfully, original report objects are deleted with the original script objects.

Folder moves apply the same mapping to every descendant script. Empty folder sentinels have no history.

The Test history UI does not need a separate alias lookup for this iteration because report object names are updated to the moved script path. If report movement fails before source deletion, the move request fails and source script/report objects remain accessible at their original paths.

## Rename Hardening

Keep `/api/files/rename` for inline rename, but apply the same duplicate-destination preflight before copy/delete.

Rename rejection rules:

- File rename rejects when the target file exists.
- Folder rename rejects when the target folder prefix exists.
- Folder rename rejects when any copied descendant would overwrite an existing object.
- Folder rename rejects moving a folder into itself or a descendant.
- File rename rejects when the renamed file is currently executing.
- Folder rename rejects when the renamed folder contains the currently executing script.
- Rename preserves test history with the same report-prefix movement used by bulk move.

## Client Design

`FileExplorer` owns:

- `selectedPaths: Set<string>` for bulk selections.
- `dragItems` derived from the dragged row and current selection.
- `dropTargetPath` for visual target styling.
- `moveError` for rejected move messages.
- `globalRunningScript` or equivalent active-run context for disabling client-side move controls on the running script and containing folders.

`FileItem` and `FolderItem` receive:

- `checked`
- `onCheckedChange`
- `draggable`
- `onDragStart`
- `onDragOver`
- `onDrop`
- `isDropTarget`

Row controls stop event propagation so checkboxes, create buttons, delete buttons, and inline rename do not accidentally toggle folders or select files.

The root drop area is the scroll/tree body. It accepts drops when the pointer is not over a folder row.

Rows disabled by active-run protection remain visible and clickable for existing non-move behavior. Their move checkbox is disabled, and drag start is prevented.

## Selection Details

- Selecting a folder means the folder and all descendants move as one folder unit.
- If a selected folder contains selected children, the client sends only the parent folder item.
- If a user drags an unselected child inside a selected folder, the dragged item set is only that child because the dragged row is not selected.
- Clearing selection after successful move avoids stale paths.
- Search filtering does not clear selection. Hidden selected items can still be moved only if the user drags a visible selected item; the selected item count affects move behavior without adding new visible text.

## Error Display

Use a compact explorer-level error row below the search box or above the tree. The text should be operational and concise, for example:

```text
Move rejected: destination already exists.
```

No modal is required for this iteration.

## Tests

Route tests:

- Reject duplicate file destination with `409`.
- Reject duplicate folder destination with `409`.
- Reject a bulk move when one item conflicts and verify no copy/delete calls happen.
- Reject moving a folder into its own descendant.
- Reject moving the active running script.
- Reject moving a folder that contains the active running script.
- Move matching report objects so old history appears under the new script path.
- Reject the whole move when a report history destination would overwrite an existing report.
- Move a file to a folder after successful preflight.
- Move a folder with descendants after successful preflight.

Component tests:

- File and folder checkboxes toggle bulk selection.
- Dragging a selected row posts all top-level selected items.
- Dragging an unselected row posts only that row.
- Dropping onto a folder posts that folder as `targetFolder`.
- Dropping onto the root area posts a root target.
- Rejected move displays an explorer error and refresh does not run as success.
- Running script rows and containing folder rows disable move selection and drag.

E2E tests:

- Create two folders and a script, drag the script into a folder, and verify the new path appears.
- Select multiple items, drag them into a folder, and verify all moved paths appear.
- Attempt to move a file into a folder that already contains the same basename and verify the move is rejected with the source path still present.
- Run a script to create a report, move the script, select the moved script, and verify the old report appears in Test history.
- Start a run and verify the active script cannot be moved while `Active runner: 1/1` is visible.

## Out Of Scope

- Cross-bucket moves.
- Moving reports independently of script moves.
- Keyboard-only drag/drop.
- Undo.
- Partial-copy rollback cleanup.
- Reordering rows within the same folder.
- Persisting selection across page reloads.

## Acceptance Criteria

- Users can drag files and folders into folders and root.
- Users can select multiple files/folders and drag them together.
- Existing click, double-click rename, create, delete, search, and scroll behavior remains intact.
- The server rejects duplicate destination names before any copy/delete work starts.
- A bulk move with any conflict is rejected entirely.
- The server rejects any move or rename that includes the currently running script or a folder containing it.
- Report history for moved scripts is available from each script's new path after a successful move.
- Focused Jest tests, TypeScript, lint, and relevant Playwright coverage pass.
