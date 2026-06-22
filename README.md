# k6 Load Test Platform

A browser-based local load testing platform using [k6](https://k6.io/). Edit scripts in the browser, run tests, and stream live output — no terminal required after setup.

## Prerequisites

- **macOS / Windows:** [Docker Desktop](https://www.docker.com/products/docker-desktop/) with Compose v2
- **Linux:** Docker Engine + [Compose plugin](https://docs.docker.com/compose/install/)
- `make` (pre-installed on macOS/Linux; Windows users can use Git Bash or WSL)

## Quick start

```bash
# Pull the pinned k6 image first (one-time)
make pull

# Start the web UI
make up

# Open the editor
open http://localhost:3000   # macOS
```

## Using the web UI

1. Open **http://localhost:3000**
2. Select a script from the sidebar (or create a new one)
3. Edit in the Monaco editor and click **Save**
4. Click **Run** to start a load test — output streams live in the output panel
5. Click **Dashboard** while a test is running to open the k6 web dashboard at http://localhost:5665

Scripts are saved to `./tests/` on your host and persist across container restarts.

## Reports

After each run, two files are written to `tests/reports/`:

| File | Format | Contents |
|---|---|---|
| `summary-<timestamp>.html` | Self-contained HTML | Visual report, openable in any browser |
| `summary-<timestamp>.json` | JSON | Machine-readable metrics summary |

Timestamp format: `YYYYMMDDTHHmmss` (e.g. `20260622T130512`). HTML and JSON from the same run share the same timestamp stem.

> Reports are git-ignored and local-only.

## Changing the target

Override `K6_TARGET_URL` in `.env` or docker-compose environment:

```bash
K6_TARGET_URL=http://host.docker.internal:9090/ping make up
```

The default target is `http://host.docker.internal:8084/healthz`.

## Security note

The web-ui service mounts `/var/run/docker.sock`, which grants root-equivalent access to the Docker daemon. The UI is bound to `127.0.0.1:3000` only — do not expose this service on a shared or internet-facing network without adding authentication.

## Makefile commands

| Command | Description |
|---|---|
| `make pull` | Pull the pinned k6 image (`grafana/k6:0.55.0`) |
| `make up` | Build and start the web UI (waits for healthcheck) |
| `make down` | Stop all services |
| `make logs` | Follow web-ui container logs |
| `make version` | Print k6 version |

## Migration from CLI workflow

The previous `make run` workflow (direct k6 container via compose profile) has been replaced by the web UI. To run tests now:

1. `make up`
2. Open http://localhost:3000 and click **Run**

## Checking the k6 version

```bash
make version
```
