"use client";

import { useEffect, useState } from "react";
import { Activity } from "lucide-react";
import EmptyState from "@/components/layout/EmptyState";

export interface LiveDashboardTabProps {
  scriptName: string | null;
  isActiveRun: boolean;
  runEpoch: number;
}

const RETRY_MS = 2000;

export default function LiveDashboardTab({
  scriptName,
  isActiveRun,
  runEpoch,
}: LiveDashboardTabProps) {
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    if (!isActiveRun) {
      setRetryKey(0);
      return;
    }

    setRetryKey(0);
    const retry = setInterval(() => {
      setRetryKey((current) => current + 1);
    }, RETRY_MS);

    return () => {
      clearInterval(retry);
    };
  }, [isActiveRun, scriptName, runEpoch]);

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
        src="/api/dashboard/ui/?endpoint=/api/dashboard/"
        className="h-full w-full rounded-md border border-border ring-1 ring-border"
        title="k6 Live Dashboard"
      />
    </div>
  );
}
