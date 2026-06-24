# AGENTS.md Handbook Design

## Goal

Update `AGENTS.md` into a practical base-knowledge handbook for AI agents working in this repository. The handbook should help agents make correct local decisions without duplicating every implementation detail from existing plans and source files.

## Scope

The update covers repository-level guidance only. It does not change application code, package scripts, Docker files, tests, or feature behavior.

## Structure

The existing Next.js warning remains at the top because this repository uses Next.js 15.5.19 and agents must not rely on stale framework assumptions. The expanded handbook adds these sections:

- Project identity and purpose.
- Architecture and important directories.
- Local commands and verification.
- Runtime dependencies and environment variables.
- Docker and deployment guidance.
- Implementation conventions.
- Design styling conventions.
- Feature-specific cautions.
- Before-coding checklist for future agents.

## Content Requirements

The handbook should state that `k6-studio-web` is a full-stack Next.js App Router application for editing k6 scripts, running k6, streaming terminal output, embedding the live dashboard, and browsing saved HTML reports.

It should describe the main architecture:

- `src/app/` contains App Router pages and API route handlers.
- `src/components/` contains UI, layout, editor, terminal, file explorer, and tab components.
- `src/contexts/ScriptWorkspaceContext.tsx` coordinates selected scripts, run sessions, and global run status.
- `src/lib/minio.ts` owns MinIO client and bucket setup.
- `src/lib/k6.ts` owns k6 process execution and dashboard environment.
- `docker-compose.yml` orchestrates the local app and MinIO stack.
- `Dockerfile` is the production deployment image path and must include the k6 binary.

It should document current commands:

- `npm run dev`
- `npm run build`
- `npm run lint`
- `npx jest`
- `npx tsc --noEmit`

It should also note that `package.json` currently has no `test` or `typecheck` script, so agents should use direct `npx` commands unless scripts are added.

## Runtime and Storage

The handbook should document the current runtime assumptions:

- MinIO script bucket: `k6-scripts`.
- MinIO report bucket: `k6-reports`.
- Local app port: `3000`.
- k6 web dashboard port: `5665`.
- MinIO API port: `9000`.
- MinIO console port: `9001`.
- Docker Compose server code should use `MINIO_ENDPOINT=minio`.
- Docker runtime should use `K6_BIN=/usr/local/bin/k6`.
- k6 dashboard host should be `0.0.0.0` inside containers.
- Authentication is intentionally absent for now.

## Docker and Deployment Guidance

The handbook should make Docker guidance explicit because the image will be used for deployment later:

- Treat `Dockerfile` as deployment-facing, not only local development scaffolding.
- Keep the Next.js production build and bundled k6 binary compatible.
- Do not rely on host-installed k6 in server code or deployment docs.
- Avoid hard-coded `localhost` assumptions in server code that must also run inside Docker Compose.
- Validate Docker-related changes with build-oriented commands, not only `next dev`.
- Preserve the `3000` app port and `5665` dashboard port unless there is a coordinated architecture change.

## Implementation Conventions

The handbook should include repo-specific coding guidance:

- Read relevant local Next docs under `node_modules/next/dist/docs/` before coding when that directory exists.
- If that docs path is absent, inspect the installed package version and existing code before relying on memory.
- App Router route handler params are async in existing code, for example `params: Promise<{ path: string[] }>`.
- Quote bracketed paths in zsh commands, such as `'src/app/api/files/[...path]/route.ts'`.
- Keep route handlers server-only and avoid browser-only APIs in server modules.
- Use existing Tailwind, shadcn, Base UI, and lucide-react patterns.
- Do not overwrite unrelated dirty worktree changes.

## Design Styling Guidance

The handbook should state that this app is an operational load-testing tool, so UI work should be dense, scannable, and restrained. Agents should keep compact panels, tabbed workflows, resizable panes, editor/terminal ergonomics, stable dimensions, and predictable action controls.

Styling should follow `src/app/globals.css` tokens and existing `src/components/ui` conventions. Agents should use lucide icons for actions when available, avoid unrelated palette shifts, preserve the current dark load-testing/control-room direction, and ensure responsive layouts do not overlap, clip labels, or resize unpredictably. This app should not become a decorative landing page.

## Feature-Specific Cautions

The handbook should call out these implementation risks:

- Only one k6 run should execute at a time; respect the run lock.
- Terminal output is streamed with Server-Sent Events.
- Reports are persisted to MinIO after a run when an HTML report exists.
- Folder support uses `.keep` sentinels for empty folders.
- The dashboard port must be released before allowing another run.
- Nested script names need safe path handling.

## Acceptance Criteria

The final `AGENTS.md` should be understandable as a standalone handoff for future AI agents, stay concise enough to scan, preserve the existing Next.js warning, and avoid claims that conflict with the current package scripts or source layout.
