# Hardcoded k6 Runtime Design

Date: 2026-06-26

## Goal

Remove `K6_WEB_DASHBOARD_HOST` and `K6_BIN` from user-facing runtime configuration.

## Decisions

- `src/lib/k6.ts` hardcodes the k6 binary path to `/usr/local/bin/k6`.
- k6 dashboard host is hardcoded to `0.0.0.0`.
- `process.env.K6_BIN` and `process.env.K6_WEB_DASHBOARD_HOST` are ignored.
- `K6_WEB_DASHBOARD_PERIOD` remains configurable.
- `docker-compose.yml` no longer passes `K6_WEB_DASHBOARD_HOST` or `K6_BIN`.
- `TOTAL_RUNNERS` remains the only runner-control env and should keep the `${TOTAL_RUNNERS:-1}` default.

## Testing

- Unit-test that `K6_BIN` is always `/usr/local/bin/k6`.
- Unit-test that `getK6RunEnv()` ignores `K6_WEB_DASHBOARD_HOST`.
- Runtime-config test that Compose does not expose `K6_WEB_DASHBOARD_HOST` or `K6_BIN`.
