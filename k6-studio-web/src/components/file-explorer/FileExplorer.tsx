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
  onFileDeleted?: (name: string) => void;
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
  onFileDeleted,
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
    onFileDeleted?.(name);
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
