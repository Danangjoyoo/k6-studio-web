# Task 6: Editor Tab Assembly

> [← Master Plan](./master.md)

**Goal:** Combine `ScriptEditor`, `Terminal`, and the Run/Save toolbar into `EditorTab`. The toolbar has a Save button, a Run button, and a save-status indicator. Run auto-saves then triggers `useK6Runner`. Save triggers `ScriptEditor.save()`.

**Consumes (from Tasks 3–5):**
- `ScriptEditorHandle` — `{ save(): Promise<void>; getContent(): string }`
- `ScriptEditorProps` — `{ filename: string; onSaveStatusChange? }`
- `TerminalProps` — `{ lines: string[]; isRunning: boolean }`
- `useK6Runner()` — `{ state: K6RunnerState; run(filename: string): Promise<void> }`

**Files:**
- Create: `src/components/tabs/EditorTab.tsx`
- Create: `src/components/tabs/__tests__/EditorTab.test.tsx`

**Interfaces produced (consumed by Task 9):**

```ts
export interface EditorTabProps {
  filename: string | null;
}
```

---

- [ ] **Step 1: Write failing test**

Create `src/components/tabs/__tests__/EditorTab.test.tsx`:

```tsx
/**
 * @jest-environment jsdom
 */
import { render, screen } from "@testing-library/react";
import EditorTab from "@/components/tabs/EditorTab";

jest.mock("@/components/editor/ScriptEditor", () => ({
  __esModule: true,
  default: jest.fn(() => <div data-testid="editor" />),
}));

jest.mock("@/components/terminal/Terminal", () => ({
  __esModule: true,
  default: jest.fn(({ lines }: { lines: string[] }) => (
    <div data-testid="terminal">{lines.join(",")}</div>
  )),
}));

jest.mock("@/hooks/useK6Runner", () => ({
  useK6Runner: () => ({
    state: {
      lines: [],
      isRunning: false,
      lastExitCode: null,
      lastReportName: null,
    },
    run: jest.fn(),
  }),
}));

describe("EditorTab", () => {
  it("renders placeholder when no file is selected", () => {
    render(<EditorTab filename={null} />);
    expect(screen.getByText(/select a file/i)).toBeInTheDocument();
  });

  it("renders editor and terminal when a file is selected", () => {
    render(<EditorTab filename="script.js" />);
    expect(screen.getByTestId("editor")).toBeInTheDocument();
    expect(screen.getByTestId("terminal")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
npx jest src/components/tabs/__tests__/EditorTab.test.tsx
```

Expected: FAIL — `Cannot find module '@/components/tabs/EditorTab'`

- [ ] **Step 3: Implement `src/components/tabs/EditorTab.tsx`**

```tsx
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
```

- [ ] **Step 4: Run test to confirm it passes**

```bash
npx jest src/components/tabs/__tests__/EditorTab.test.tsx
```

Expected: PASS

- [ ] **Step 5: Smoke-test in browser**

Temporarily update `src/app/page.tsx`:

```tsx
"use client";
import { useState } from "react";
import FileExplorer from "@/components/file-explorer/FileExplorer";
import EditorTab from "@/components/tabs/EditorTab";

export default function Page() {
  const [selected, setSelected] = useState<string | null>(null);
  return (
    <div className="flex h-screen bg-slate-950">
      <div className="w-56">
        <FileExplorer selectedFile={selected} onSelectFile={setSelected} />
      </div>
      <div className="flex-1 overflow-hidden">
        <EditorTab filename={selected} />
      </div>
    </div>
  );
}
```

```bash
docker compose up minio -d && npm run dev
```

1. Create a script, select it.
2. Click **Run** — terminal streams k6 output, Run button shows "Running…".
3. Click **Save** — status shows "saved".
4. Press Cmd/Ctrl+S — also saves.

- [ ] **Step 6: Commit**

```bash
docker compose down
git checkout src/app/page.tsx
git add src/components/tabs/EditorTab.tsx src/components/tabs/__tests__/
git commit -m "feat: assemble editor tab with toolbar, Monaco editor, and terminal"
```
