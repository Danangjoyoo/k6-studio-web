# Task 2 Report: MinIO Storage Layer

**Status:** Complete  
**Branch:** feat/k6-studio-web  
**Base commit:** 18d7509 (Task 1)

## Summary

Implemented the MinIO client singleton, bucket initialisation helpers, and all file/report API routes for k6 Studio Web.

## Files Created

| File | Purpose |
|------|---------|
| `k6-studio-web/src/lib/minio.ts` | MinIO client singleton, bucket constants, `ensureBuckets()` |
| `k6-studio-web/src/lib/__tests__/minio.test.ts` | Unit test for client factory |
| `k6-studio-web/jest.config.ts` | Jest config with `@/` path alias |
| `k6-studio-web/src/app/api/files/route.ts` | GET list, POST create |
| `k6-studio-web/src/app/api/files/[name]/route.ts` | GET read, PUT update, DELETE |
| `k6-studio-web/src/app/api/reports/route.ts` | GET report list |
| `k6-studio-web/src/app/api/reports/[name]/route.ts` | GET report HTML |

## Dependencies Added

- `jest`, `ts-jest`, `ts-node`, `@types/jest`
- `@testing-library/react`, `@testing-library/jest-dom`, `jest-environment-jsdom` (per brief)

## TDD Steps Followed

1. Created failing test → confirmed `Cannot find module '@/lib/minio'`
2. Implemented `minio.ts` → unit test PASS (1/1)
3. Implemented all API routes per brief
4. Integration-tested with `docker compose up minio -d`

## Test Results

### Unit Tests

```
Test Suites: 1 passed, 1 total
Tests:       1 passed, 1 total
```

### Integration Tests (curl against localhost:3000)

| Endpoint | Expected | Actual |
|----------|----------|--------|
| POST /api/files | 201 `{"name":"hello.js"}` | PASS |
| GET /api/files | 200 with file list | PASS |
| GET /api/files/hello.js | 200 with content | PASS |
| PUT /api/files/hello.js | 200 `{"name":"hello.js"}` | PASS |
| DELETE /api/files/hello.js | 204 | PASS |
| GET /api/files (after delete) | 200 `{"files":[]}` | PASS |
| GET /api/reports | 200 `{"reports":[]}` | PASS |
| GET /api/reports/test.html | 200 HTML, Content-Type: text/html | PASS |

### Build

`npm run build` — compiled successfully; all 4 API routes listed as dynamic.

## Interfaces Delivered

```ts
// GET /api/files → { files: { name, size, lastModified }[] }
// POST /api/files → body { name, content } → 201 { name }
// GET /api/files/[name] → { name, content }
// PUT /api/files/[name] → body { content } → 200 { name }
// DELETE /api/files/[name] → 204
// GET /api/reports → { reports: { name, size, lastModified }[] }
// GET /api/reports/[name] → HTML (Content-Type: text/html)
```

## Concerns / Notes

1. **ts-node required** — Jest needs `ts-node` to parse `jest.config.ts`; not listed in brief but installed to unblock config loading.
2. **No folder prefix support** — `listObjects` uses flat prefix `""`; folder tree in UI (Task 3+) may need prefix-based listing.
3. **No validation on PUT/DELETE** — missing files on PUT succeed (create-or-replace); DELETE on missing object may error from MinIO (not caught).
4. **Dev + build conflict** — running `next build` while `next dev` is active corrupts `.next`; restart dev after build.
5. **No auth** — intentional per spec; all routes are open.

## Next Task Dependencies

Task 3 (File Explorer UI) can consume:
- `GET /api/files` for listing
- `POST /api/files` for save
- `GET /api/files/[name]` for load
- `DELETE /api/files/[name]` for delete
