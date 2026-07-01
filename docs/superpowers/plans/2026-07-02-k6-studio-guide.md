# k6 Studio Guide Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a cheerful Markdown guide explaining k6 Studio Web, supported by fresh screenshots saved under `images/`.

**Architecture:** Add a local Playwright screenshot script that starts the app, mocks deterministic browser API responses, captures representative screens, and shuts down cleanly. Add one user-facing Markdown guide under `docs/` that embeds those screenshots and explains usage, benefits, and workflows.

**Tech Stack:** Node.js script, local `@playwright/test` Chromium package, Next.js dev server, Markdown.

---

### Task 1: Screenshot Capture Script

**Files:**
- Create: `scripts/capture-guide-screenshots.mjs`
- Output: `images/guide-*.png`

- [x] **Step 1: Add screenshot script**

Create a script that:
- starts `npm run dev -- -p 3010`
- waits for `http://127.0.0.1:3010/k6`
- uses Playwright Chromium
- mocks `/k6/api/namespaces`, `/k6/api/files`, `/k6/api/reports`, `/k6/api/run/status`, and live-dashboard endpoints
- captures screenshots into `images/`
- kills the server in `finally`

- [x] **Step 2: Run screenshot script**

Run: `node scripts/capture-guide-screenshots.mjs`

Expected:
- `images/guide-workspace.png`
- `images/guide-builder.png`
- `images/guide-history.png`
- `images/guide-live-dashboard.png`

### Task 2: Markdown Guide

**Files:**
- Create: `docs/k6-studio-web-guide.md`

- [x] **Step 1: Write the guide**

Create a cheerful Markdown guide with:
- what k6 Studio Web is
- benefits
- quick start
- workflow sections for namespaces, file explorer, editor, script builder, running tests, live dashboard, history, and notes
- screenshot gallery using relative links to `../images/guide-*.png`
- troubleshooting tips

- [x] **Step 2: Verify links and formatting**

Run:
- `test -f docs/k6-studio-web-guide.md`
- `test -f images/guide-workspace.png`
- `test -f images/guide-builder.png`
- `test -f images/guide-history.png`
- `test -f images/guide-live-dashboard.png`
- `rg "../images/guide-" docs/k6-studio-web-guide.md`

Expected: all commands exit 0 and the guide references all four screenshots.

### Task 3: Verification

**Files:**
- Read: `docs/k6-studio-web-guide.md`
- Read: `scripts/capture-guide-screenshots.mjs`

- [x] **Step 1: Run documentation-safe checks**

Run:
- `node scripts/capture-guide-screenshots.mjs`
- `git diff --check`

Expected: screenshot script exits 0 and whitespace check exits 0.

- [x] **Step 2: Record final status**

Run:
- `git status --short`
- `git diff --stat`

Expected: changes include the new guide, screenshot script, guide screenshots, and pre-existing dirty files remain untouched.
