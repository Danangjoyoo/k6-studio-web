# k6 Studio Web — Implementation Plan (Master)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a fullstack Next.js web application (`k6-studio-web`) that lets users manage, edit, run k6 load-test scripts, view live dashboards, and browse historical test reports — all in a single browser UI.

**Architecture:** Next.js 15 App Router with TypeScript serves both the UI and API routes. Files and reports are persisted in MinIO (S3-compatible). k6 is co-located in the Docker image; API routes spawn it as a child process and stream stdout/stderr to the browser via Server-Sent Events. The entire stack is orchestrated with Docker Compose.

**Tech Stack:**
- Next.js 15 (App Router), TypeScript, Tailwind CSS, shadcn/ui
- Monaco Editor (`@monaco-editor/react`) for script editing
- MinIO Node SDK (`minio`) for object storage
- Server-Sent Events for real-time terminal streaming
- Docker + Docker Compose (Next.js app + MinIO service)
- k6 binary bundled inside the app Docker image

## Global Constraints

- Node.js ≥ 20
- Next.js 15 with App Router (`src/app/`)
- TypeScript strict mode (`"strict": true`)
- Tailwind CSS for all styling — no inline styles, no CSS Modules
- shadcn/ui component library (`npx shadcn@latest add ...`)
- MinIO bucket name: `k6-scripts` (scripts) and `k6-reports` (HTML reports)
- MinIO endpoint in Docker Compose: `minio:9000`, env var: `MINIO_ENDPOINT`
- k6 binary path inside container: `/usr/local/bin/k6`
- No authentication required (public access within Docker network)
- ESLint + Prettier enforced; all code must pass `next lint` and `tsc --noEmit`

---

## File Map

| File | Responsibility |
|------|---------------|
| `docker-compose.yml` | Orchestrate app + MinIO services |
| `Dockerfile` | Bundle Next.js + k6 binary |
| `src/lib/minio.ts` | MinIO client singleton + bucket helpers |
| `src/lib/k6.ts` | Spawn k6 child process, yield output lines |
| `src/app/api/files/route.ts` | `GET` list scripts, `POST` create script |
| `src/app/api/files/[name]/route.ts` | `GET` read, `PUT` save, `DELETE` delete script |
| `src/app/api/run/route.ts` | `POST` start k6 run, stream SSE |
| `src/app/api/reports/route.ts` | `GET` list HTML reports |
| `src/app/api/reports/[name]/route.ts` | `GET` serve HTML report content |
| `src/components/layout/AppShell.tsx` | Root layout: sidebar + main area |
| `src/components/file-explorer/FileExplorer.tsx` | Left-panel file tree |
| `src/components/file-explorer/FileItem.tsx` | Single file row with actions |
| `src/components/editor/ScriptEditor.tsx` | Monaco editor wrapper |
| `src/components/terminal/Terminal.tsx` | Read-only SSE terminal |
| `src/components/tabs/EditorTab.tsx` | Editor + Terminal assembled |
| `src/components/tabs/LiveDashboardTab.tsx` | iframe for k6 live dashboard |
| `src/components/tabs/TestHistoryTab.tsx` | Report list + viewer |
| `src/app/page.tsx` | Entry: render AppShell |

---

## Task Index

| # | Task | Deliverable |
|---|------|-------------|
| 1 | [Project Scaffolding](./task-1.md) | Next.js project boots, Docker Compose runs |
| 2 | [MinIO Storage Layer](./task-2.md) | API routes for file CRUD backed by MinIO |
| 3 | [File Explorer](./task-3.md) | Sidebar lists/creates/deletes scripts |
| 4 | [Monaco Editor + Save](./task-4.md) | Edit and save scripts to MinIO |
| 5 | [k6 Runner + SSE Terminal](./task-5.md) | Run k6, stream output to read-only terminal |
| 6 | [Editor Tab Assembly](./task-6.md) | Editor + Terminal + Run/Save buttons combined |
| 7 | [Test History Tab](./task-7.md) | List HTML reports, view in panel |
| 8 | [Live Dashboard Tab](./task-8.md) | Embed k6 live dashboard via iframe |
| 9 | [Main Layout Integration](./task-9.md) | Sidebar + Tab navigation wired together |
| 10 | [Dockerfile + Deployment](./task-10.md) | Production Dockerfile bundling k6 |

---

## Execution Order

Tasks are sequential; each task assumes all previous tasks are complete.

```
1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10
```
