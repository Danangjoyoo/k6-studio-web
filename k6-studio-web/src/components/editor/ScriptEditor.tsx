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
      editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
        void save();
      });
    }

    return (
      <MonacoEditor
        height="100%"
        language="javascript"
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
    );
  }
);

export default ScriptEditor;
