"use client";

import { useCallback, useEffect, useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { FileText, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ReportInfo {
  name: string;
  size: number;
  lastModified: string;
}

export default function TestHistoryTab() {
  const [reports, setReports] = useState<ReportInfo[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchReports = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/reports");
    const data = (await res.json()) as { reports: ReportInfo[] };
    setReports(
      [...data.reports].sort(
        (a, b) =>
          new Date(b.lastModified).getTime() -
          new Date(a.lastModified).getTime()
      )
    );
    setLoading(false);
  }, []);

  useEffect(() => {
    void fetchReports();
  }, [fetchReports]);

  return (
    <div className="flex h-full">
      <div className="w-72 flex flex-col border-r border-slate-700 bg-slate-900">
        <div className="flex items-center justify-between px-3 py-2 border-b border-slate-700">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
            Reports
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => void fetchReports()}
            disabled={loading}
          >
            <RefreshCw
              className={`h-3 w-3 ${loading ? "animate-spin" : ""}`}
            />
          </Button>
        </div>
        <ScrollArea className="flex-1">
          {reports.length === 0 && !loading && (
            <p className="text-xs text-slate-500 px-3 py-4">
              No reports yet. Run a test to generate one.
            </p>
          )}
          {reports.map((r) => (
            <div
              key={r.name}
              className={`flex items-start gap-2 px-3 py-2 cursor-pointer text-xs border-b border-slate-800 ${
                selected === r.name
                  ? "bg-slate-700 text-white"
                  : "text-slate-300 hover:bg-slate-800"
              }`}
              onClick={() => setSelected(r.name)}
            >
              <FileText className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <div className="min-w-0">
                <p className="truncate font-medium">{r.name}</p>
                <p className="text-slate-500">
                  {new Date(r.lastModified).toLocaleString()}
                </p>
              </div>
            </div>
          ))}
        </ScrollArea>
      </div>

      <div className="flex-1 bg-white">
        {selected ? (
          <iframe
            key={selected}
            src={`/api/reports/${encodeURIComponent(selected)}`}
            className="w-full h-full border-0"
            title={selected}
            sandbox="allow-scripts allow-same-origin"
          />
        ) : (
          <div className="flex items-center justify-center h-full text-slate-400 text-sm bg-slate-950">
            Select a report to view
          </div>
        )}
      </div>
    </div>
  );
}
