"use client";

import { useEffect, useState } from "react";

export default function LiveDashboardTab() {
  const [available, setAvailable] = useState<boolean | null>(null);

  useEffect(() => {
    fetch("/api/dashboard/")
      .then((res) => setAvailable(res.ok))
      .catch(() => setAvailable(false));
  }, []);

  if (available === null) {
    return (
      <div className="flex items-center justify-center h-full text-slate-400 text-sm">
        Checking dashboard…
      </div>
    );
  }

  if (!available) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-slate-400">
        <p className="text-sm">k6 dashboard is not running.</p>
        <p className="text-xs text-slate-500">
          Start a test from the Editor tab — the dashboard starts automatically.
        </p>
      </div>
    );
  }

  return (
    <iframe
      src="/api/dashboard/"
      className="w-full h-full border-0"
      title="k6 Live Dashboard"
    />
  );
}
