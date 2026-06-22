# k6 Studio v2 — Plan Review Round 1

**Date:** 2026-06-22  
**Plan:** docs/superpowers/plans/2026-06-22-k6-studio-v2.md

---

## Verdict Summary

| Persona | Verdict | Blockers | Concerns |
|---|---|---|---|
| Creative Engineer | APPROVE_WITH_CONCERNS | 0 | 8 |
| Pragmatic Engineer | APPROVE_WITH_CONCERNS | 0 | 7 |
| Solutions/System Architect | APPROVE_WITH_CONCERNS | 0 | 12 |
| QA Tester | APPROVE_WITH_CONCERNS | 0 | 10 |
| EPM | APPROVE_WITH_CONCERNS | 0 | 8 |
| DevSecOps/Security | APPROVE_WITH_CONCERNS | 0 | 10 |
| UX/UI Designer | APPROVE_WITH_CONCERNS | 0 | 12 |
| SRE/DevOps | APPROVE_WITH_CONCERNS | 0 | 8 |
| Data Engineer/BA | **BLOCK** | **2** | 6 |

**Overall: BLOCK → downgraded to APPROVE_WITH_CONCERNS after spec arbitration**

---

## Blocker Resolutions

### Data Engineer Blocker 1 — "jsonUrl is NDJSON, not parseable JSON"

**Decision: RESOLVED — spec-designed behavior.**

Spec line 214 explicitly states `--out json=<file>` is k6's built-in NDJSON metrics format. "Run comparison / trend view" is a Non-Goal. Plan fix: added clarifying comment in `buildReportsTree` noting the NDJSON format.

### Data Engineer Blocker 2 — "Reports tree advertises jsonUrl/metaUrl without checking existence"

**Decision: RESOLVED — spec-designed behavior.**

Spec line 333 explicitly states `"jsonUrl": "/reports/<path>.json" (may 404 if run was stopped before json flush)`. Dangling URLs are intentional. Plan fix: added code comment referencing spec intent.

---

## Concerns Fixed in Plan

| ID | Concern | Fix applied |
|---|---|---|
| F1 | `isRunning` set after awaits — race condition | Set `isRunning = true` synchronously before first `await` |
| F2 | SSE line contains `\r\n` — protocol injection | Added `line.replace(/[\r\n]/g, ' ')` before SSE write |
| F3 | `process.env` spread into k6 spawn env | Replaced with explicit allowlist of required vars only |
| F4 | DELETE bypasses `validatePath` | Routed through `validatePath()` accepting files+dirs |
| F5 | `startsWith` prefix false positive in delete/running check | Changed to `=== resolved \|\| startsWith(resolved + sep)` |
| F6 | Stopped run recorded as `thresholdsFailed: true` | Added `stopped` field; `thresholdsFailed` only true when `exitCode !== 0 && !stopped` |
| F7 | CSP `sandbox` blocks k6 HTML dashboard JS | Changed to `sandbox allow-scripts` |
| F8 | `wget` not guaranteed in `node:20-alpine` | Added `apk add --no-cache wget` to both Dockerfiles |
| F9 | `innerHTML` injection for dynamic tree labels | Changed to `textContent` assignment |
| F10 | `buildTree` / `buildReportsTree` — no recursion depth cap | Added `depth` param with early return at `> MAX_DEPTH` |
| F11 | `expandedDirs` keys on `node.name` not path | Changed to full relative path as key |
| F12 | Duplicate output on reconnect (SSE replay + /api/output) | Removed ring-buffer replay from SSE; backfill via `/api/output` only |
| F13 | Meta sidecar missing `endedAt`, `truncated`, `stopped` | Added all three fields |
| F14 | Health check missing `timeout` | Added `timeout: 3s` to both health checks |
| F15 | `aria-label` duplicated on row and child button | Removed from non-interactive row div |
| F16 | `aria-live="polite"` on status badge fires twice | Removed from `#run-status`; announce region is sole live region |
| F17 | Modal close does not restore focus to trigger | Added `returnFocus` capture/restore to `openModal`/`closeModal` |
| F18 | SSE proxy client disconnect not propagated upstream | Added `req.on('close', () => proxyReq.destroy())` |
| F19 | 413 body-too-large not mapped to `{error:"payload_too_large"}` | Added Express error middleware for `entity.too.large` |
| F20 | README / .gitignore not in any task | Added as steps in Task 6 |
| F21 | Focus indicators missing (`button:focus-visible`) | Added `:focus-visible` CSS rule |

---

## Concerns Accepted (no plan change)

| Concern | Decision |
|---|---|
| Keyboard tree navigation (roving tabindex) | Spec requirement noted; marked as TODO in Task 4; manual checklist notes it is out of scope for automated verification |
| SSE poll redundant alongside SSE `done` | Belt-and-suspenders for reconnect; kept with explanatory comment |
| `depends_on: service_healthy` tight coupling | Spec-defined; 503 fallback handles runner restarts |
| CPU/memory limits on k6 service | Deferred to v2; local dev tool |
| Default boilerplate `TARGET_URL` fails in most environments | Intentional; user edits script |
| Crash/SIGKILL produces orphan reports | Acceptable; deferred to v2 |
| Timestamp collision (1s resolution) | Low probability for a single-user tool; runId in meta distinguishes runs |
| CI/CD pipeline | Spec Non-Goal |
| Report retention | Spec Non-Goal |
| Image digest pinning | Exact tag pinning sufficient; digest pinning noted as optional hardening |

---

## Round Result

**Consensus: APPROVE_WITH_CONCERNS — no BLOCKs remain.**

21 concerns fixed in the plan. All blockers resolved against the spec. Proceeding to human gate.
