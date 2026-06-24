"use client";

import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import FileExplorer from "@/components/file-explorer/FileExplorer";
import EditorTab from "@/components/tabs/EditorTab";
import LiveDashboardTab from "@/components/tabs/LiveDashboardTab";
import TestHistoryTab from "@/components/tabs/TestHistoryTab";

export default function AppShell() {
  const [selectedFile, setSelectedFile] = useState<string | null>(null);

  function handleFileDeleted(name: string) {
    setSelectedFile((current) => (current === name ? null : current));
  }

  return (
    <div className="flex h-screen bg-slate-950 text-slate-100 overflow-hidden">
      <aside className="w-56 shrink-0 overflow-hidden">
        <FileExplorer
          selectedFile={selectedFile}
          onSelectFile={setSelectedFile}
          onFileDeleted={handleFileDeleted}
        />
      </aside>

      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Tabs defaultValue="editor" className="flex flex-col h-full">
          <TabsList className="shrink-0 rounded-none border-b border-slate-700 bg-slate-900 justify-start px-2 h-9">
            <TabsTrigger
              value="editor"
              className="text-xs h-7 data-[state=active]:bg-slate-700"
            >
              Editor
            </TabsTrigger>
            <TabsTrigger
              value="live-dashboard"
              className="text-xs h-7 data-[state=active]:bg-slate-700"
            >
              Live Dashboard
            </TabsTrigger>
            <TabsTrigger
              value="test-history"
              className="text-xs h-7 data-[state=active]:bg-slate-700"
            >
              Test History
            </TabsTrigger>
          </TabsList>

          <TabsContent
            value="editor"
            className="flex-1 mt-0 overflow-hidden data-[state=inactive]:hidden"
          >
            <EditorTab filename={selectedFile} />
          </TabsContent>

          <TabsContent
            value="live-dashboard"
            className="flex-1 mt-0 overflow-hidden data-[state=inactive]:hidden"
          >
            <LiveDashboardTab />
          </TabsContent>

          <TabsContent
            value="test-history"
            className="flex-1 mt-0 overflow-hidden data-[state=inactive]:hidden"
          >
            <TestHistoryTab />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
