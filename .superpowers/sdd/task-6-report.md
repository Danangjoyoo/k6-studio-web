# Task 6 Report: Explorer Move E2E Coverage

**Status:** Complete
**Branch:** feat/k6-studio-web
**Implementation commit:** 90a76b3
**Base commit:** d8e505c

## Summary

Added Playwright coverage for the file explorer move workflows:

- dragging a script into a folder
- rejecting duplicate destination moves while preserving source and destination
- preserving and opening moved report history
- preventing movement of the currently running script

The E2E drag helper now waits for the real `POST /api/files/move` response and asserts the submitted payload. The history test selects the moved report, verifies `/api/reports/...` returns `200`, and checks iframe content from the deterministic fixture.

## Files Changed

| File | Purpose |
|------|---------|
| `e2e/k6-studio.spec.ts` | Added explorer move workflow E2E tests and move/report helpers |

## Focused Playwright Verification

Implementation worker verification:

```bash
PLAYWRIGHT_BASE_URL=http://localhost:3100 npx playwright test e2e/k6-studio.spec.ts --project=chromium -g "drag moves|duplicate move|history remains|running script cannot"
```

Result: PASS, `4 passed`.

Independent quality-review verification:

```bash
PLAYWRIGHT_BASE_URL=http://localhost:3101 npx playwright test e2e/k6-studio.spec.ts --grep "drag moves|duplicate move|history remains|running script cannot"
```

Result: PASS, `4/4`.

Both runs targeted a freshly started app server from the current checkout. Existing port `3000` appeared stale during verification, so the focused runs used fresh dev servers on `3100` and `3101`.

## Additional Verification

```bash
npx tsc --noEmit
npm run lint
npx jest --runInBand
git diff --check
```

Result: PASS.

## Notes

- The history E2E uses a deterministic report fixture because live k6 report export emitted a report-save warning in this environment during earlier checks. This keeps the test focused on move/history accessibility while avoiding unrelated k6 export instability.
- Direct MinIO report fixture seeding is guarded to local app URLs, or explicit `PLAYWRIGHT_ALLOW_DIRECT_MINIO_FIXTURES=true`, to avoid accidentally seeding a different MinIO instance from a remote Playwright target.
- Browser drag uses `locator.dragTo(...)` first and falls back to real mouse movement if Chromium does not emit the move request. The helper still requires the real `/api/files/move` response and asserts the request payload.
