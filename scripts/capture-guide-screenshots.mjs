import { chromium } from "@playwright/test";
import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import net from "node:net";
import path from "node:path";

const HOST = "127.0.0.1";
const SCRIPT_NAME = "checkout/smoke-checkout.ts";
const REPORT_NAME = "checkout/smoke-checkout.ts-2026-07-02T06-45-00.html";
const RUN_ID = "run-guide-1";
const SCREENSHOT_DIR = "images";

const demoScript = `import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '30s', target: 15 },
    { duration: '1m', target: 15 },
    { duration: '20s', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<450'],
    http_req_failed: ['rate<0.01'],
  },
};

export default function () {
  const res = http.get('https://test.k6.io');
  check(res, { 'status is 200': (r) => r.status === 200 });
  sleep(1);
}
`;

const tree = [
  {
    path: "checkout/",
    name: "checkout",
    type: "folder",
    children: [
      {
        path: SCRIPT_NAME,
        name: "smoke-checkout.ts",
        type: "file",
      },
      {
        path: "checkout/peak-checkout.ts",
        name: "peak-checkout.ts",
        type: "file",
      },
    ],
  },
  {
    path: "api/",
    name: "api",
    type: "folder",
    children: [
      {
        path: "api/auth-flow.ts",
        name: "auth-flow.ts",
        type: "file",
      },
    ],
  },
  {
    path: "smoke-homepage.ts",
    name: "smoke-homepage.ts",
    type: "file",
  },
];

const reports = [
  {
    name: REPORT_NAME,
    size: 482_314,
    lastModified: "2026-07-02T06:45:00.000Z",
  },
  {
    name: "checkout/smoke-checkout.ts-2026-07-01T18-20-00.html",
    size: 451_102,
    lastModified: "2026-07-01T18:20:00.000Z",
  },
  {
    name: "api/auth-flow.ts-2026-07-01T16-05-00.html",
    size: 392_440,
    lastModified: "2026-07-01T16:05:00.000Z",
  },
];

async function main() {
  await mkdir(SCREENSHOT_DIR, { recursive: true });

  const port = await findAvailablePort(3010);
  const baseUrl = `http://${HOST}:${port}`;
  const server = startDevServer(port);

  let browser;
  try {
    await waitForServer(`${baseUrl}/k6`, server);

    browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1440, height: 940 } });
    await mockGuideApi(page, baseUrl);

    await captureWorkspace(page, baseUrl);
    await captureBuilder(page, baseUrl);
    await captureLiveDashboard(page, baseUrl);
    await captureHistory(page, baseUrl);
  } finally {
    if (browser) {
      await browser.close();
    }
    stopDevServer(server);
  }
}

async function captureWorkspace(page, baseUrl) {
  await gotoGuideView(page, baseUrl, "editor");
  await page.getByText("smoke-checkout.ts").first().waitFor();
  await page.getByRole("button", { name: /running|run test/i }).waitFor();
  await settleForScreenshot(page);
  await page.screenshot({
    path: path.join(SCREENSHOT_DIR, "guide-workspace.png"),
  });
}

async function captureBuilder(page, baseUrl) {
  await gotoGuideView(page, baseUrl, "builder");
  await page.getByText("Script Builder").waitFor();
  await page.getByText("Load profile").waitFor();
  await settleForScreenshot(page);
  await page.screenshot({
    path: path.join(SCREENSHOT_DIR, "guide-builder.png"),
  });
}

async function captureLiveDashboard(page, baseUrl) {
  await gotoGuideView(page, baseUrl, "live-dashboard");
  await page.getByTitle("k6 Live Dashboard").waitFor({ timeout: 10_000 });
  await settleForScreenshot(page);
  await page.screenshot({
    path: path.join(SCREENSHOT_DIR, "guide-live-dashboard.png"),
  });
}

async function captureHistory(page, baseUrl) {
  await gotoGuideView(page, baseUrl, "test-history", {
    report: REPORT_NAME,
  });
  await page.getByText(REPORT_NAME).first().waitFor();
  await page.getByRole("tab", { name: "Summary" }).waitFor();
  await settleForScreenshot(page);
  await page.screenshot({
    path: path.join(SCREENSHOT_DIR, "guide-history.png"),
  });
}

