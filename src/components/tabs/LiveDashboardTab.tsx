"use client";

import { useEffect, useRef, useState } from "react";
import { Activity } from "lucide-react";
import EmptyState from "@/components/layout/EmptyState";
import { withBasePath } from "@/lib/base-path";

export interface LiveDashboardTabProps {
  scriptName: string | null;
  isActiveRun: boolean;
  runEpoch: number;
  runId?: string | null;
}

const RETRY_MS = 2000;
const READINESS_TIMEOUT_MS = 1800;

export default function LiveDashboardTab({
  scriptName,
  isActiveRun,
  runEpoch,
  runId = null,
}: LiveDashboardTabProps) {
  const [retryKey, setRetryKey] = useState(0);
  const [dashboardReady, setDashboardReady] = useState(false);
  const hadFailedProbeRef = useRef(false);

  useEffect(() => {
    setRetryKey(0);
    setDashboardReady(false);
    hadFailedProbeRef.current = false;
  }, [isActiveRun, scriptName, runEpoch, runId]);

  useEffect(() => {
    if (!scriptName || !isActiveRun || dashboardReady) return;

    let cancelled = false;
    let probeInFlight = false;
    const activeProbeControllers = new Set<AbortController>();

    async function probeDashboard() {
      if (probeInFlight) return;
      probeInFlight = true;
      const controller = new AbortController();
      activeProbeControllers.add(controller);
      const timeout = setTimeout(() => {
        controller.abort();
      }, READINESS_TIMEOUT_MS);
      try {
        const ready = await probeDashboardEvents(runId, controller.signal);
        if (cancelled) return;

        if (ready) {
          setDashboardReady(true);
          if (hadFailedProbeRef.current) {
            setRetryKey((current) => current + 1);
          }
          return;
        }
      } catch {
        // Treat network/proxy failures like a non-ready dashboard.
      } finally {
        clearTimeout(timeout);
        activeProbeControllers.delete(controller);
        probeInFlight = false;
      }

      if (!cancelled) {
        hadFailedProbeRef.current = true;
      }
    }

    void probeDashboard();
    const retry = setInterval(() => {
      void probeDashboard();
    }, RETRY_MS);

    return () => {
      cancelled = true;
      for (const controller of activeProbeControllers) {
        controller.abort();
      }
      clearInterval(retry);
    };
  }, [dashboardReady, isActiveRun, scriptName, runEpoch, runId]);

  if (!scriptName) {
    return (
      <EmptyState
        icon={Activity}
        title="Select a script"
        description="Choose a script from the sidebar to view its live dashboard."
      />
    );
  }

  if (!isActiveRun) {
    return (
      <EmptyState
        icon={Activity}
        title="Dashboard only available during a run"
        description={`The live dashboard starts automatically when you run ${scriptName}. Switch to the Editor tab and click "Run test" to begin.`}
      />
    );
  }

  return (
    <div className="h-full bg-panel p-2">
      <iframe
        key={`${scriptName}-${runEpoch}-${retryKey}`}
        src={dashboardFrameSrc(runId, retryKey)}
        className="h-full w-full rounded-md border border-border ring-1 ring-border"
        title="k6 Live Dashboard"
      />
    </div>
  );
}

function dashboardSrc(runId: string | null): string {
  if (!runId) {
    const endpoint = withBasePath("/api/dashboard/");
    return `${withBasePath("/api/dashboard/ui/")}?endpoint=${endpoint}`;
  }
  const basePath = `/api/dashboard/run/${encodeURIComponent(runId)}/`;
  const scopedPath = withBasePath(basePath);
  return `${scopedPath}ui/?endpoint=${encodeURIComponent(scopedPath)}`;
}

function dashboardFrameSrc(runId: string | null, reloadKey: number): string {
  const src = dashboardSrc(runId);
  if (reloadKey === 0) {
    return src;
  }
  return `${src}${src.includes("?") ? "&" : "?"}_reload=${reloadKey}`;
}

function dashboardEventsSrc(runId: string | null): string {
  if (!runId) {
    return withBasePath("/api/dashboard/events");
  }
  return withBasePath(
    `/api/dashboard/run/${encodeURIComponent(runId)}/events`
  );
}

async function probeDashboardEvents(
  runId: string | null,
  signal: AbortSignal
): Promise<boolean> {
  const response = await fetch(dashboardEventsSrc(runId), {
    cache: "no-store",
    signal,
  });
  if (!response.ok || !response.body) {
    return false;
  }

  const reader = response.body.getReader();
  try {
    const { done, value } = await reader.read();
    return !done && value !== undefined && value.byteLength > 0;
  } finally {
    if ("cancel" in reader) {
      await reader.cancel().catch(() => undefined);
    }
  }
}
