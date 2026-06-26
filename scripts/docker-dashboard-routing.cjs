const DASHBOARD_PREFIX = "/api/dashboard";
const DASHBOARD_BASE_PORT = 5665;
const MAX_RUNNERS = 20;

function parseDashboardUrl(url) {
  return new URL(url || "/", "http://k6-studio.local");
}

function extractRunId(pathname) {
  const segments = pathname.split("/");
  if (
    segments[1] !== "api" ||
    segments[2] !== "dashboard" ||
    segments[3] !== "run" ||
    !segments[4]
  ) {
    return null;
  }
  return decodeURIComponent(segments[4]);
}

function getScopedRunId(url) {
  return extractRunId(parseDashboardUrl(url).pathname);
}

function runnerIndexFromRunId(runId) {
  const match = runId.match(/_(\d+)$/);
  if (!match) return null;
  const runnerIndex = Number.parseInt(match[1], 10);
  if (!Number.isInteger(runnerIndex)) return null;
  if (runnerIndex < 0 || runnerIndex >= MAX_RUNNERS) return null;
  return runnerIndex;
}

function resolveDashboardPort(url, activeRuns) {
  const parsed = parseDashboardUrl(url);
  const runId = extractRunId(parsed.pathname);
  if (!runId) return DASHBOARD_BASE_PORT;

  const runnerIndex = runnerIndexFromRunId(runId);
  if (runnerIndex === null) return null;

  if (Array.isArray(activeRuns)) {
    const activeRun = activeRuns.find((run) => run.id === runId);
    if (!activeRun) return null;
    if (Number.isInteger(activeRun.dashboardPort)) {
      return activeRun.dashboardPort;
    }
  }

  return DASHBOARD_BASE_PORT + runnerIndex;
}

function resolveDashboardTarget(url, activeRuns) {
  const port = resolveDashboardPort(url, activeRuns);
  if (port === null) return null;
  return `http://127.0.0.1:${port}`;
}

function stripDashboardPrefix(url) {
  const parsed = parseDashboardUrl(url);
  const segments = parsed.pathname.split("/");
  let stripped = parsed.pathname;

  if (
    segments[1] === "api" &&
    segments[2] === "dashboard" &&
    segments[3] === "run" &&
    segments[4]
  ) {
    stripped = `/${segments.slice(5).join("/")}`;
  } else if (parsed.pathname.startsWith(DASHBOARD_PREFIX)) {
    stripped = parsed.pathname.slice(DASHBOARD_PREFIX.length);
  }

  if (!stripped || stripped === "/") return `/${parsed.search}`;
  return `${stripped}${parsed.search}`;
}

module.exports = {
  DASHBOARD_BASE_PORT,
  DASHBOARD_PREFIX,
  MAX_RUNNERS,
  getScopedRunId,
  resolveDashboardPort,
  resolveDashboardTarget,
  stripDashboardPrefix,
};
