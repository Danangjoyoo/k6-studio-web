# k6 Studio v2 — FGD Round 1 Review Resolution
**Date:** 2026-06-22  
**Spec:** `docs/superpowers/specs/2026-06-22-k6-studio-v2-design.md`  
**Verdict:** APPROVE_WITH_CONCERNS (all 9 personas, no BLOCKs)  
**Outcome:** Spec updated in-place; proceeding to implementation.

---

## Participating Personas

| Persona | Verdict |
|---|---|
| Creative Engineer | APPROVE_WITH_CONCERNS |
| Pragmatic Engineer | APPROVE_WITH_CONCERNS |
| System Architect | APPROVE_WITH_CONCERNS |
| QA Tester | APPROVE_WITH_CONCERNS |
| Engineering/Product Manager | APPROVE_WITH_CONCERNS |
| Security Engineer | APPROVE_WITH_CONCERNS |
| UX/UI Designer | APPROVE_WITH_CONCERNS |
| SRE/DevOps | APPROVE_WITH_CONCERNS |
| Data Engineer | APPROVE_WITH_CONCERNS |

---

## Resolution Table

| ID | Persona | Severity | Finding | Decision |
|---|---|---|---|---|
| R1-01 | Pragmatic / Architect | CRITICAL | Path validation regex rejects `.js` files (segments-only regex applied to full filename) | ACCEPT — two distinct regexes: `SEGMENT=/^[a-zA-Z0-9_-]+$/`, `SCRIPT_FILE=/^[a-zA-Z0-9_-]+\.js$/`; applied per-segment with final segment matched against SCRIPT_FILE |
| R1-02 | UX | CRITICAL | Sidebar tree has no keyboard model (no arrow-key navigation, Enter to open, roving tabindex) | ACCEPT — add roving tabindex, arrow-key tree navigation, Enter to open/expand |
| R1-03 | UX | CRITICAL | `×` delete buttons have no accessible name (`aria-label` missing) | ACCEPT — add `aria-label="Delete <name>"` to all delete buttons |
| R1-04 | UX | CRITICAL | `aria-live="polite"` on output panel floods screen readers with every k6 log line | ACCEPT — set output panel to `aria-live="off"`; add separate `aria-live="assertive"` status region for state changes (run started/stopped/error) only |
| R1-05 | Pragmatic / SRE | HIGH | SSE proxy: response buffering/compression not addressed; risk of no-flush or memory leak | ACCEPT — spec mandates: `res.setHeader('X-Accel-Buffering', 'no')`, `res.setHeader('Cache-Control', 'no-cache')`, disable compression on SSE route, `res.flushHeaders()` immediately |
| R1-06 | QA / Creative | HIGH | SSE reconnect contract undefined — new subscriber after reconnect gets no buffer replay | ACCEPT — `/stream` replays ring buffer to new subscriber as `data:` lines before switching to live push |
| R1-07 | QA | HIGH | DELETE running-script detection: spec says 409 but doesn't say how web-ui knows a run is active | ACCEPT — web-ui proxies `GET /api/status` at request time; if `status !== 'idle'` and script matches, return 409 |
| R1-08 | SRE | HIGH | `.dockerignore` missing from both `web-ui/` and `k6/` build contexts | ACCEPT — add `node_modules/`, `.env`, `tests/` (web-ui only) to each `.dockerignore`; included in directory layout |
| R1-09 | UX | HIGH | `[+S]` / `[+D]` button labels are cryptic | ACCEPT — rename to `[+ Script]` / `[+ Folder]` in layout diagram and implementation |
| R1-10 | UX | HIGH | Focus does not return to trigger element after modal closes | ACCEPT — capture `document.activeElement` before opening modal; restore on close/cancel |
| R1-11 | UX | HIGH | Unsaved-switch modal: focus must land on a safe option | ACCEPT — autofocus `[Save & Switch]` (safe), not Discard |
| R1-12 | UX | HIGH | Toast messages have no ARIA role | ACCEPT — add `role="status"` to toast container |
| R1-13 | UX | HIGH | `window.open` for reports has no accessible new-tab warning | ACCEPT — add `aria-label="Open <name> in new tab"` to report links |
| R1-14 | Architect / Pragmatic | HIGH | K6_TARGET_URL and K6_EXTRA_HOSTS in web-ui env block — web-ui never uses them | ACCEPT — remove both from web-ui environment block; keep K6_TARGET_URL only in k6 environment |
| R1-15 | SRE | MEDIUM | `node:20-alpine` and `grafana/k6:0.55.0` unpinned by digest | ACCEPT — add note: pin to digest in production; document update procedure in README |
| R1-16 | SRE | MEDIUM | k6 service missing `init: true` — Node runs as PID 1; orphaned subprocess risk on OOM | ACCEPT — add `init: true` to k6 service in compose spec |
| R1-17 | SRE | MEDIUM | `./tests` directory not pre-created | ACCEPT — add bootstrap step to README: `mkdir -p tests/reports` |
| R1-18 | Architect | MEDIUM | No `stopping` state in status enum | ACCEPT — add `stopping` to status values: `idle | running | stopping` |
| R1-19 | Architect | MEDIUM | SSE fan-out: no backpressure / no connection cap | ACCEPT — cap concurrent SSE clients at 5; drop oldest on overflow |
| R1-20 | Security | HIGH | `/reports/*` static HTML served same-origin — XSS via crafted upload | ACCEPT (mitigated for localhost) — add `Content-Security-Policy: sandbox`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY` on all `/reports/*` responses |
| R1-21 | Security | HIGH | No Content-Security-Policy on main UI | ACCEPT — add CSP to `index.html` response: `default-src 'self'; script-src 'self' 'unsafe-eval'; style-src 'self' 'unsafe-inline'` |
| R1-22 | Security | MEDIUM | No CSRF protection on mutating endpoints | ACCEPT — require `X-Requested-With: XMLHttpRequest` on all POST/PUT/DELETE; return 403 if absent |
| R1-23 | Security / Pragmatic | MEDIUM | Body size limit not confirmed | ACCEPT — explicitly state 256 KB limit on request bodies |
| R1-24 | Security | MEDIUM | Path validation only at web-ui; k6 runner accepts any name | ACCEPT — runner.js validates `name` against path-safe regex before exec |
| R1-25 | Data | HIGH | k6 NDJSON schema not referenced | ACCEPT — add note referencing k6.io/docs/results-output/real-time/json |
| R1-26 | Data | HIGH | No run-level metadata persisted (runId, exitCode, thresholds) | ACCEPT — runner.js writes `<base>-<ts>.meta.json` sidecar: `{runId, script, startedAt (ISO UTC), exitCode, thresholdsFailed}` |
| R1-27 | Data | MEDIUM | Reports API only exposes HTML URL | ACCEPT — file nodes include `htmlUrl`, `jsonUrl`, `metaUrl` |
| R1-28 | Data | MEDIUM | Timestamps timezone ambiguous | ACCEPT — all timestamps UTC; meta.json `startedAt` is ISO 8601 UTC |
| R1-29 | EPM | HIGH | Default K6_TARGET_URL misleading for new users | ACCEPT — `.env.example` explains it is a sample value that must be overridden |
| R1-30 | EPM | MEDIUM | k6 crash mid-run leaves `isRunning = true` | ACCEPT — subprocess `on('error')` and `on('close')` both reset state |
| R1-31 | UX | MEDIUM | Emoji icons not `aria-hidden` | ACCEPT — add `aria-hidden="true"` to all decorative emoji |
| R1-32 | UX | MEDIUM | `[?]` button has no `aria-label` | ACCEPT — add `aria-label="Keyboard shortcuts"` |
| R1-33 | UX | MEDIUM | Status badge communicates state by color only | ACCEPT — badge includes text label (Running / Stopping / Idle); color is additive |
| R1-34 | UX | MEDIUM | Report timestamps in sidebar are machine-readable filenames only | ACCEPT — display human-readable date as visible label; filename in `title` attribute |
| R1-35 | UX | MEDIUM | Monaco needs screen reader mode hint | ACCEPT — editor container gets `aria-label="Script editor. Press F1 for command palette."` |
| R1-36 | SRE | LOW | k6 HTML report not written on SIGKILL | ACCEPT — sidebar shows `"(no report)"` for runs with meta.json but no HTML |
| R1-37 | SRE / EPM | LOW | Report directory grows indefinitely | ACCEPT — document manual cleanup; `REPORT_RETENTION_DAYS` deferred to v2 |
| R1-38 | Creative | HIGH | Monaco AMD loader is legacy | DEFER v2 — AMD loader works for MVP; noted as migration target |
| R1-39 | Creative | HIGH | Live terminal metrics charts | DEFER v2 |
| R1-40 | Creative | HIGH | AI-assisted script authoring | DEFER v2 |
| R1-41 | EPM | HIGH | Rename/move operations | DEFER v2 |
| R1-42 | Architect | LOW | Dashboard link dead when idle | ACCEPT — button shows tooltip when idle; not disabled |

---

## Changes Applied to Spec

All ACCEPT items are reflected in the updated spec. Key additions:

1. **`docker-compose.yml`:** Removed K6_TARGET_URL / K6_EXTRA_HOSTS from web-ui env; added `init: true` to k6 service.
2. **Path validation:** Two-regex rule (`SEGMENT` + `SCRIPT_FILE`); applied at both web-ui and k6 layers; explicit 400 for >5 depth.
3. **Status enum:** `idle | running | stopping`.
4. **SSE spec:** Ring buffer replay on connect; 5-client cap; mandatory `flushHeaders` / no-compression directives.
5. **Security headers:** CSP on UI response; sandbox + nosniff on `/reports/*`; `X-Requested-With` CSRF guard; 256 KB body limit.
6. **Meta sidecar:** `<base>-<ts>.meta.json` after each run.
7. **Reports tree:** File nodes include `htmlUrl`, `jsonUrl`, `metaUrl`; human-readable timestamps in sidebar.
8. **Accessibility:** Roving tabindex, aria-label on `×`, aria-live redesign, focus restoration, toast `role="status"`.
9. **`.dockerignore`** included in directory layout.
10. **`init: true`** on k6 service.
11. **`stopping` state** in state machine.
12. **Body size limit** (256 KB) explicit.
13. **k6 runner-side path validation** in runner.js spec.

---

## Deferred to v2

- Monaco ESM migration
- Live terminal metrics charts
- AI-assisted script authoring
- Script rename/move operations
- `REPORT_RETENTION_DAYS` auto-cleanup
- Per-run K6_TARGET_URL override in UI
- Run comparison / trend view
