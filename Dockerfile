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
ARG TARGETARCH
ARG K6_VERSION=0.51.0
RUN apk add --no-cache curl bash && \
    set -eux; \
    case "${TARGETARCH:-$(uname -m)}" in \
      amd64|x86_64) k6_arch="amd64" ;; \
      arm64|aarch64) k6_arch="arm64" ;; \
      *) echo "unsupported architecture: ${TARGETARCH:-$(uname -m)}" >&2; exit 1 ;; \
    esac; \
    curl -L "https://github.com/grafana/k6/releases/download/v${K6_VERSION}/k6-v${K6_VERSION}-linux-${k6_arch}.tar.gz" \
      -o /tmp/k6.tar.gz && \
    tar -xzf /tmp/k6.tar.gz -C /tmp && \
    mv "/tmp/k6-v${K6_VERSION}-linux-${k6_arch}/k6" /usr/local/bin/k6 && \
    chmod +x /usr/local/bin/k6 && \
    /usr/local/bin/k6 version && \
    rm -rf /tmp/k6.tar.gz "/tmp/k6-v${K6_VERSION}-linux-${k6_arch}"

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

# Copy built output
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/scripts/docker-server.mjs ./scripts/docker-server.mjs
COPY --from=builder /app/scripts/docker-dashboard-routing.cjs ./scripts/docker-dashboard-routing.cjs
RUN npm install http-proxy@^1.18.1 --omit=dev --no-save

EXPOSE 3000 5665-5684

CMD ["node", "scripts/docker-server.mjs"]
