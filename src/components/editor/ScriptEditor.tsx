"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import MonacoEditor from "@monaco-editor/react";
import type * as Monaco from "monaco-editor";

export interface ScriptEditorHandle {
  save: () => Promise<void>;
  getContent: () => string;
}

export interface ScriptEditorProps {
  filename: string;
  onSaveStatusChange?: (status: "saved" | "saving" | "unsaved") => void;
}

const ScriptEditor = forwardRef<ScriptEditorHandle, ScriptEditorProps>(
  function ScriptEditor({ filename, onSaveStatusChange }, ref) {
    const [content, setContent] = useState("");
    const contentRef = useRef("");
    const editorInstanceRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
      async function load() {
        const res = await fetch(`/api/files/${encodeURIComponent(filename)}`);
        const data = (await res.json()) as { name: string; content: string };
        setContent(data.content);
        contentRef.current = data.content;
        onSaveStatusChange?.("saved");
      }
      void load();
    }, [filename, onSaveStatusChange]);

    // Trigger Monaco layout() when the container is resized (e.g. panel drag)
    useEffect(() => {
      const container = containerRef.current;
      if (!container) return;
      const observer = new ResizeObserver(() => {
        editorInstanceRef.current?.layout();
      });
      observer.observe(container);
      return () => observer.disconnect();
    }, []);

    function handleChange(value: string | undefined) {
      const v = value ?? "";
      setContent(v);
      contentRef.current = v;
      onSaveStatusChange?.("unsaved");
    }

    async function save() {
      onSaveStatusChange?.("saving");
      await fetch(`/api/files/${encodeURIComponent(filename)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: contentRef.current }),
      });
      onSaveStatusChange?.("saved");
    }

    useImperativeHandle(ref, () => ({
      save,
      getContent() {
        return contentRef.current;
      },
    }));

    function handleEditorMount(
      editor: Monaco.editor.IStandaloneCodeEditor,
      monaco: typeof Monaco
    ) {
      editorInstanceRef.current = editor;
      editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
        void save();
      });
    }

    return (
      <div ref={containerRef} className="h-full border-t border-border">
        <MonacoEditor
          height="100%"
          language="typescript"
          theme="vs-dark"
          value={content}
          onChange={handleChange}
          onMount={handleEditorMount}
          options={{
            fontSize: 14,
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            wordWrap: "on",
            tabSize: 2,
          }}
        />
      </div>
    );
  }
);

export default ScriptEditor;
