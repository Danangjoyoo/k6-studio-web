# E2E Remaining Issues Design

## Goal

Resolve the remaining handover issues for `k6-studio-web`: make the existing Playwright Chromium suite pass reliably, keep production changes small, and verify the known MinIO folder rename/runtime concern before marking the handover complete.

## Scope

This pass is limited to the unresolved work listed in `docs/handovers/2026-06-24-k6-studio-implementation.md` and `docs/handovers/2026-06-24-quick-reference.md`.

In scope:

- Fix the four failing Playwright scenarios.
- Add stable UI test targets where Playwright currently depends on broad class-name selectors.
- Adjust the file/folder create dialog flow only where needed for reliable root and folder-scoped creation.
- Make E2E-created k6 scripts short enough for deterministic test runtime.
- Verify folder rename behavior against the Docker/Compose MinIO runtime.
- Run focused and broad verification commands.

Out of scope:

- New user-facing features beyond the minimal dialog/testability changes.
- Broad redesign of the file explorer, tabs, dashboard, terminal, or app shell.
- Changing the single-run architecture, dashboard port, or MinIO storage model unless verification exposes a concrete defect.
- Editing `docs/plans/master.md`.

## Root-Cause Findings

The handover described the remaining failures as mostly E2E-related. Reading the current Playwright artifacts and source clarifies the likely causes:

- The root delete test creates a unique file but then clicks `page.getByRole("button", { name: "Delete script" }).first()`. With many persisted E2E objects in MinIO, this can delete another row and leave the created file visible.
- The nested script test creates a unique folder but then clicks `page.getByRole("button", { name: "New script here" }).first()`. This can target an older folder instead of the newly created row. The current folder-scoped dialog pattern also mounts a separate `NewFileDialog defaultOpen`, which is more fragile than a controlled dialog.
- The run lifecycle failures are not just text matching. The Playwright snapshots show the header still rendering `Active runner: 1/1` after the timeout. The implementation must verify whether k6 completion is detected consistently and whether the E2E scripts are simply too long for the current timeout budget.
- The local MinIO client version supports the current `copyObject(targetBucket, targetObject, sourceBucketAndObject)` overload, so the rename concern is a runtime verification task unless Docker proves otherwise.

## Design

### Stable File Explorer Targets

Add stable attributes to file and folder rows:

- File row: `data-testid="sidebar-file-item"` and `data-path={path}`.
- Folder row: `data-testid="sidebar-folder-item"` and `data-path={path}`.

Playwright helpers should locate rows by `data-testid` and `data-path`, then scope button clicks inside that row. This avoids depending on Tailwind class names and avoids global `.first()` matches when prior E2E data remains in MinIO.

### Controlled Create Dialogs

Update `NewFileDialog` and `NewFolderDialog` to support controlled `open` and `onOpenChange` props while preserving the current toolbar-trigger usage. The trigger should remain available for root toolbar creation, but folder-scoped creation should use one controlled dialog managed by `FileExplorer`.

`FileExplorer` should track:

- `scriptDialogOpen`
- `scriptDialogParent`
- `folderDialogOpen`
- `folderDialogParent`

Root toolbar actions set the parent to `null`; folder action buttons set the parent to the folder path. Submit handlers construct the full path through existing normalization logic, refresh the tree, and clear the parent/open state.

### E2E Script Runtime

The E2E suite should create short scripts for run-related scenarios instead of using the 25-second default script. A short script should still start the k6 dashboard and produce terminal output, but should finish quickly enough that two consecutive runs are well within the test timeout.

The run-related Playwright assertions should use a stable runner status target instead of page-wide text:

- Add `data-testid="active-runner-status"` to the header runner pill.
- Assert exact text such as `Active runner: 0/1` or `Active runner: 1/1` against that locator.

If a short script still leaves the status at `1/1`, investigate the actual terminal lines emitted in Docker and update `isK6SummaryLine` with a focused unit test before changing lifecycle logic.

### Folder Delete Normalization

Clean up the known folder delete path issue while touching the file explorer:

- Normalize the folder path once.
- Send a single trailing slash to the catch-all delete route.
- Avoid constructing paths such as `auth//`.

### MinIO Rename Verification

Run a Docker/Compose-backed check that creates a folder, creates or verifies a child object, renames the folder through the UI or API, and confirms the old prefix is gone and the new prefix exists in the file tree. If the current MinIO `copyObject` string source format fails at runtime, fix the route with the supported API shape and add focused route-level coverage if practical.

## Testing

Focused verification should include:

- Jest tests for any modified component helpers or lifecycle helpers.
- `npx jest`
- `npx tsc --noEmit`
- `npx playwright test --project=chromium`

Docker-backed verification should include:

- `docker compose up --build -d`
- A folder rename check against the running app/MinIO stack.
- The full Playwright Chromium suite against the Compose app on port `3000`.

Docker commands may require elevated access in this environment.

## Acceptance Criteria

- All existing seven Playwright Chromium scenarios pass.
- Root delete and nested script tests act on the specific row created by the test.
- Folder-scoped create dialogs open reliably without hidden duplicate trigger behavior.
- Consecutive run and terminal-stop tests prove the runner returns to `Active runner: 0/1`.
- Folder delete paths are normalized.
- Folder rename is verified against Docker/Compose MinIO, or a runtime copyObject issue is fixed and reverified.
- Unit tests, TypeScript, and Playwright verification results are recorded in the final handoff.
