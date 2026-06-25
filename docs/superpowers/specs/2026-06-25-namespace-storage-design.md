# Namespace Storage Design

Date: 2026-06-25

## Goal

Add first-class namespaces to k6 Studio so users can select or create a namespace from the header, and so scripts, folders, live runs, and saved reports are scoped to the selected namespace.

## Approved Execution Context

The user requested `superpowers:brainstorming`, `superpowers:writing-plans`, TDD, and subagent-driven execution. The user also approved continuing through final verification while they are away, so this spec makes the unresolved product choices explicit and proceeds with conservative defaults instead of blocking for another review gate.

## Product Behavior

The header gains a namespace selector near the app identity. It shows the current namespace, offers existing namespaces, and provides a compact create-namespace action. Selecting a different namespace refreshes the file explorer and report history, clears the selected script, and leaves any active run untouched.

The default namespace is `default`. It is always available, even when the bucket is empty. New installs start in `default`.

Namespaces contain scripts and folders independently. A script named `api/smoke.ts` in namespace `team-a` is separate from `api/smoke.ts` in namespace `team-b`.

The UI continues to display script and folder paths relative to the selected namespace. Users see `api/smoke.ts`, not `team-a/api/smoke.ts`, in the file explorer, editor breadcrumb, tab labels, and history list. The active runner badge may include the namespace as `team-a/api/smoke.ts` so the global run state is unambiguous.

## Namespace Validation

Namespace names are a single S3 path segment:

- Required after trimming.
- Must be 1 to 63 characters.
- Must match `^[A-Za-z0-9][A-Za-z0-9._-]*$`.
- Cannot contain `/`, `\`, path traversal segments, or whitespace.

Invalid namespace input returns `400` from namespace-aware APIs. Duplicate namespace creation is idempotent: creating an existing namespace returns success and keeps the namespace selected on the client.

## Storage Model

Scripts stay in the script bucket, but every object key is prefixed with the namespace:

```text
AWS_S3_BUCKET/default/smoke.ts
AWS_S3_BUCKET/team-a/api/smoke.ts
AWS_S3_BUCKET/team-a/api/.keep
```

Reports stay in the report bucket, also namespace-prefixed:

```text
k6-reports/team-a/api/smoke.ts-1790200000000.html
```

The existing script and report buckets remain separate. `AWS_S3_BUCKET` configures the script bucket name and defaults to `k6-scripts`; the report bucket defaults to `k6-reports` and remains internally named because the user only requested the script bucket env rename.

Namespace markers use `${namespace}/.keep`. File listing strips the namespace prefix and filters root `.keep`, so marker objects never appear as files.

## API Contracts

Namespace is supplied by query string for path-based routes and JSON body for mutation routes:

- `GET /api/namespaces` returns `{ namespaces: string[], current: string }`.
- `POST /api/namespaces` accepts `{ name: string }` and creates `${name}/.keep`.
- `GET /api/files?namespace=team-a` lists only `team-a/` script objects, strips the namespace prefix, and returns the existing `{ files, tree }` shape.
- `POST /api/files` accepts `{ namespace, name, content }` and stores `${namespace}/${name}`.
- `GET|PUT|DELETE /api/files/[...path]?namespace=team-a` operates on `${namespace}/${path}`.
- `POST|DELETE /api/files/folder` accepts `{ namespace, path }` and operates under that namespace.
- `POST /api/files/rename` and `POST /api/files/move` accept `namespace`, list and mutate only keys under that namespace, and keep reports accessible by moving namespace-relative report names within the same namespace.
- `GET /api/reports?namespace=team-a` returns report names relative to `team-a/`.
- `GET /api/reports/[name]?namespace=team-a` serves `${namespace}/${name}` from the report bucket.
- `POST /api/run` accepts `{ namespace, filename }`, reads `${namespace}/${filename}`, saves the report as `${namespace}/${filename}-${Date.now()}.html`, and streams the report name back without the namespace prefix.
- `GET /api/run/status` includes `namespace` in addition to the existing run status fields.

Missing namespace inputs normalize to `default` for backward compatibility.

## Run And Dashboard Behavior

Only one k6 run can execute globally, as before. The run lock stores both `namespace` and `script`.

The live dashboard mounts only when all of these are true:

- A script is selected.
- A run is active.
- The active run namespace equals the selected namespace.
- The active run script equals the selected script.

When a run is active in a different namespace or for another script, the dashboard tab shows the existing inactive state instead of mounting the iframe. This preserves the previously fixed behavior that avoids waiting on `/events` before mounting the k6 dashboard UI for the selected running script.

File move, rename, and delete protections apply only inside the active run namespace. A script path matching the active script in a different namespace is not disabled.

## Environment Variables

App S3 configuration uses AWS-style names:

```text
AWS_S3_BUCKET=k6-scripts
AWS_S3_ENDPOINT=localhost:9000
AWS_S3_ACCESS_KEY=minioadmin
AWS_S3_SECRET_KEY=minioadmin
AWS_S3_USE_SSL=false
```

`AWS_S3_ENDPOINT` includes the host and optional port. It may be either `host:port` or a URL such as `http://minio:9000`. `MINIO_PORT` is removed from app configuration.

For migration safety, server code may fall back to the old `MINIO_*` variables when the new variables are absent, but Docker Compose and `.env.example` must use the new names. `MINIO_ROOT_USER` and `MINIO_ROOT_PASSWORD` remain for the MinIO service itself because they are MinIO container variables, not app variables.

## UI Architecture

`AppShell` owns `selectedNamespace` and passes it to:

- `AppHeader` for display and namespace selection.
- `FileExplorer` for file API calls.
- `ScriptWorkspaceProvider` for run API calls and status comparisons.
- `EditorTab` and `ScriptEditor` for read/save.
- `TestHistoryTab` for report listing and iframe URLs.
- `LiveDashboardTab` indirectly through an `isActiveRun` boolean that includes namespace equality.

`NamespaceSelector` is a new controlled component in `src/components/layout/` or `src/components/namespace/`. It uses existing `Button`, `Input`, and `Dialog` primitives. It does not introduce a new dependency.

The selected namespace is persisted in `localStorage` after the client mounts. If the stored namespace no longer exists, the app falls back to `default`.

## Testing Strategy

Follow TDD for each implementation slice:

- Unit-test namespace normalization and key prefix/strip helpers before adding route code.
- Unit-test new S3 env parsing before changing `src/lib/minio.ts`.
- Route-test namespaced files, folders, move, rename, reports, and run behavior with mocked MinIO clients.
- Component-test that namespace changes update fetch URLs/bodies and clear selected script.
- Component-test that active-run dashboard and movement disabling require matching namespace.
- Add a focused Playwright scenario for creating a namespace, creating a script inside it, switching namespaces, and confirming isolation.

Final verification must run:

```bash
npx jest
npx tsc --noEmit
npm run lint
npm run build
docker compose down -v
docker compose up --build -d
npx playwright test --project=chromium
```

## Non-Goals

- No authentication or namespace permissions.
- No cross-namespace move or copy.
- No migration of existing root-level objects into `default`; existing root objects may remain invisible after namespacing unless a future migration is requested.
- No redesign of the app shell beyond the header namespace selector.