async function gotoGuideView(page, baseUrl, view, extraParams = {}) {
  const params = new URLSearchParams({
    namespace: "default",
    view,
    script: SCRIPT_NAME,
    ...extraParams,
  });
  await page.goto(`${baseUrl}/k6?${params.toString()}`);
  await page.locator("header").waitFor();
  await hideDevIndicators(page);
}

async function hideDevIndicators(page) {
  await page.addStyleTag({
    content: `
      nextjs-portal,
      [data-nextjs-toast],
      [data-nextjs-dialog-overlay],
      [data-nextjs-errors-dialog],
      [data-nextjs-error-overlay],
      [data-next-badge-root] {
        display: none !important;
        visibility: hidden !important;
      }
    `,
  });
}

async function mockGuideApi(page, baseUrl) {
  await page.route(`${baseUrl}/k6/api/**`, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const pathname = url.pathname;

    if (pathname === "/k6/api/namespaces") {
      return fulfillJson(route, {
        namespaces: ["default", "checkout", "staging"],
        current: "default",
      });
    }

    if (pathname === "/k6/api/files" && request.method() === "GET") {
      return fulfillJson(route, {
        files: [
          { name: SCRIPT_NAME },
          { name: "checkout/peak-checkout.ts" },
          { name: "api/auth-flow.ts" },
          { name: "smoke-homepage.ts" },
        ],
        tree,
      });
    }

    if (pathname.startsWith("/k6/api/files/") && request.method() === "GET") {
      const fileName = decodeURIComponent(pathname.replace("/k6/api/files/", ""));
      return fulfillJson(route, {
        name: fileName,
        content: demoScript,
      });
    }

    if (pathname === "/k6/api/reports") {
      return fulfillJson(route, { reports });
    }

    if (pathname === "/k6/api/run/status") {
      return fulfillJson(route, {
        running: true,
        namespace: "default",
        script: SCRIPT_NAME,
        startedAt: 1_783_066_800_000,
        activeRunners: 1,
        capacity: 3,
        runs: [
          {
            id: RUN_ID,
            namespace: "default",
            script: SCRIPT_NAME,
            startedAt: 1_783_066_800_000,
            runnerIndex: 0,
            dashboardPort: 5665,
          },
        ],
      });
    }

    if (pathname === `/k6/api/run/output/${RUN_ID}`) {
      return route.fulfill({
        status: 200,
        headers: {
          "content-type": "text/event-stream",
          "cache-control": "no-cache",
        },
        body: [
          sse({ line: "k6 v1.0.0 running checkout/smoke-checkout.ts" }),
          sse({ line: "INFO[0001] 15 VUs warmed up and sending traffic" }),
          sse({ line: "http_req_duration p(95)=318ms  http_req_failed=0.00%" }),
        ].join(""),
      });
    }

    if (pathname.endsWith("/notes")) {
      return fulfillJson(route, {
        notes: [
          {
            id: "note_release",
            title: "Release notes",
            markdown:
              "### What changed\\n- Checkout smoke stayed below the latency threshold.\\n- No failed requests during the sample window.\\n\\n✅ Ready for deeper peak testing.",
          },
        ],
      });
    }

    if (pathname.includes("/note-assets")) {
      return fulfillJson(route, { url: "/api/reports/demo/note-assets/image.png" });
    }

    if (pathname.startsWith("/k6/api/reports/")) {
      return route.fulfill({
        status: 200,
        headers: { "content-type": "text/html; charset=utf-8" },
        body: reportHtml(),
      });
    }

    if (pathname.endsWith("/events")) {
      return route.fulfill({
        status: 200,
        headers: {
          "content-type": "text/event-stream",
          "cache-control": "no-cache",
        },
        body: "event: snapshot\ndata: {\"ready\":true}\n\n",
      });
    }

    if (pathname.startsWith("/k6/api/dashboard/")) {
      return route.fulfill({
        status: 200,
        headers: { "content-type": "text/html; charset=utf-8" },
        body: dashboardHtml(),
      });
    }

    return route.fulfill({ status: 404, body: "Not mocked" });
  });
}

function fulfillJson(route, data) {
  return route.fulfill({
    status: 200,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(data),
  });
}

