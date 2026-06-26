"use client";

import { useCallback, useEffect, useState } from "react";
import { Activity, Code2, History } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import {
  ScriptWorkspaceProvider,
  useScriptWorkspace,
} from "@/contexts/ScriptWorkspaceContext";
import AppHeader from "@/components/layout/AppHeader";
import FileExplorer from "@/components/file-explorer/FileExplorer";
import EditorTab from "@/components/tabs/EditorTab";
import LiveDashboardTab from "@/components/tabs/LiveDashboardTab";
import TestHistoryTab from "@/components/tabs/TestHistoryTab";
import { DEFAULT_NAMESPACE } from "@/lib/namespaces";
import { cn } from "@/lib/utils";

type PathOperationType = "file" | "folder";

function WorkspaceContent({
  selectedFile,
  onSelectFile,
  onSelectNamespace,
  onFileDeleted,
  onFileRenamed,
}: {
  selectedFile: string | null;
  onSelectFile: (name: string) => void;
  onSelectNamespace: (namespace: string) => void;
  onFileDeleted: (name: string) => void;
  onFileRenamed: (
    oldPath: string,
    newPath: string,
    type?: PathOperationType
  ) => void;
}) {
  const {
    namespace,
    runEpoch,
    activeRunners,
    globalRuns,
    runnerCapacity,
  } = useScriptWorkspace();
  const activeRuns = globalRuns ?? [];
  const runningScriptsForNamespace = activeRuns
    .filter((run) => run.namespace === namespace)
    .map((run) => run.script);
  const selectedActiveRun =
    selectedFile === null
      ? null
      : activeRuns.find(
          (run) => run.namespace === namespace && run.script === selectedFile
        ) ?? null;

  return (
    <>
      <AppHeader
        namespace={namespace}
        onNamespaceChange={onSelectNamespace}
        activeRunners={activeRunners}
        runnerCapacity={runnerCapacity}
        activeRuns={activeRuns}
      />

      <ResizablePanelGroup
        direction="horizontal"
        autoSaveId="k6-studio-layout-h"
        className="min-h-0 flex-1"
      >
        <ResizablePanel
          defaultSize={15}
          minSize={10}
          maxSize={35}
          className="overflow-hidden border-r border-sidebar-border bg-sidebar"
        >
          <FileExplorer
            namespace={namespace}
            selectedFile={selectedFile}
            onSelectFile={onSelectFile}
            onFileDeleted={onFileDeleted}
            onFileRenamed={onFileRenamed}
            globalRunningScript={runningScriptsForNamespace[0] ?? null}
            globalRunningScripts={runningScriptsForNamespace}
          />
        </ResizablePanel>

        <ResizableHandle withHandle direction="horizontal" />

        <ResizablePanel defaultSize={85} minSize={50} className="overflow-hidden">
          <main className="flex h-full min-w-0 flex-col overflow-hidden">
            {selectedFile && (
              <div className="shrink-0 border-b border-border bg-panel px-3 py-1.5">
                <span className="rounded border border-border bg-panel-raised px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
                  {selectedFile}
                </span>
              </div>
            )}
            <Tabs defaultValue="editor" className="flex min-h-0 flex-1 flex-col overflow-hidden">
              <TabsList className="h-10 shrink-0 justify-start gap-0 rounded-none border-b border-border bg-panel px-2">
                <TabsTrigger
                  value="editor"
                  className={cn(
                    "h-8 gap-1.5 rounded-none border-b-2 border-transparent px-3 text-xs font-medium text-muted-foreground transition-colors duration-150",
                    "data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none"
                  )}
                >
                  <Code2 className="h-3.5 w-3.5" />
                  Editor
                </TabsTrigger>
                <TabsTrigger
                  value="live-dashboard"
                  className={cn(
                    "h-8 gap-1.5 rounded-none border-b-2 border-transparent px-3 text-xs font-medium text-muted-foreground transition-colors duration-150",
                    "data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none"
                  )}
                >
                  <Activity className="h-3.5 w-3.5" />
                  Live dashboard
                </TabsTrigger>
                <TabsTrigger
                  value="test-history"
                  className={cn(
                    "h-8 gap-1.5 rounded-none border-b-2 border-transparent px-3 text-xs font-medium text-muted-foreground transition-colors duration-150",
                    "data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none"
                  )}
                >
                  <History className="h-3.5 w-3.5" />
                  Test history
                </TabsTrigger>
              </TabsList>

              <TabsContent
                value="editor"
                className="mt-0 h-full min-h-0 flex-1 overflow-hidden data-[state=inactive]:hidden"
              >
                <EditorTab filename={selectedFile} />
              </TabsContent>

              <TabsContent
                value="live-dashboard"
                className="mt-0 h-full min-h-0 flex-1 overflow-hidden data-[state=inactive]:hidden"
              >
                <LiveDashboardTab
                  scriptName={selectedFile}
                  isActiveRun={selectedActiveRun !== null}
                  runEpoch={runEpoch}
                  runId={selectedActiveRun?.id ?? null}
                />
              </TabsContent>

              <TabsContent
                value="test-history"
                className="mt-0 h-full min-h-0 flex-1 overflow-hidden data-[state=inactive]:hidden"
              >
                <TestHistoryTab namespace={namespace} scriptName={selectedFile} />
              </TabsContent>
            </Tabs>
          </main>
        </ResizablePanel>
      </ResizablePanelGroup>
    </>
  );
}

