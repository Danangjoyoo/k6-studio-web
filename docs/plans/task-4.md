# Task 4: Monaco Editor + Save

> [← Master Plan](./master.md)

**Goal:** Wrap Monaco Editor in a `ScriptEditor` component that loads a script's content from MinIO and saves changes back on demand. Exposes a `ref` so the parent can trigger save externally.

**Consumes (from Task 2):**
- `GET /api/files/[name]` → `{ name: string; content: string }`
- `PUT /api/files/[name]` → body `{ content: string }` → `200 { name: string }`

**Files:**
- Create: `src/components/editor/ScriptEditor.tsx`
- Create: `src/components/editor/__tests__/ScriptEditor.test.tsx`

**Interfaces produced (consumed by Tasks 6, 9):**

```ts
export interface ScriptEditorHandle {
  save: () => Promise<void>;
  getContent: () => string;
}

export interface ScriptEditorProps {
  filename: string;
  onSaveStatusChange?: (status: "saved" | "saving" | "unsaved") => void;
}
```

---

- [ ] **Step 1: Write failing test**

Create `src/components/editor/__tests__/ScriptEditor.test.tsx`:

```tsx
/**
 * @jest-environment jsdom
 */
import { render, waitFor } from "@testing-library/react";
import { createRef } from "react";
import ScriptEditor, {
  ScriptEditorHandle,
} from "@/components/editor/ScriptEditor";

jest.mock("@monaco-editor/react", () => ({
  __esModule: true,
  default: ({
    value,
    onChange,
  }: {
    value: string;
    onChange: (v: string) => void;
  }) => (
    <textarea
      data-testid="monaco"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  ),
}));

global.fetch = jest.fn((url: string, opts?: RequestInit) => {
  if (!opts?.method || opts.method === "GET") {
    return Promise.resolve({
      ok: true,
      json: async () => ({ name: "test.js", content: "// hello" }),
    });
  }
  return Promise.resolve({
    ok: true,
    json: async () => ({ name: "test.js" }),
  });
}) as jest.Mock;

describe("ScriptEditor", () => {
  it("loads content from API on mount", async () => {
    const ref = createRef<ScriptEditorHandle>();
    const { getByTestId } = render(
      <ScriptEditor filename="test.js" ref={ref} />
    );
    await waitFor(() => {
      expect((getByTestId("monaco") as HTMLTextAreaElement).value).toBe(
        "// hello"
      );
    });
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
npx jest src/components/editor/__tests__/ScriptEditor.test.tsx
```

Expected: FAIL — `Cannot find module '@/components/editor/ScriptEditor'`

- [ ] **Step 3: Implement `src/components/editor/ScriptEditor.tsx`**

```tsx
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

    useImperativeHandle(ref, () => ({
      async save() {
        onSaveStatusChange?.("saving");
        await fetch(`/api/files/${encodeURIComponent(filename)}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: contentRef.current }),
        });
        onSaveStatusChange?.("saved");
      },
      getContent() {
        return contentRef.current;
      },
    }));

    function handleEditorMount(
      editor: Monaco.editor.IStandaloneCodeEditor,
      monaco: typeof Monaco
    ) {
      editor.addCommand(
        monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS,
        () => {
          void (ref as React.RefObject<ScriptEditorHandle>)?.current?.save();
        }
      );
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
```

- [ ] **Step 4: Run test to confirm it passes**

```bash
npx jest src/components/editor/__tests__/ScriptEditor.test.tsx
```

Expected: PASS

- [ ] **Step 5: Smoke-test in browser**

Temporarily update `src/app/page.tsx`:

```tsx
"use client";
import { useRef, useState } from "react";
import FileExplorer from "@/components/file-explorer/FileExplorer";
import ScriptEditor, {
  ScriptEditorHandle,
} from "@/components/editor/ScriptEditor";
import { Button } from "@/components/ui/button";

export default function Page() {
  const [selected, setSelected] = useState<string | null>(null);
  const [status, setStatus] = useState<"saved" | "saving" | "unsaved">("saved");
  const editorRef = useRef<ScriptEditorHandle>(null);

  return (
    <div className="flex h-screen bg-slate-950">
      <div className="w-56">
        <FileExplorer selectedFile={selected} onSelectFile={setSelected} />
      </div>
      <div className="flex-1 flex flex-col">
        <div className="flex gap-2 p-2 border-b border-slate-700">
          <Button
            size="sm"
            onClick={() => void editorRef.current?.save()}
            disabled={status !== "unsaved"}
          >
            {status === "saving" ? "Saving…" : "Save"}
          </Button>
          <span className="text-xs text-slate-400 self-center">{status}</span>
        </div>
        {selected ? (
          <ScriptEditor
            ref={editorRef}
            filename={selected}
            onSaveStatusChange={setStatus}
          />
        ) : (
          <div className="flex-1 flex items-center justify-center text-slate-400">
            Select a file to edit
          </div>
        )}
      </div>
    </div>
  );
}
```

```bash
docker compose up minio -d && npm run dev
```

1. Create a script in the file explorer.
2. Edit content in Monaco.
3. Click Save — status changes to "saved".
4. Reload page, reselect file — content matches what was saved.
5. Press Cmd/Ctrl+S — triggers save as well.

- [ ] **Step 6: Commit**

```bash
docker compose down
git checkout src/app/page.tsx
git add src/components/editor/
git commit -m "feat: add Monaco editor with load/save to MinIO"
```
