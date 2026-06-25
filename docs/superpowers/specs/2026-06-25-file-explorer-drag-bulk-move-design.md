# File Explorer Drag, Bulk Select, And Conflict-Safe Move Design

Date: 2026-06-25

## Goal

Add file explorer interactions for dragging scripts and folders, selecting multiple items, and moving them as a batch. Moves must be all-or-nothing: if any moved file or folder would duplicate an existing destination name or overwrite an existing object, the server rejects the whole request and does not copy or delete anything.

## Current Context

The file explorer renders a recursive tree from `FileNode[]` in `src/components/file-explorer/FileExplorer.tsx`. `FileItem` and `FolderItem` own row interactions such as click selection, double-click rename, folder collapse, and delete/create buttons.

Files and folders are stored in MinIO under `SCRIPTS_BUCKET`. Folders are represented by object prefixes plus `.keep` sentinels for empty folders. Existing rename behavior is implemented by `src/app/api/files/rename/route.ts` using copy followed by delete.

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

## Invalid Moves

The client disables visual drop affordances for obviously invalid drops. The server enforces all invalid-move checks regardless of client behavior.

Reject the request when:

- The request has no items.
- Any item path or type is malformed.
- Any source item does not exist.
- A folder is moved into itself or into one of its descendants.
- Any destination path would duplicate an existing file or folder name.
- Any folder descendant copy would overwrite an existing object.
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
3. Compute every destination key.
4. List relevant destination prefixes and exact destination keys.
5. Reject conflicts before copying.
6. Copy all source keys to destination keys.
7. Delete all original source keys only after every copy succeeds.

If a copy operation fails after preflight, return `500` and do not delete source keys. This can leave copied destination keys behind in a rare partial-copy failure, but it preserves user data. The UI will refresh and show the actual tree. Rollback cleanup is out of scope for this iteration.

## Rename Hardening

Keep `/api/files/rename` for inline rename, but apply the same duplicate-destination preflight before copy/delete.

Rename rejection rules:

- File rename rejects when the target file exists.
- Folder rename rejects when the target folder prefix exists.
- Folder rename rejects when any copied descendant would overwrite an existing object.
- Folder rename rejects moving a folder into itself or a descendant.

## Client Design

`FileExplorer` owns:

- `selectedPaths: Set<string>` for bulk selections.
- `dragItems` derived from the dragged row and current selection.
- `dropTargetPath` for visual target styling.
- `moveError` for rejected move messages.

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
- Move a file to a folder after successful preflight.
- Move a folder with descendants after successful preflight.

Component tests:

- File and folder checkboxes toggle bulk selection.
- Dragging a selected row posts all top-level selected items.
- Dragging an unselected row posts only that row.
- Dropping onto a folder posts that folder as `targetFolder`.
- Dropping onto the root area posts a root target.
- Rejected move displays an explorer error and refresh does not run as success.

E2E tests:

- Create two folders and a script, drag the script into a folder, and verify the new path appears.
- Select multiple items, drag them into a folder, and verify all moved paths appear.
- Attempt to move a file into a folder that already contains the same basename and verify the move is rejected with the source path still present.

## Out Of Scope

- Cross-bucket moves.
- Moving reports.
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
- Focused Jest tests, TypeScript, lint, and relevant Playwright coverage pass.
