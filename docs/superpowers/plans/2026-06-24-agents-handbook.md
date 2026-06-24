# AGENTS.md Handbook Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the minimal `AGENTS.md` with a practical repository handbook for AI agents working on k6 Studio Web.

**Architecture:** This is a documentation-only change. `AGENTS.md` remains the single repository-level instruction file and gains project context, commands, Docker/deployment notes, styling guidance, and feature cautions while preserving the existing Next.js warning at the top.

**Tech Stack:** Markdown, Next.js 15.5.19 App Router, TypeScript, Tailwind CSS, shadcn/Base UI, MinIO, k6, Docker Compose.

---

### Task 1: Expand AGENTS.md Handbook

**Files:**
- Modify: `AGENTS.md`
- Reference: `docs/superpowers/specs/2026-06-24-agents-handbook-design.md`

- [ ] **Step 1: Re-read the approved spec**

Run:

```bash
sed -n '1,260p' docs/superpowers/specs/2026-06-24-agents-handbook-design.md
```

Expected: The spec includes sections for project identity, architecture, commands, runtime, Docker/deployment, implementation conventions, styling guidance, and feature cautions.

- [ ] **Step 2: Replace AGENTS.md with the handbook**

Set `AGENTS.md` to exactly this content:

```markdown
<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# k6 Studio Web Agent Handbook

## Project

This repository builds `k6-studio-web`: a full-stack Next.js application for managing k6 load-test scripts in a browser. Users can browse script files, edit scripts, run k6, watch terminal output, view the live k6 dashboard, and browse saved HTML reports.

The product is intentionally local/deployment-internal for now. There is no authentication yet.

## Stack

- Next.js 15.5.19 with App Router under `src/app/`.
- React 19 and TypeScript in strict mode.
- Tailwind CSS 4 with shadcn/Base UI components.
- Monaco Editor for script editing.
- xterm.js for read-only terminal output.
- MinIO as local S3-compatible storage.
- k6 spawned by server-side API code.
- Docker Compose for local orchestration.

## Architecture Map

- `src/app/` contains App Router pages and API route handlers.
- `src/app/api/files/` manages script file and folder operations backed by MinIO.
- `src/app/api/run/` starts k6 runs and streams Server-Sent Events to the browser.
- `src/app/api/reports/` lists and serves saved HTML reports.
- `src/app/api/dashboard/` proxies the k6 live dashboard.
- `src/components/layout/` contains the app shell, header, panel headers, and status display.
- `src/components/file-explorer/` contains the sidebar tree and file/folder actions.
- `src/components/editor/` wraps Monaco.
- `src/components/terminal/` wraps xterm.js.
- `src/components/tabs/` assembles the editor, dashboard, and test-history views.
- `src/components/ui/` contains local shadcn/Base UI primitives. Prefer these before adding new primitives.
- `src/contexts/ScriptWorkspaceContext.tsx` coordinates selected scripts, per-script run sessions, and global run status polling.
- `src/lib/minio.ts` owns MinIO client creation and bucket setup.
- `src/lib/k6.ts` owns k6 process arguments, dashboard environment, process lifetime handling, and port release checks.
- `src/lib/run-lock.ts` owns the single-run lock.
- `Dockerfile` is the production deployment image path and must bundle k6.
- `docker-compose.yml` runs the local app plus MinIO stack.

## Commands

- `npm run dev` starts the Next.js development server and runs `scripts/generate-k6-types.mjs` first.
- `npm run build` creates a production build and runs `scripts/generate-k6-types.mjs` first.
- `npm run start` starts the production server after a build.
- `npm run lint` runs ESLint.
- `npx jest` runs the Jest test suite.
- `npx tsc --noEmit` runs TypeScript verification.

`package.json` currently has no `test` or `typecheck` script. Use the direct `npx` commands unless you add scripts deliberately.

## Runtime And Storage

- Scripts are stored in the MinIO bucket `k6-scripts`.
- HTML reports are stored in the MinIO bucket `k6-reports`.
- The app listens on port `3000`.
- The k6 web dashboard listens on port `5665`.
- MinIO API listens on port `9000`.
- MinIO console listens on port `9001`.
- Docker Compose server code should use `MINIO_ENDPOINT=minio`.
- Docker runtime should use `K6_BIN=/usr/local/bin/k6`.
- k6 dashboard host should be `0.0.0.0` inside containers.
- Local defaults use MinIO credentials `minioadmin` / `minioadmin`.

## Docker And Deployment

Treat `Dockerfile` as deployment-facing, not only local development scaffolding. The deployed image must include both the production Next.js app and the k6 binary.

Do not rely on host-installed k6 for server code, Docker behavior, or deployment documentation. In containers, use `K6_BIN=/usr/local/bin/k6`.

Do not hard-code `localhost` in server-side code that must also run inside Docker Compose. The app container reaches MinIO through the Compose service name `minio`.

Preserve the app port `3000` and dashboard port `5665` unless there is a coordinated architecture change. If Docker, k6, dashboard, or runtime environment behavior changes, validate with build-oriented commands rather than only `npm run dev`.

## Next.js Notes

This repository intentionally carries a strong Next.js warning because the installed framework version may differ from assumptions in model training data.

Before changing framework-sensitive code, read the relevant guide under `node_modules/next/dist/docs/` when that directory exists. In this checkout that directory may be absent; when it is absent, inspect the installed Next package version, existing code, and local behavior before relying on memory.

Existing App Router route handlers use async params, for example:

```ts
type Params = { params: Promise<{ path: string[] }> };
```

Keep route handlers server-only. Do not import browser-only APIs into server modules.

When reading bracketed App Router paths in zsh, quote them:

```bash
sed -n '1,220p' 'src/app/api/files/[...path]/route.ts'
```

## Implementation Conventions

Use existing local patterns before adding new abstractions. Keep changes scoped to the feature or bug being handled.

Prefer `@/` imports for source modules. Keep TypeScript strictness intact.

Use structured APIs and path handling instead of ad hoc string parsing where practical. Be especially careful with nested script paths.

For UI changes, use existing primitives from `src/components/ui/` and icons from `lucide-react` when an icon exists.

Do not overwrite unrelated dirty worktree changes. This repository often has active in-progress edits.

## Design Styling

This app is an operational load-testing tool. UI should be dense, scannable, and restrained, not a marketing site or decorative landing page.

Preserve the current editor/dashboard/terminal workflow: compact panels, tabs, resizable panes, stable toolbars, predictable action buttons, and readable status indicators.

Follow `src/app/globals.css` tokens and the existing `src/components/ui/` component style. Avoid unrelated palette shifts; preserve the current dark load-testing/control-room direction unless the task explicitly asks for a redesign.

Use lucide icons for common actions when available. Keep button labels and icon buttons from resizing or clipping across desktop and mobile widths.

Ensure responsive layouts do not overlap, hide important controls, clip labels, or resize unpredictably. Fixed-format elements such as sidebars, tab bars, terminal panes, and file rows should have stable dimensions and overflow behavior.

## Feature Cautions

Only one k6 run should execute at a time. Respect the run lock in `src/lib/run-lock.ts` and the run status API.

Terminal output is streamed with Server-Sent Events. Preserve the event framing expected by the client.

Reports are persisted to MinIO only after a run produces an HTML report. Keep report names safe for nested script names.

Folder support uses `.keep` sentinels for empty folders. Do not expose those sentinels as normal files in the UI.

The k6 dashboard port must be released before another run starts, otherwise the next run can race the previous process.

The live dashboard is served through the app so users do not need to open a separate k6 page.

## Before Coding

1. Check `git status --short` and avoid clobbering unrelated work.
2. Read the files directly involved in the task.
3. For Next.js-sensitive edits, verify current local behavior or docs instead of relying on memory.
4. For Docker/deployment-sensitive edits, consider both local host execution and Compose/container execution.
5. Run focused tests first, then broader verification when the change touches shared behavior.
```

- [ ] **Step 3: Verify the handbook content**

Run:

```bash
sed -n '1,260p' AGENTS.md
```

Expected: The file starts with the existing Next.js warning and includes the new handbook sections, including Docker/deployment and design styling.

- [ ] **Step 4: Check the diff is scoped**

Run:

```bash
git diff -- AGENTS.md docs/superpowers/plans/2026-06-24-agents-handbook.md
```

Expected: Only `AGENTS.md` and this plan file are changed by this implementation plan.

- [ ] **Step 5: Final verification**

Run:

```bash
rg -n "Docker And Deployment|Design Styling|Before Coding|k6 Studio Web Agent Handbook" AGENTS.md
```

Expected: All four section names are found.
