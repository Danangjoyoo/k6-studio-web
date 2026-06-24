/**
 * Docker entrypoint: proxies WebSocket upgrades for /api/dashboard to k6 :5665
 * while delegating all HTTP traffic to the Next.js standalone server on an internal port.
 */
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import httpProxy from "http-proxy";

const PUBLIC_PORT = Number(process.env.PORT ?? 3000);
const INTERNAL_PORT = PUBLIC_PORT + 1;
const DASHBOARD_TARGET =
  process.env.K6_DASHBOARD_ORIGIN ?? "http://127.0.0.1:5665";
const DASHBOARD_PREFIX = "/api/dashboard";

const dashboardProxy = httpProxy.createProxyServer({
  target: DASHBOARD_TARGET,
  ws: true,
  changeOrigin: true,
});

const nextProxy = httpProxy.createProxyServer({
  target: `http://127.0.0.1:${INTERNAL_PORT}`,
  ws: true,
});

dashboardProxy.on("error", (err, _req, res) => {
  if (res && "writeHead" in res) {
    res.writeHead(503, { "Content-Type": "text/plain" });
    res.end("k6 dashboard proxy error");
  }
  console.error("[dashboard-proxy]", err.message);
});

nextProxy.on("error", (err) => {
  console.error("[next-proxy]", err.message);
});

const nextProcess = spawn("node", ["server.js"], {
  env: { ...process.env, PORT: String(INTERNAL_PORT), HOSTNAME: "127.0.0.1" },
  stdio: "inherit",
});

nextProcess.on("exit", (code) => {
  process.exit(code ?? 1);
});

function stripDashboardPrefix(url) {
  if (!url.startsWith(DASHBOARD_PREFIX)) return url;
  const stripped = url.slice(DASHBOARD_PREFIX.length);
  return stripped.length > 0 ? stripped : "/";
}

function waitForNext() {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + 30_000;
    const check = () => {
      fetch(`http://127.0.0.1:${INTERNAL_PORT}`)
        .then(() => resolve())
        .catch(() => {
          if (Date.now() > deadline) {
            reject(new Error("Next.js server did not start in time"));
            return;
          }
          setTimeout(check, 250);
        });
    };
    setTimeout(check, 500);
  });
}

await waitForNext();

const server = createServer((req, res) => {
  nextProxy.web(req, res);
});

server.on("upgrade", (req, socket, head) => {
  const url = req.url ?? "";
  if (url.startsWith(DASHBOARD_PREFIX)) {
    req.url = stripDashboardPrefix(url);
    dashboardProxy.ws(req, socket, head);
    return;
  }
  nextProxy.ws(req, socket, head);
});

server.listen(PUBLIC_PORT, "0.0.0.0", () => {
  console.log(
    `> Ready on http://0.0.0.0:${PUBLIC_PORT} (dashboard WS proxy enabled)`
  );
});

process.on("SIGTERM", () => {
  nextProcess.kill("SIGTERM");
  server.close();
});

process.on("SIGINT", () => {
  nextProcess.kill("SIGINT");
  server.close();
});
