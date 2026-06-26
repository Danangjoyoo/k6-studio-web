"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  FileText,
  Plus,
  RefreshCw,
  X,
} from "lucide-react";
import EmptyState from "@/components/layout/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { ReportPreviewCustomTab } from "@/lib/report-tabs";

interface TestHistoryReportPreviewProps {
  namespace: string;
  reportName: string | null;
}

type PreviewTab = ReportPreviewCustomTab & {
  persisted: boolean;
  inputUrl: string;
  currentUrl: string;
  history: string[];
  historyIndex: number;
  reloadNonce: number;
  error: string | null;
};

const SUMMARY_TAB_ID = "summary";

export default function TestHistoryReportPreview({
  namespace,
  reportName,
}: TestHistoryReportPreviewProps) {
  const [tabs, setTabs] = useState<PreviewTab[]>([]);
  const [activeTabId, setActiveTabId] = useState(SUMMARY_TAB_ID);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [loadingTabs, setLoadingTabs] = useState(false);
  const requestIdRef = useRef(0);
  const activeInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!reportName) return;

    const requestId = ++requestIdRef.current;
    setLoadingTabs(true);
    setSaveError(null);
    setTabs([]);
    setActiveTabId(SUMMARY_TAB_ID);

    fetch(reportTabsApiUrl(reportName, namespace))
      .then(async (response) => {
        if (!response.ok) return { tabs: [] };
        return (await response.json()) as { tabs?: ReportPreviewCustomTab[] };
      })
      .then((data) => {
        if (requestId !== requestIdRef.current) return;
        setTabs((data.tabs ?? []).map(toPreviewTab));
      })
      .catch(() => {
        if (requestId === requestIdRef.current) {
          setTabs([]);
          setSaveError("Could not load preview tabs");
        }
      })
      .finally(() => {
        if (requestId === requestIdRef.current) {
          setLoadingTabs(false);
        }
      });
  }, [namespace, reportName]);

  const activeTab = useMemo(
    () => tabs.find((tab) => tab.id === activeTabId) ?? null,
    [activeTabId, tabs]
  );

  useEffect(() => {
    if (activeTabId !== SUMMARY_TAB_ID) {
      activeInputRef.current?.focus();
    }
  }, [activeTabId]);

  if (!reportName) {
    return (
      <EmptyState
        icon={FileText}
        title="Select a report"
        description="Choose a report from the list to view results."
      />
    );
  }

  function handleAddTab() {
    const id = `tab_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const draft: PreviewTab = {
      id,
      title: "New tab",
      url: "",
      persisted: false,
      inputUrl: "",
      currentUrl: "",
      history: [],
      historyIndex: -1,
      reloadNonce: 0,
      error: null,
    };
    setTabs((current) => [...current, draft]);
    setActiveTabId(id);
  }

  function handleCloseTab(id: string) {
    const closing = tabs.find((tab) => tab.id === id);
    const nextTabs = tabs.filter((tab) => tab.id !== id);
    setTabs(nextTabs);
    if (activeTabId === id) {
      setActiveTabId(SUMMARY_TAB_ID);
    }
    if (closing?.persisted) {
      void persistTabs(nextTabs);
    }
  }

  function handleInputChange(id: string, value: string) {
    setTabs((current) =>
      current.map((tab) =>
        tab.id === id ? { ...tab, inputUrl: value, error: null } : tab
      )
    );
  }

  function handleSubmitUrl(id: string) {
    const tab = tabs.find((item) => item.id === id);
    if (!tab) return;

    const normalized = normalizeCustomUrl(tab.inputUrl);
    if (!normalized) {
      setTabs((current) =>
        current.map((item) =>
          item.id === id
            ? {
                ...item,
                error: "Only http and https URLs are supported",
              }
            : item
        )
      );
      return;
    }

    const title = new URL(normalized).hostname;
    const history = tab.history.slice(0, tab.historyIndex + 1);
    history.push(normalized);
    const nextTabs = tabs.map((item) =>
      item.id === id
        ? {
            ...item,
            url: normalized,
            title,
            persisted: true,
            inputUrl: normalized,
            currentUrl: normalized,
            history,
            historyIndex: history.length - 1,
            error: null,
          }
        : item
    );
    setTabs(nextTabs);
    setActiveTabId(id);
    void persistTabs(nextTabs);
  }

  function moveHistory(id: string, direction: -1 | 1) {
    setTabs((current) =>
      current.map((tab) => {
        if (tab.id !== id) return tab;
        const nextIndex = tab.historyIndex + direction;
        if (nextIndex < 0 || nextIndex >= tab.history.length) return tab;
        const nextUrl = tab.history[nextIndex];
        return {
          ...tab,
          historyIndex: nextIndex,
          currentUrl: nextUrl,
          inputUrl: nextUrl,
        };
      })
    );
  }

  function reloadTab(id: string) {
    setTabs((current) =>
      current.map((tab) =>
        tab.id === id ? { ...tab, reloadNonce: tab.reloadNonce + 1 } : tab
      )
    );
  }

  async function persistTabs(nextTabs: PreviewTab[]) {
    if (!reportName) return;
    setSaveError(null);
    const response = await fetch(reportTabsApiUrl(reportName, namespace), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tabs: nextTabs
          .filter((tab) => tab.persisted)
          .map(({ id, url, title }) => ({ id, url, title })),
      }),
    });
    if (!response.ok) {
      setSaveError("Could not save preview tabs");
    }
  }

  const summarySelected = activeTabId === SUMMARY_TAB_ID || !activeTab;

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-panel">
      <div className="flex shrink-0 items-end gap-1 border-b border-border bg-panel-raised px-2 pt-2">
        <div role="tablist" aria-label="Report preview tabs" className="flex min-w-0 flex-1 items-end gap-1">
          <button
            type="button"
            role="tab"
            aria-selected={summarySelected}
            className={tabClassName(summarySelected)}
            onClick={() => setActiveTabId(SUMMARY_TAB_ID)}
          >
            Summary
          </button>

          {tabs.map((tab) => {
            const selected = activeTabId === tab.id;
            return (
              <div key={tab.id} className="flex min-w-0 items-center">
                <button
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  className={cn(tabClassName(selected), "max-w-48")}
                  onClick={() => setActiveTabId(tab.id)}
                >
                  <span className="truncate">{tab.title}</span>
                </button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  className="mb-1 -ml-7 h-5 w-5 text-muted-foreground hover:text-foreground"
                  aria-label={`Close tab ${tab.title}`}
                  onClick={() => handleCloseTab(tab.id)}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            );
          })}
        </div>

        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="mb-1"
          aria-label="Add preview tab"
          onClick={handleAddTab}
        >
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>

      {saveError && (
        <p role="alert" className="border-b border-border px-3 py-1 font-mono text-xs text-destructive">
          {saveError}
        </p>
      )}

      {summarySelected ? (
        <div className="min-h-0 flex-1 p-3">
          <iframe
            key={reportName}
            src={reportSummaryUrl(reportName, namespace)}
            className="h-full w-full rounded-md border border-border bg-white ring-1 ring-border"
            title={reportName}
            sandbox="allow-scripts allow-same-origin"
          />
        </div>
      ) : (
        activeTab && (
          <div className="flex min-h-0 flex-1 flex-col">
            <form
              className="flex shrink-0 items-center gap-1 border-b border-border bg-panel px-2 py-2"
              onSubmit={(event) => {
                event.preventDefault();
                handleSubmitUrl(activeTab.id);
              }}
            >
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Back"
                disabled={activeTab.historyIndex <= 0}
                onClick={() => moveHistory(activeTab.id, -1)}
              >
                <ArrowLeft className="h-3.5 w-3.5" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Forward"
                disabled={activeTab.historyIndex >= activeTab.history.length - 1}
                onClick={() => moveHistory(activeTab.id, 1)}
              >
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Reload"
                disabled={!activeTab.currentUrl}
                onClick={() => reloadTab(activeTab.id)}
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </Button>
              <Input
                ref={activeInputRef}
                aria-label="Preview tab URL"
                className="h-7 flex-1 font-mono text-xs"
                placeholder="https://example.com/dashboard"
                value={activeTab.inputUrl}
                onChange={(event) =>
                  handleInputChange(activeTab.id, event.target.value)
                }
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    handleSubmitUrl(activeTab.id);
                  }
                }}
              />
            </form>

            {activeTab.error && (
              <p role="alert" className="border-b border-border px-3 py-1 font-mono text-xs text-destructive">
                {activeTab.error}
              </p>
            )}

            <div className="min-h-0 flex-1 p-3">
              {activeTab.currentUrl ? (
                <iframe
                  key={`${activeTab.id}-${activeTab.reloadNonce}-${activeTab.currentUrl}`}
                  src={activeTab.currentUrl}
                  className="h-full w-full rounded-md border border-border bg-white ring-1 ring-border"
                  title={`Preview tab: ${activeTab.title}`}
                  sandbox="allow-scripts allow-same-origin"
                />
              ) : (
                <EmptyState
                  icon={FileText}
                  title={loadingTabs ? "Loading tabs" : "Enter a URL"}
                  description="Paste an http or https URL to open it in this preview tab."
                />
              )}
            </div>
          </div>
        )
      )}
    </div>
  );
}

function toPreviewTab(tab: ReportPreviewCustomTab): PreviewTab {
  return {
    ...tab,
    persisted: true,
    inputUrl: tab.url,
    currentUrl: tab.url,
    history: [tab.url],
    historyIndex: 0,
    reloadNonce: 0,
    error: null,
  };
}

function normalizeCustomUrl(value: string): string | null {
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

function reportSummaryUrl(reportName: string, namespace: string): string {
  return `/api/reports/${encodeURIComponent(reportName)}?${namespaceQuery(namespace)}`;
}

function reportTabsApiUrl(reportName: string, namespace: string): string {
  return `/api/reports/${encodeURIComponent(reportName)}/tabs?${namespaceQuery(namespace)}`;
}

function namespaceQuery(namespace: string): string {
  return `namespace=${encodeURIComponent(namespace)}`;
}

function tabClassName(selected: boolean): string {
  return cn(
    "mb-0 inline-flex h-8 min-w-0 items-center gap-1 rounded-t-md border border-border border-b-0 px-3 text-xs font-medium transition-colors",
    selected
      ? "bg-panel text-foreground"
      : "bg-panel-raised text-muted-foreground hover:text-foreground"
  );
}
