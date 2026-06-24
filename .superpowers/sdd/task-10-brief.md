# Task 10: Dockerfile + Deployment

> [← Master Plan](./master.md)

**Goal:** Write a multi-stage `Dockerfile` that bundles the Next.js app together with the k6 binary. Update `docker-compose.yml` to build from this Dockerfile. Verify the full stack (`app` + `minio`) boots from Docker Compose and the complete user journey works inside containers.

**Files:**
- Create: `Dockerfile`
- Modify: `docker-compose.yml` — already references `build: .`; verify it is correct
- Create: `.dockerignore`

---

- [ ] **Step 1: Create `.dockerignore`**

Create `k6-studio-web/.dockerignore`:

```
node_modules
.next
.env.local
.env*.local
*.log
.git
.gitignore
README.md
docs/
```

- [ ] **Step 2: Write failing build test**

Before writing the Dockerfile, confirm the current build works locally:

```bash
npm run build
```

Expected: `✓ Compiled successfully`. Fix any build errors before proceeding.

- [ ] **Step 3: Write `Dockerfile`**

Create `k6-studio-web/Dockerfile`:

```dockerfile
# ── Stage 1: deps ──────────────────────────────────────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

# ── Stage 2: builder ───────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ── Stage 3: runner ────────────────────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app

# Install k6
RUN apk add --no-cache curl bash && \
    curl -L https://github.com/grafana/k6/releases/download/v0.51.0/k6-v0.51.0-linux-amd64.tar.gz \
      -o /tmp/k6.tar.gz && \
    tar -xzf /tmp/k6.tar.gz -C /tmp && \
    mv /tmp/k6-v0.51.0-linux-amd64/k6 /usr/local/bin/k6 && \
    chmod +x /usr/local/bin/k6 && \
    rm -rf /tmp/k6.tar.gz /tmp/k6-v0.51.0-linux-amd64

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000

# Copy built output
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

EXPOSE 3000

CMD ["node", "server.js"]
```

- [ ] **Step 4: Enable standalone output in `next.config.ts`**

Open `next.config.ts` (or `next.config.js`) and add `output: "standalone"`:

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
};

export default nextConfig;
```

- [ ] **Step 5: Rebuild locally to verify standalone output**

```bash
npm run build
ls .next/standalone/
```

Expected: `server.js` exists in `.next/standalone/`.

- [ ] **Step 6: Verify `docker-compose.yml` is correct**

Open `docker-compose.yml` (created in Task 1). Confirm the `app` service has:

```yaml
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
    K6_BIN: "/usr/local/bin/k6"
  depends_on:
    minio:
      condition: service_healthy
```

Add `K6_BIN: "/usr/local/bin/k6"` if missing.

- [ ] **Step 7: Build Docker image**

```bash
docker build -t k6-studio-web:local .
```

Expected: Build completes successfully. Final image is based on `node:20-alpine`.

Verify k6 is present inside the image:

```bash
docker run --rm k6-studio-web:local k6 version
```

Expected: `k6 v0.51.0 (go..., ...)`

- [ ] **Step 8: Run full stack with Docker Compose**

```bash
docker compose up --build -d
sleep 10

# Health check
curl http://localhost:3000
# Expected: HTML of the k6 Studio UI

curl http://localhost:9000/minio/health/live
# Expected: 200 OK

# Create and list a script
curl -X POST http://localhost:3000/api/files \
  -H "Content-Type: application/json" \
  -d '{"name":"docker-test.js","content":"import http from \"k6/http\"; export default function(){http.get(\"https://test.k6.io\")}"}'
# Expected: {"name":"docker-test.js"}

curl http://localhost:3000/api/files
# Expected: {"files":[{"name":"docker-test.js",...}]}
```

- [ ] **Step 9: Run a k6 test inside the container and verify report upload**

```bash
curl -N -X POST http://localhost:3000/api/run \
  -H "Content-Type: application/json" \
  -d '{"filename":"docker-test.js"}'
# Expected: SSE stream with k6 output ending in:
# data: {"done":true,"exitCode":0,"reportName":"docker-test.js-<timestamp>.html"}

curl http://localhost:3000/api/reports
# Expected: {"reports":[{"name":"docker-test.js-<timestamp>.html",...}]}
```

- [ ] **Step 10: Tear down and commit**

```bash
docker compose down
git add Dockerfile .dockerignore next.config.ts docker-compose.yml
git commit -m "feat: add production Dockerfile bundling k6 with Next.js standalone"
```
