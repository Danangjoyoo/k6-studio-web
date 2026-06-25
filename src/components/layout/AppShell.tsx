"use client";

import { useState } from "react";
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
import { cn } from "@/lib/utils";

function WorkspaceContent({
  selectedFile,
  onSelectFile,
  onFileDeleted,
  onFileRenamed,
}: {
  selectedFile: string | null;
  onSelectFile: (name: string) => void;
  onFileDeleted: (name: string) => void;
  onFileRenamed: (oldPath: string, newPath: string) => void;
}) {
  const { runEpoch, globalRunning, globalRunningScript } = useScriptWorkspace();

  return (
    <>
      <AppHeader activeRunners={globalRunning ? 1 : 0} runningScript={globalRunningScript} />

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
            selectedFile={selectedFile}
            onSelectFile={onSelectFile}
            onFileDeleted={onFileDeleted}
            onFileRenamed={onFileRenamed}
            globalRunningScript={globalRunningScript}
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
                  isActiveRun={
                    globalRunning && globalRunningScript === selectedFile && selectedFile !== null
                  }
                  runEpoch={runEpoch}
                />
              </TabsContent>

              <TabsContent
                value="test-history"
                className="mt-0 h-full min-h-0 flex-1 overflow-hidden data-[state=inactive]:hidden"
              >
                <TestHistoryTab scriptName={selectedFile} />
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

  function handleFileDeleted(name: string) {
    setSelectedFile((current) => (current === name ? null : current));
  }

  function handleFileRenamed(oldPath: string, newPath: string) {
    setSelectedFile((current) => (current === oldPath ? newPath : current));
  }

  return (
    <div className="grid h-screen grid-rows-[auto_1fr] overflow-hidden bg-background">
      <ScriptWorkspaceProvider
        selectedFile={selectedFile}
        onSelectFile={setSelectedFile}
      >
        <WorkspaceContent
          selectedFile={selectedFile}
          onSelectFile={setSelectedFile}
          onFileDeleted={handleFileDeleted}
          onFileRenamed={handleFileRenamed}
        />
      </ScriptWorkspaceProvider>
    </div>
  );
}
