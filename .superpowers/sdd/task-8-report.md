# Task 8 Report: Live Dashboard Tab

**Status:** Complete  
**Branch:** feat/k6-studio-web  
**Commit:** c0bdb69  
**Base commit:** 7a27b72 (Task 7)

## Summary

Built `LiveDashboardTab` — a self-contained tab that probes `/api/dashboard/` for availability, then embeds k6's live web dashboard in an iframe via a Next.js catch-all proxy. Updated `buildK6Command` to pass `port` in the `web-dashboard` output so k6 listens on the configured port (default 5665).

## Files Created / Modified

| File | Purpose |
|------|---------|
| `k6-studio-web/src/app/api/dashboard/[[...path]]/route.ts` | Catch-all proxy to k6 dashboard HTTP server |
| `k6-studio-web/src/components/tabs/LiveDashboardTab.tsx` | Availability check + iframe embed |
| `k6-studio-web/src/components/tabs/__tests__/LiveDashboardTab.test.tsx` | Iframe render test with mocked fetch |
| `k6-studio-web/src/lib/k6.ts` | Added `port` to `web-dashboard` output arg |

## TDD Steps Followed

1. Wrote failing test → confirmed `Could not locate module @/components/tabs/LiveDashboardTab`
2. Implemented dashboard proxy route and `LiveDashboardTab` component
3. Added `@testing-library/jest-dom` import (project convention; omitted in brief)
4. LiveDashboardTab test PASS (1/1)
5. Updated `buildK6Command` with dashboard port
6. k6.test.ts PASS (1/1)
7. `page.tsx` left at Next.js default (no smoke-test modification; nothing to revert)
8. Committed Task 8 files only

## Test Results

### Unit Tests

```
Test Suites: 7 passed, 7 total
Tests:       8 passed, 8 total
```

- `LiveDashboardTab.test.tsx` — renders iframe with `src="/api/dashboard/"` when proxy responds ok
- `k6.test.ts` — `buildK6Command` includes report path and `web-dashboard` with port
- All prior task tests — regression pass

### Browser Smoke Test

Not run — requires k6 running with `--out web-dashboard` during an active test. Proxy returns 503 when dashboard is down; component shows "k6 dashboard is not running" message per spec.

## Interfaces Delivered

```ts
// No props — self-contained
export default function LiveDashboardTab(): JSX.Element;
```

## Concerns / Notes

1. **No browser smoke test** — Live dashboard requires an active k6 run; deferred until Task 9 shell or Task 10 Docker stack.
2. **Proxy header forwarding** — All request headers forwarded to upstream; may need filtering (e.g. `host`) if iframe assets break in production.
3. **Dashboard availability race** — Component probes once on mount; switching tabs during a run may show stale "not running" if probed before k6 starts dashboard server.
4. **Port config** — `K6_DASHBOARD_PORT` env var must match between `buildK6Command` and proxy route (both default to 5665).

## Next Task Dependencies

Task 9 can consume:

```tsx
import LiveDashboardTab from "@/components/tabs/LiveDashboardTab";

<LiveDashboardTab />
```
