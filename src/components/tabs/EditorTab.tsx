"use client";

import dynamic from "next/dynamic";
import { useRef, useState } from "react";
import { Code2, OctagonX, Play, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false);
  const {
    namespace,
    getSession,
    runScript,
    cancelRun,
    activeRunners,
    globalRuns,
    runnerCapacity,
  } = useScriptWorkspace();

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
  const selectedActiveRun = globalRuns.find(
    (run) => run.namespace === namespace && run.script === filename
  );
  const selectedScriptRunning = selectedActiveRun !== undefined;
  const runnersFull = activeRunners >= runnerCapacity && !selectedScriptRunning;

  async function handleRun() {
    if (!filename) return;
    await editorRef.current?.save();
    await runScript(filename);
  }

  function handleConfirmCancel() {
    if (!selectedActiveRun) return;
    setCancelConfirmOpen(false);
    void cancelRun(selectedActiveRun.id);
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
          disabled={session.isRunning || selectedScriptRunning || runnersFull}
          onClick={() => void handleRun()}
        >
          <Play className="h-3 w-3" />
          {session.isRunning || selectedScriptRunning ? "Running…" : "Run test"}
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-7 gap-1 border-destructive/40 px-2 text-xs text-destructive hover:border-destructive/70 hover:bg-destructive/10 hover:text-destructive disabled:border-border disabled:text-muted-foreground"
          disabled={!selectedActiveRun}
          onClick={() => setCancelConfirmOpen(true)}
        >
          <OctagonX className="h-3 w-3" />
          Cancel run
        </Button>
      </div>

      <Dialog open={cancelConfirmOpen} onOpenChange={setCancelConfirmOpen}>
        <DialogContent className="border-border bg-panel-raised">
          <DialogHeader>
            <DialogTitle>Cancel running test?</DialogTitle>
            <DialogDescription>
              This stops the active k6 process for {filename}. Cancelled runs are
              not saved to test history.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelConfirmOpen(false)}>
              Keep running
            </Button>
            <Button variant="destructive" onClick={handleConfirmCancel}>
              Confirm cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ResizablePanelGroup
        direction="vertical"
        autoSaveId="k6-studio-layout-v"
        className="min-h-0 flex-1"
      >
        <ResizablePanel defaultSize={70} minSize={20} className="overflow-hidden">
          <ScriptEditor
            ref={editorRef}
            namespace={namespace}
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
