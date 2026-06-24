# Task 1: Project Scaffolding

> [← Master Plan](./master.md)

**Goal:** Bootstrap the Next.js 15 project with TypeScript, Tailwind CSS, and shadcn/ui. Add Docker Compose with MinIO. Verify the app boots locally and inside Docker.

**Files:**
- Create: `k6-studio-web/` (project root, all subsequent paths are relative to it)
- Create: `k6-studio-web/docker-compose.yml`
- Create: `k6-studio-web/.env.local`
- Create: `k6-studio-web/.env.example`

---

- [ ] **Step 1: Scaffold Next.js project**

```bash
cd /path/to/k6-local
npx create-next-app@latest k6-studio-web \
  --typescript \
  --tailwind \
  --eslint \
  --app \
  --src-dir \
  --import-alias "@/*" \
  --no-turbopack
cd k6-studio-web
```

Expected: directory `k6-studio-web/` created, `npm run dev` starts on port 3000.

- [ ] **Step 2: Install runtime dependencies**

```bash
npm install minio @monaco-editor/react
npm install -D @types/node
```

Expected: `package.json` contains `minio` and `@monaco-editor/react`.

- [ ] **Step 3: Install shadcn/ui**

```bash
npx shadcn@latest init
# When prompted:
# Style: Default
# Base color: Slate
# CSS variables: Yes
```

Expected: `src/components/ui/` directory created, `components.json` present.

- [ ] **Step 4: Add core shadcn components used across tasks**

```bash
npx shadcn@latest add button tabs scroll-area separator tooltip
```

Expected: `src/components/ui/button.tsx`, `tabs.tsx`, `scroll-area.tsx`, `separator.tsx`, `tooltip.tsx` exist.

- [ ] **Step 5: Create `.env.example`**

Create `k6-studio-web/.env.example`:

```env
MINIO_ENDPOINT=localhost
MINIO_PORT=9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
MINIO_USE_SSL=false
K6_DASHBOARD_PORT=5665
```

- [ ] **Step 6: Create `.env.local` for local development**

Create `k6-studio-web/.env.local`:

```env
MINIO_ENDPOINT=localhost
MINIO_PORT=9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
MINIO_USE_SSL=false
K6_DASHBOARD_PORT=5665
```

- [ ] **Step 7: Create `docker-compose.yml`**

Create `k6-studio-web/docker-compose.yml`:

```yaml
services:
  app:
    build: .
    ports:
      - "3000:3000"
      - "5665:5665"
    environment:
      MINIO_ENDPOINT: minio
      MINIO_PORT: "9000"
      MINIO_ACCESS_KEY: minioadmin
      MINIO_SECRET_KEY: minioadmin
      MINIO_USE_SSL: "false"
      K6_DASHBOARD_PORT: "5665"
    depends_on:
      minio:
        condition: service_healthy

  minio:
    image: minio/minio:latest
    command: server /data --console-address ":9001"
    ports:
      - "9000:9000"
      - "9001:9001"
    environment:
      MINIO_ROOT_USER: minioadmin
      MINIO_ROOT_PASSWORD: minioadmin
    volumes:
      - minio_data:/data
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:9000/minio/health/live"]
      interval: 5s
      timeout: 5s
      retries: 5

volumes:
  minio_data:
```

- [ ] **Step 8: Verify dev server boots**

```bash
npm run dev
```

Expected: `http://localhost:3000` returns the default Next.js page. No TypeScript or lint errors.

- [ ] **Step 9: Verify Docker Compose (MinIO only) starts**

```bash
docker compose up minio -d
curl http://localhost:9000/minio/health/live
```

Expected: HTTP 200 response.

- [ ] **Step 10: Stop MinIO and commit**

```bash
docker compose down
git add .
git commit -m "feat: scaffold k6-studio-web Next.js project with Docker Compose"
```