function sse(data) {
  return `data: ${JSON.stringify(data)}\n\n`;
}

function dashboardHtml() {
  return `<!doctype html>
<html>
  <head>
    <style>
      body {
        margin: 0;
        background: #0a0f1f;
        color: #e8f2ff;
        font: 14px Inter, ui-sans-serif, system-ui;
      }
      .wrap { padding: 24px; }
      .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; }
      .card {
        border: 1px solid rgba(125, 211, 252, .24);
        border-radius: 10px;
        padding: 16px;
        background: rgba(15, 23, 42, .88);
      }
      .label { color: #94a3b8; font-size: 12px; }
      .value { margin-top: 8px; font-size: 28px; font-weight: 700; }
      .chart {
        height: 260px;
        margin-top: 18px;
        border: 1px solid rgba(148, 163, 184, .25);
        border-radius: 10px;
        background:
          linear-gradient(180deg, rgba(56,189,248,.18), transparent),
          repeating-linear-gradient(0deg, transparent 0 43px, rgba(148,163,184,.12) 44px),
          linear-gradient(90deg, #0f172a, #111827);
      }
    </style>
  </head>
  <body>
    <div class="wrap">
      <h1>k6 web dashboard</h1>
      <div class="grid">
        <div class="card"><div class="label">Virtual users</div><div class="value">15</div></div>
        <div class="card"><div class="label">Requests/sec</div><div class="value">142</div></div>
        <div class="card"><div class="label">p95 latency</div><div class="value">318ms</div></div>
        <div class="card"><div class="label">Failure rate</div><div class="value">0.00%</div></div>
      </div>
      <div class="chart"></div>
    </div>
  </body>
</html>`;
}

function reportHtml() {
  return `<!doctype html>
<html>
  <head>
    <style>
      body {
        margin: 0;
        padding: 28px;
        background: #ffffff;
        color: #111827;
        font: 14px Inter, ui-sans-serif, system-ui;
      }
      h1 { margin: 0 0 16px; font-size: 24px; }
      .metrics { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
      .metric { border: 1px solid #dbe4f0; border-radius: 8px; padding: 14px; }
      .metric strong { display: block; margin-top: 8px; font-size: 24px; }
      .bar { height: 12px; margin-top: 18px; border-radius: 999px; background: linear-gradient(90deg, #22c55e 72%, #f59e0b 72% 88%, #ef4444 88%); }
    </style>
  </head>
  <body>
    <h1>Checkout smoke report</h1>
    <div class="metrics">
      <div class="metric">Checks passed<strong>100%</strong></div>
      <div class="metric">p95 latency<strong>318ms</strong></div>
      <div class="metric">Failed requests<strong>0</strong></div>
    </div>
    <div class="bar"></div>
    <p>The checkout smoke test completed inside the configured quality gates.</p>
  </body>
</html>`;
}

function startDevServer(port) {
  const child = spawn("npm", ["run", "dev", "--", "-p", String(port), "-H", HOST], {
    cwd: process.cwd(),
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
  });

  child.stdout.on("data", (chunk) => {
    process.stdout.write(`[next] ${chunk}`);
  });
  child.stderr.on("data", (chunk) => {
    process.stderr.write(`[next] ${chunk}`);
  });

  return child;
}

async function waitForServer(url, server) {
  const started = Date.now();
  while (Date.now() - started < 90_000) {
    if (server.exitCode !== null) {
      throw new Error(`dev server exited with code ${server.exitCode}`);
    }
    try {
      const response = await fetch(url, { redirect: "manual" });
      if (response.status < 500) return;
    } catch {
      // Server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`timed out waiting for ${url}`);
}

function stopDevServer(server) {
  if (server.exitCode !== null) return;
  try {
    process.kill(-server.pid, "SIGTERM");
  } catch {
    server.kill("SIGTERM");
  }
}

async function findAvailablePort(startPort) {
  for (let port = startPort; port < startPort + 50; port += 1) {
    if (await isPortAvailable(port)) return port;
  }
  throw new Error(`No available port found starting at ${startPort}`);
}

function isPortAvailable(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => {
      server.close(() => resolve(true));
    });
    server.listen(port, HOST);
  });
}

async function settleForScreenshot(page) {
  await page.waitForTimeout(900);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
