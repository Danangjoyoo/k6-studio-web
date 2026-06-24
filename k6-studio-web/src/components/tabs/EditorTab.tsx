"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Play, Save } from "lucide-react";
import ScriptEditor, {
  ScriptEditorHandle,
} from "@/components/editor/ScriptEditor";
import Terminal from "@/components/terminal/Terminal";
import { useK6Runner } from "@/hooks/useK6Runner";

export interface EditorTabProps {
  filename: string | null;
}

export default function EditorTab({ filename }: EditorTabProps) {
  const editorRef = useRef<ScriptEditorHandle>(null);
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "unsaved">(
    "saved"
  );
  const { state: runnerState, run } = useK6Runner();

  if (!filename) {
    return (
      <div className="flex-1 flex items-center justify-center text-slate-400 text-sm">
        Select a file to edit
      </div>
    );
  }

  async function handleRun() {
    if (!filename) return;
    await editorRef.current?.save();
    await run(filename);
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-800 border-b border-slate-700 shrink-0">
        <span className="text-slate-300 text-sm font-medium truncate mr-auto">
          {filename}
        </span>
        <span className="text-xs text-slate-500">{saveStatus}</span>
        <Button
          variant="outline"
          size="sm"
          className="h-7 px-2 text-xs"
          disabled={saveStatus === "saving"}
          onClick={() => void editorRef.current?.save()}
        >
          <Save className="h-3 w-3 mr-1" />
          Save
        </Button>
        <Button
          size="sm"
          className="h-7 px-2 text-xs bg-green-600 hover:bg-green-700"
          disabled={runnerState.isRunning}
          onClick={() => void handleRun()}
        >
          <Play className="h-3 w-3 mr-1" />
          {runnerState.isRunning ? "Running…" : "Run"}
        </Button>
      </div>

      <div className="min-h-0" style={{ flex: "3 1 0" }}>
        <ScriptEditor
          ref={editorRef}
          filename={filename}
          onSaveStatusChange={setSaveStatus}
        />
      </div>

      <div className="shrink-0" style={{ flex: "2 1 0", minHeight: "8rem" }}>
        <Terminal lines={runnerState.lines} isRunning={runnerState.isRunning} />
      </div>
    </div>
  );
}
