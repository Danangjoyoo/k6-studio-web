"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import MonacoEditor from "@monaco-editor/react";
import type { Monaco } from "@monaco-editor/react";
import type * as MonacoEditor_ from "monaco-editor";

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
    const editorInstanceRef = useRef<MonacoEditor_.editor.IStandaloneCodeEditor | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
      async function load() {
        const res = await fetch(`/api/files/${filename}`);
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
      await fetch(`/api/files/${filename}`, {
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
      editor: MonacoEditor_.editor.IStandaloneCodeEditor,
      monaco: Monaco
    ) {
      editorInstanceRef.current = editor;
      editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
        void save();
      });

      // Bundler module resolution (100) maps the ESM-style `.js` imports inside
      // @types/k6 v2 to their `.d.ts` counterparts. Explicit `paths` map the
      // bare/subpath specifiers ("k6", "k6/http", "k6/net/grpc", …) directly to
      // the injected declaration files — Monaco's worker does not perform the
      // node_modules/@types directory fallback, so this mapping is required.
      monaco.typescript.typescriptDefaults.setCompilerOptions({
        ...monaco.typescript.typescriptDefaults.getCompilerOptions(),
        moduleResolution: 100, // ModuleResolutionKind.Bundler
        allowNonTsExtensions: true,
        baseUrl: "file:///",
        paths: {
          k6: ["node_modules/@types/k6/index.d.ts"],
          "k6/*": ["node_modules/@types/k6/*/index.d.ts"],
        },
      });

      // Inject k6 type definitions generated at build time (best-effort).
      // Each .d.ts file is also registered at the .js path so that relative
      // cross-imports like `import ... from "../html/index.js"` resolve.
      void fetch("/k6-types.json")
        .then((r) => r.json())
        .then((types: Array<{ path: string; content: string }>) => {
          for (const { path, content } of types) {
            const base = `file:///node_modules/@types/k6/${path}`;
            monaco.typescript.typescriptDefaults.addExtraLib(content, base);
            if (path.endsWith(".d.ts")) {
              monaco.typescript.typescriptDefaults.addExtraLib(
                content,
                base.replace(/\.d\.ts$/, ".js")
              );
            }
          }
        })
        .catch(() => {
          // Types unavailable — squiggles remain but editor still works
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