export default function AppShell() {
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [selectedNamespace, setSelectedNamespace] = useState(DEFAULT_NAMESPACE);
  const [hasMounted, setHasMounted] = useState(false);

  useEffect(() => {
    const stored = window.localStorage.getItem("k6-studio-namespace");
    if (stored) {
      setSelectedNamespace(stored);
    }
    setHasMounted(true);
  }, []);

  useEffect(() => {
    if (!hasMounted) return;
    window.localStorage.setItem("k6-studio-namespace", selectedNamespace);
  }, [hasMounted, selectedNamespace]);

  const handleNamespaceChange = useCallback((namespace: string) => {
    setSelectedNamespace(namespace);
    setSelectedFile(null);
  }, []);

  function handleFileDeleted(name: string) {
    setSelectedFile((current) => (current === name ? null : current));
  }

  function handleFileRenamed(
    oldPath: string,
    newPath: string,
    type: PathOperationType = "file"
  ) {
    setSelectedFile((current) =>
      mapSelectedPathAfterOperation(current, oldPath, newPath, type)
    );
  }

  return (
    <div className="grid h-screen grid-rows-[auto_1fr] overflow-hidden bg-background">
      <ScriptWorkspaceProvider
        namespace={selectedNamespace}
        selectedFile={selectedFile}
        onSelectFile={setSelectedFile}
      >
        <WorkspaceContent
          selectedFile={selectedFile}
          onSelectFile={setSelectedFile}
          onSelectNamespace={handleNamespaceChange}
          onFileDeleted={handleFileDeleted}
          onFileRenamed={handleFileRenamed}
        />
      </ScriptWorkspaceProvider>
    </div>
  );
}

function mapSelectedPathAfterOperation(
  current: string | null,
  oldPath: string,
  newPath: string,
  type: PathOperationType
): string | null {
  if (!current) return current;

  if (type === "file") {
    return current === oldPath ? newPath : current;
  }

  const oldFolder = normalizeFolderPath(oldPath);
  const newFolder = normalizeFolderPath(newPath);
  const oldPrefix = `${oldFolder}/`;
  if (!current.startsWith(oldPrefix)) return current;

  return joinPath(newFolder, current.slice(oldPrefix.length));
}

function normalizeFolderPath(path: string): string {
  return path.replace(/\/+$/, "");
}

function joinPath(folder: string, suffix: string): string {
  return folder ? `${folder}/${suffix}` : suffix;
}
