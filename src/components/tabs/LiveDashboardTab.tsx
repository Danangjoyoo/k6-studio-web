"use client";

import { useEffect, useRef, useState } from "react";
import { Activity } from "lucide-react";
import EmptyState from "@/components/layout/EmptyState";

export interface LiveDashboardTabProps {
  scriptName: string | null;
  isActiveRun: boolean;
  runEpoch: number;
}

const POLL_MS = 1500;
const TIMEOUT_MS = 30_000;

export default function LiveDashboardTab({
  scriptName,
  isActiveRun,
  runEpoch,
}: LiveDashboardTabProps) {
  const [available, setAvailable] = useState(false);
  const [checking, setChecking] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const startedAt = useRef<number>(0);

  useEffect(() => {
    if (!isActiveRun) {
      setAvailable(false);
      setChecking(false);
      setTimedOut(false);
      return;
    }

    let cancelled = false;
    setChecking(true);
    setAvailable(false);
    setTimedOut(false);
    startedAt.current = Date.now();

    async function probe() {
      while (!cancelled) {
        try {
          const res = await fetch("/api/dashboard/ui/");
          if (cancelled) return;
          if (res.ok) {
            setAvailable(true);
            setChecking(false);
            return;
          }
        } catch {
          // dashboard not up yet
        }
        if (Date.now() - startedAt.current > TIMEOUT_MS) {
          if (!cancelled) {
            setChecking(false);
            setTimedOut(true);
          }
          return;
        }
        await new Promise((r) => setTimeout(r, POLL_MS));
      }
    }

    void probe();

    return () => {
      cancelled = true;
    };
  }, [isActiveRun, runEpoch]);

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

  if (timedOut && !available) {
    return (
      <EmptyState
        icon={Activity}
        title="Dashboard not responding"
        description='The dashboard did not start within 30 seconds. Check the terminal output for a "web dashboard:" line or any k6 errors.'
      />
    );
  }

  if (checking && !available) {
    return (
      <div className="load-lab-grid flex h-full flex-col items-center justify-center gap-3 bg-background p-6">
        <div className="h-8 w-48 animate-pulse rounded-md bg-panel-raised motion-reduce:animate-none" />
        <div className="h-4 w-32 animate-pulse rounded-md bg-panel motion-reduce:animate-none" />
        <p className="text-xs text-muted-foreground">Waiting for k6 dashboard to start…</p>
      </div>
    );
  }

  if (!available) {
    return (
      <EmptyState
        icon={Activity}
        title="Dashboard offline"
        description="The dashboard is starting. Try again in a moment."
      />
    );
  }

  return (
    <div className="h-full bg-panel p-2">
      <iframe
        key={`${scriptName}-${runEpoch}`}
        src="/api/dashboard/ui/?endpoint=/api/dashboard/"
        className="h-full w-full rounded-md border border-border ring-1 ring-border"
        title="k6 Live Dashboard"
      />
    </div>
  );
}
