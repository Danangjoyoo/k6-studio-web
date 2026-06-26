# Hardcoded k6 Runtime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hardcode k6 binary and dashboard host values in code instead of exposing them as env vars.

**Architecture:** `src/lib/k6.ts` becomes the single source of truth for the k6 binary path and dashboard host. Docker Compose stops passing those values, while keeping `TOTAL_RUNNERS` configurable with a default.

**Tech Stack:** Next.js App Router, TypeScript, Docker Compose, Jest.

---

### Task 1: k6 Runtime Constants

**Files:**
- Modify: `src/lib/k6.ts`
- Modify: `src/lib/__tests__/k6.test.ts`

- [ ] Write failing tests that `K6_BIN` ignores `process.env.K6_BIN` and `getK6RunEnv()` ignores `process.env.K6_WEB_DASHBOARD_HOST`.
- [ ] Run `npx jest src/lib/__tests__/k6.test.ts --runInBand` and verify failure.
- [ ] Hardcode `K6_BIN` to `/usr/local/bin/k6` and dashboard host to `0.0.0.0`.
- [ ] Run `npx jest src/lib/__tests__/k6.test.ts --runInBand` and verify pass.

### Task 2: Compose Runtime Config

**Files:**
- Modify: `docker-compose.yml`
- Modify: `src/lib/__tests__/runtime-config.test.ts`

- [ ] Write failing tests that Compose does not contain `K6_WEB_DASHBOARD_HOST` or `K6_BIN`.
- [ ] Run `npx jest src/lib/__tests__/runtime-config.test.ts --runInBand` and verify failure.
- [ ] Remove those env vars from Compose and keep `TOTAL_RUNNERS: ${TOTAL_RUNNERS:-1}`.
- [ ] Run `npx jest src/lib/__tests__/runtime-config.test.ts --runInBand` and verify pass.

### Task 3: Verification And Commit

**Files:**
- Modify only if verification exposes defects.

- [ ] Run focused tests for k6 and runtime config.
- [ ] Run full Jest, TypeScript, lint, build, and Docker Compose.
- [ ] Stage all intended files and commit.
