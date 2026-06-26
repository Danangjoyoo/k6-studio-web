"use client";

import { useEffect, useRef, useState } from "react";
import { Activity } from "lucide-react";
import EmptyState from "@/components/layout/EmptyState";

export interface LiveDashboardTabProps {
  scriptName: string | null;
  isActiveRun: boolean;
  runEpoch: number;
  runId?: string | null;
}

const RETRY_MS = 2000;

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

    async function probeDashboard(remountOnFailure: boolean) {
      try {
        const response = await fetch(dashboardSrc(runId), { cache: "no-store" });
        if (cancelled) return;

        if (response.ok) {
          setDashboardReady(true);
          if (hadFailedProbeRef.current) {
            setRetryKey((current) => current + 1);
          }
          return;
        }
      } catch {
        // Treat network/proxy failures like a non-ready dashboard.
      }

      if (!cancelled) {
        hadFailedProbeRef.current = true;
        if (remountOnFailure) {
          setRetryKey((current) => current + 1);
        }
      }
    }

    void probeDashboard(false);
    const retry = setInterval(() => {
      void probeDashboard(true);
    }, RETRY_MS);

    return () => {
      cancelled = true;
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
        src={dashboardSrc(runId)}
        className="h-full w-full rounded-md border border-border ring-1 ring-border"
        title="k6 Live Dashboard"
      />
    </div>
  );
}

function dashboardSrc(runId: string | null): string {
  if (!runId) return "/api/dashboard/ui/?endpoint=/api/dashboard/";
  return `/api/dashboard/ui/?runId=${encodeURIComponent(runId)}&endpoint=${encodeURIComponent(
    `/api/dashboard/?runId=${runId}`
  )}`;
}
