# k6 Studio Web

Browser-based k6 load-test workspace for managing scripts, running k6, viewing terminal output, opening the live k6 dashboard, and browsing saved reports.

## Local Development

Install dependencies, then start the development server:

```bash
npm install
npm run dev
```

Open `http://localhost:3000/k6`. The root URL `http://localhost:3000/` redirects to `/k6`.

## Docker Compose

Start the app and local MinIO stack:

```bash
docker compose up --build -d
```

The app is available at `http://localhost:3000/k6`. MinIO API is exposed on `9000`, the MinIO console is exposed on `9001`, and k6 dashboard ports are exposed on `5665-5684`.

## Commands

- `npm run dev` starts the Next.js development server and generates k6 type metadata first.
- `npm run build` creates a production build and generates k6 type metadata first.
- `npm run start` starts the production server after a build.
- `npm run lint` runs ESLint.
- `npx jest` runs the Jest test suite.
- `npx tsc --noEmit` runs TypeScript verification.

## Runtime Notes

- The app uses a fixed Next.js base path: `/k6`.
- Do not configure a runtime or build-time `BASE_PATH`; changing the base path requires a coordinated code/config change and rebuild.
- Browser-owned app URLs should include the base path. Use `withBasePath` from `src/lib/base-path.ts` for client fetches, iframes, and links to app routes.
- Persisted data should stay app-root-relative. For example, markdown note assets may be stored as `/api/reports/...`; rendering code adds `/k6` at display time.
- Docker images include the k6 binary and should not rely on host-installed k6.
- `TOTAL_RUNNERS` controls runner capacity and defaults to `1`. The maximum is `20`.
