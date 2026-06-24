# Task 3: File Explorer

> [← Master Plan](./master.md)

**Goal:** Build the left-sidebar file explorer that lists scripts from MinIO, lets users create new scripts, and delete existing ones. Clicking a file notifies the parent via `onSelectFile`.

**Consumes (from Task 2):**
- `GET /api/files` → `{ files: { name: string; size: number; lastModified: string }[] }`
- `POST /api/files` → body `{ name: string; content: string }` → `201 { name: string }`
- `DELETE /api/files/[name]` → `204`

**Files:**
- Create: `src/components/file-explorer/FileExplorer.tsx`
- Create: `src/components/file-explorer/FileItem.tsx`
- Create: `src/components/file-explorer/NewFileDialog.tsx`
- Create: `src/components/file-explorer/__tests__/FileExplorer.test.tsx`

**Interfaces produced (consumed by Tasks 6, 9):**

```ts
export interface FileExplorerProps {
  selectedFile: string | null;
  onSelectFile: (name: string) => void;
}
```

---

- [ ] **Step 1: Add missing shadcn components**

```bash
npx shadcn@latest add dialog input
```

Expected: `src/components/ui/dialog.tsx` and `src/components/ui/input.tsx` created.

- [ ] **Step 2: Write failing test**

Create `src/components/file-explorer/__tests__/FileExplorer.test.tsx`:

```tsx
/**
 * @jest-environment jsdom
 */
import { render, screen, waitFor } from "@testing-library/react";
import FileExplorer from "@/components/file-explorer/FileExplorer";

global.fetch = jest.fn().mockResolvedValue({
  ok: true,
  json: async () => ({
    files: [
      { name: "script.js", size: 100, lastModified: "2024-01-01T00:00:00.000Z" },
    ],
  }),
}) as jest.Mock;

describe("FileExplorer", () => {
  it("renders file list from API", async () => {
    render(<FileExplorer selectedFile={null} onSelectFile={jest.fn()} />);
    await waitFor(() => {
      expect(screen.getByText("script.js")).toBeInTheDocument();
    });
  });
});
```

- [ ] **Step 3: Run test to confirm it fails**

```bash
npx jest src/components/file-explorer/__tests__/FileExplorer.test.tsx
```

Expected: FAIL — `Cannot find module '@/components/file-explorer/FileExplorer'`

- [ ] **Step 4: Implement `src/components/file-explorer/FileItem.tsx`**

```tsx
"use client";

import { Trash2, FileCode } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface FileItemProps {
  name: string;
  isSelected: boolean;
  onClick: () => void;
  onDelete: () => void;
}

export default function FileItem({
  name,
  isSelected,
  onClick,
  onDelete,
}: FileItemProps) {
  return (
    <TooltipProvider>
      <div
        className={`group flex items-center justify-between px-2 py-1 rounded cursor-pointer text-sm ${
          isSelected
            ? "bg-slate-700 text-white"
            : "text-slate-300 hover:bg-slate-800"
        }`}
        onClick={onClick}
      >
        <div className="flex items-center gap-2 truncate">
          <FileCode className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{name}</span>
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-5 w-5 opacity-0 group-hover:opacity-100 shrink-0"
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Delete</TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  );
}
```

- [ ] **Step 5: Implement `src/components/file-explorer/NewFileDialog.tsx`**

```tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

interface NewFileDialogProps {
  onCreate: (name: string) => Promise<void>;
}

export default function NewFileDialog({ onCreate }: NewFileDialogProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    const filename = name.trim().endsWith(".js")
      ? name.trim()
      : `${name.trim()}.js`;
    await onCreate(filename);
    setName("");
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="w-full text-xs">
          + New Script
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New k6 Script</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <Input
            placeholder="script-name.js"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
          <Button type="submit">Create</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 6: Implement `src/components/file-explorer/FileExplorer.tsx`**

```tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import FileItem from "./FileItem";
import NewFileDialog from "./NewFileDialog";

interface FileInfo {
  name: string;
  size: number;
  lastModified: string;
}

export interface FileExplorerProps {
  selectedFile: string | null;
  onSelectFile: (name: string) => void;
}

const DEFAULT_SCRIPT = `import http from "k6/http";
import { sleep } from "k6";

export const options = {
  vus: 10,
  duration: "30s",
};

export default function () {
  http.get("https://test.k6.io");
  sleep(1);
}
`;

export default function FileExplorer({
  selectedFile,
  onSelectFile,
}: FileExplorerProps) {
  const [files, setFiles] = useState<FileInfo[]>([]);

  const fetchFiles = useCallback(async () => {
    const res = await fetch("/api/files");
    const data = (await res.json()) as { files: FileInfo[] };
    setFiles(data.files);
  }, []);

  useEffect(() => {
    void fetchFiles();
  }, [fetchFiles]);

  async function handleCreate(name: string) {
    await fetch("/api/files", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, content: DEFAULT_SCRIPT }),
    });
    await fetchFiles();
    onSelectFile(name);
  }

  async function handleDelete(name: string) {
    await fetch(`/api/files/${encodeURIComponent(name)}`, { method: "DELETE" });
    await fetchFiles();
  }

  return (
    <div className="flex flex-col h-full bg-slate-900 border-r border-slate-700">
      <div className="px-3 py-2 text-xs font-semibold text-slate-400 uppercase tracking-wider border-b border-slate-700">
        Scripts
      </div>
      <ScrollArea className="flex-1 px-2 py-1">
        {files.map((f) => (
          <FileItem
            key={f.name}
            name={f.name}
            isSelected={selectedFile === f.name}
            onClick={() => onSelectFile(f.name)}
            onDelete={() => void handleDelete(f.name)}
          />
        ))}
      </ScrollArea>
      <div className="px-3 py-2 border-t border-slate-700">
        <NewFileDialog onCreate={handleCreate} />
      </div>
    </div>
  );
}
```

- [ ] **Step 7: Run test to confirm it passes**

```bash
npx jest src/components/file-explorer/__tests__/FileExplorer.test.tsx
```

Expected: PASS

- [ ] **Step 8: Smoke-test in browser**

Temporarily add to `src/app/page.tsx`:

```tsx
"use client";
import { useState } from "react";
import FileExplorer from "@/components/file-explorer/FileExplorer";

export default function Page() {
  const [selected, setSelected] = useState<string | null>(null);
  return (
    <div className="flex h-screen bg-slate-950">
      <div className="w-56">
        <FileExplorer selectedFile={selected} onSelectFile={setSelected} />
      </div>
      <div className="flex-1 flex items-center justify-center text-slate-400">
        {selected ? `Selected: ${selected}` : "No file selected"}
      </div>
    </div>
  );
}
```

```bash
docker compose up minio -d && npm run dev
```

Visit `http://localhost:3000`. Create a script, select it, delete it. Confirm all work.

- [ ] **Step 9: Commit**

```bash
docker compose down
git checkout src/app/page.tsx
git add src/components/file-explorer/
git commit -m "feat: add file explorer sidebar with create/delete/select"
```
