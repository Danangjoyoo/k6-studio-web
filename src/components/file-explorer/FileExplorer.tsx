"use client";

import { useCallback, useEffect, useState } from "react";
import { FileCode2 } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import EmptyState from "@/components/layout/EmptyState";
import PanelHeader from "@/components/layout/PanelHeader";
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

const DEFAULT_SCRIPT = `// example script
import http from 'k6/http';
import { sleep } from 'k6';

export const options = {
  stages: [
    { duration: '5s', target: 10 }, // traffic ramp-up from 1 to a higher 10 users over 5s.
    { duration: '15s', target: 10 }, // stay at higher 10 users for 15s
    { duration: '5s', target: 0 }, // ramp-down to 0 users
  ],
};

export default () => {
  const urlRes = http.get("https://test.k6.io");
  sleep(1);
  // MORE STEPS
  // Here you can have more steps or complex script
  // Step1
  // Step2
  // etc.
};
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
    <div className="flex h-full flex-col">
      <PanelHeader
        label="Scripts"
        badge={
          <span className="rounded-full border border-border bg-panel-raised px-1.5 py-px font-mono text-[10px] text-muted-foreground">
            {files.length}
          </span>
        }
        className="load-lab-grid"
      />
      <ScrollArea className="flex-1 px-1 py-1">
        {files.length === 0 ? (
          <EmptyState
            icon={FileCode2}
            title="No scripts yet"
            description="Create a script to start a load test."
            className="py-8"
          />
        ) : (
          files.map((f) => (
            <FileItem
              key={f.name}
              name={f.name}
              isSelected={selectedFile === f.name}
              onClick={() => onSelectFile(f.name)}
              onDelete={() => void handleDelete(f.name)}
            />
          ))
        )}
      </ScrollArea>
      <div className="border-t border-sidebar-border p-3">
        <NewFileDialog onCreate={handleCreate} />
      </div>
    </div>
  );
}
