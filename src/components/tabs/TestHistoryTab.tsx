"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FileText, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import EmptyState from "@/components/layout/EmptyState";
import PanelHeader from "@/components/layout/PanelHeader";
import TestHistoryReportPreview from "@/components/tabs/TestHistoryReportPreview";
import { cn } from "@/lib/utils";
import { DEFAULT_NAMESPACE } from "@/lib/namespaces";

interface ReportInfo {
  name: string;
  size: number;
  lastModified: string;
}

export interface TestHistoryTabProps {
  namespace?: string;
  scriptName: string | null;
}

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function TestHistoryTab({
  namespace = DEFAULT_NAMESPACE,
  scriptName,
}: TestHistoryTabProps) {
  const [reports, setReports] = useState<ReportInfo[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const fetchReportsRequestIdRef = useRef(0);

  const fetchReports = useCallback(async () => {
    const requestId = ++fetchReportsRequestIdRef.current;
    setLoading(true);
    try {
      const res = await fetch(`/api/reports?${namespaceQuery(namespace)}`);
      const data = (await res.json()) as { reports: ReportInfo[] };
      if (requestId !== fetchReportsRequestIdRef.current) return;
      setReports(
        [...data.reports].sort(
          (a, b) =>
            new Date(b.lastModified).getTime() -
            new Date(a.lastModified).getTime()
        )
      );
    } finally {
      if (requestId === fetchReportsRequestIdRef.current) {
        setLoading(false);
      }
    }
  }, [namespace]);

  useEffect(() => {
    void fetchReports();
  }, [fetchReports]);

  const filteredReports = useMemo(() => {
    if (!scriptName) return [];
    return reports.filter((r) => r.name.startsWith(`${scriptName}-`));
  }, [reports, scriptName]);

  useEffect(() => {
    setSelected((current) =>
      current && filteredReports.some((r) => r.name === current) ? current : null
    );
  }, [filteredReports, namespace, scriptName]);

  if (!scriptName) {
    return (
      <EmptyState
        icon={FileText}
        title="Select a script"
        description="Choose a script from the sidebar to view its reports."
      />
    );
  }

  return (
    <div className="flex h-full">
      <div className="flex w-72 shrink-0 flex-col border-r border-border bg-sidebar">
        <PanelHeader
          label="Reports"
          badge={
            <>
              <span className="rounded border border-border bg-panel-raised px-1.5 py-px font-mono text-[10px] text-muted-foreground">
                {scriptName}
              </span>
              <span className="rounded-full border border-border bg-panel-raised px-1.5 py-px font-mono text-[10px] text-muted-foreground">
                {filteredReports.length}
              </span>
            </>
          }
          actions={
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => void fetchReports()}
              disabled={loading}
              aria-label="Refresh reports"
            >
              <RefreshCw
                className={cn(
                  "h-3 w-3",
                  loading && "animate-spin motion-reduce:animate-none"
                )}
              />
            </Button>
          }
        />
        <ScrollArea className="flex-1">
          {filteredReports.length === 0 && !loading ? (
            <EmptyState
              icon={FileText}
              title="No reports yet"
              description={`Completed runs of ${scriptName} appear here.`}
              className="py-8"
            />
          ) : (
            filteredReports.map((r) => (
              <div
                key={r.name}
                role="button"
                tabIndex={0}
                className={cn(
                  "flex cursor-pointer items-start gap-2 border-b border-border/50 border-l-2 px-3 py-2 text-xs transition-colors duration-150",
                  selected === r.name
                    ? "border-l-primary bg-sidebar-accent text-sidebar-accent-foreground"
                    : "border-l-transparent text-muted-foreground hover:bg-sidebar-accent/50 hover:text-foreground"
                )}
                onClick={() => setSelected(r.name)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setSelected(r.name);
                  }
                }}
              >
                <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary/80" />
                <div className="min-w-0">
                  <p className="truncate font-mono font-medium">{r.name}</p>
                  <p className="font-mono text-[10px] text-muted-foreground">
                    {formatRelativeTime(r.lastModified)} · {formatSize(r.size)}
                  </p>
                </div>
              </div>
            ))
          )}
        </ScrollArea>
      </div>

      <div className="flex min-w-0 flex-1 flex-col bg-panel">
        <TestHistoryReportPreview namespace={namespace} reportName={selected} />
      </div>
    </div>
  );
}

function namespaceQuery(namespace: string): string {
  return `namespace=${encodeURIComponent(namespace)}`;
}
