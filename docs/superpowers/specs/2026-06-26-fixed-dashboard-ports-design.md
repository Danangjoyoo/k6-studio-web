# Fixed Dashboard Ports Design

Date: 2026-06-26

## Goal

Remove `K6_DASHBOARD_PORT` as configuration and make k6 dashboard ports an internal runner-slot detail.

## Decisions

- The app uses a fixed dashboard port range of `5665..5684`.
- The maximum runner count is `20`.
- `TOTAL_RUNNERS` still controls configured capacity, but it is clamped to `1..20`.
- Runner index `0` maps to port `5665`; runner index `19` maps to port `5684`.
- `K6_DASHBOARD_PORT` is removed from `.env.example`, `.env.local`, and `docker-compose.yml`.
- Docker publishes `5665-5684:5665-5684` for direct dashboard access, although the in-app live dashboard still uses the app proxy.
- The live dashboard remains script-aware: selected namespace + selected script resolves to an active run id, and the iframe uses `/api/dashboard/run/<runId>/...`.
- The dashboard HTTP proxy resolves `runId` to that run's dashboard port.
- The Docker WebSocket upgrade proxy must not always target `5665`; it should route `/api/dashboard/run/<runId>/...` upgrades to that run's internal port.

## Non-Goals

- No dynamic port discovery.
- No user-configurable dashboard base port.
- No runner count above 20.
- No direct host dashboard URL selection in the UI.

## Testing

- Unit-test fixed capacity bounds and fixed dashboard port assignment in `run-lock`.
- Unit-test k6 dashboard env generation so `K6_DASHBOARD_PORT` no longer affects defaults.
- Unit-test runtime config so `K6_DASHBOARD_PORT` is absent and the Compose port range is present.
- Unit-test Docker WebSocket proxy helpers for run-scoped URLs.
- Re-run focused tests, full Jest, typecheck, lint, build, and Docker Compose.
