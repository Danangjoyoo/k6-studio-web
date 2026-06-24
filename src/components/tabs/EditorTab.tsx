"use client";

import dynamic from "next/dynamic";
import { useRef, useState } from "react";
import { Code2, Play, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import EmptyState from "@/components/layout/EmptyState";
import StatusPill from "@/components/layout/StatusPill";
import ScriptEditor, {
  ScriptEditorHandle,
} from "@/components/editor/ScriptEditor";
import { useScriptWorkspace } from "@/contexts/ScriptWorkspaceContext";

const Terminal = dynamic(() => import("@/components/terminal/Terminal"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center bg-terminal font-mono text-xs text-muted-foreground">
      Loading output…
    </div>
  ),
});

export interface EditorTabProps {
  filename: string | null;
}

export default function EditorTab({ filename }: EditorTabProps) {
  const editorRef = useRef<ScriptEditorHandle>(null);
  const [saveStatus, setSaveStatus] = useState<
    "saved" | "saving" | "unsaved"
  >("saved");
  const { getSession, runScript, globalRunning, globalRunningScript } = useScriptWorkspace();

  if (!filename) {
    return (
      <EmptyState
        icon={Code2}
        title="Select a file"
        description="Choose a script from the sidebar, or create one. Then edit and run your load test."
      />
    );
  }

  const session = getSession(filename);
  // Blocked when any other script (local session OR server-authoritative) is running
  const anotherScriptRunning =
    globalRunning && globalRunningScript !== filename;

  async function handleRun() {
    if (!filename) return;
    await editorRef.current?.save();
    await runScript(filename);
  }

  const statusVariant =
    saveStatus === "saved"
      ? "saved"
      : saveStatus === "saving"
        ? "saving"
        : "unsaved";

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="flex shrink-0 items-center gap-2 border-b border-border bg-panel px-3 py-2">
        <span className="mr-auto truncate font-mono text-xs text-foreground">
          {filename}
        </span>
        <StatusPill variant={statusVariant} />
        <Button
          variant="outline"
          size="sm"
          className="h-7 gap-1 px-2 text-xs"
          disabled={saveStatus === "saving"}
          onClick={() => void editorRef.current?.save()}
        >
          <Save className="h-3 w-3" />
          Save script
        </Button>
        <Button
          size="sm"
          className="h-7 gap-1 bg-run px-2 text-xs text-void shadow-none hover:bg-run/90 hover:shadow-[0_0_12px_rgba(245,165,36,0.25)] active:scale-[0.98] disabled:opacity-50"
          disabled={session.isRunning || anotherScriptRunning}
          onClick={() => void handleRun()}
        >
          <Play className="h-3 w-3" />
          {session.isRunning ? "Running…" : "Run test"}
        </Button>
      </div>

      <ResizablePanelGroup
        direction="vertical"
        autoSaveId="k6-studio-layout-v"
        className="min-h-0 flex-1"
      >
        <ResizablePanel defaultSize={70} minSize={20} className="overflow-hidden">
          <ScriptEditor
            ref={editorRef}
            filename={filename}
            onSaveStatusChange={setSaveStatus}
          />
        </ResizablePanel>

        <ResizableHandle withHandle direction="vertical" />

        <ResizablePanel
          defaultSize={30}
          minSize={10}
          className="min-h-0 overflow-hidden border-t border-border"
        >
          <Terminal
            lines={session.lines}
            isRunning={session.isRunning}
            resetKey={filename}
          />
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}
