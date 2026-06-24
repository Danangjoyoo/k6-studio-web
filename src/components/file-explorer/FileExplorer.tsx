"use client";

import { useCallback, useEffect, useState } from "react";
import { FileCode2 } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import EmptyState from "@/components/layout/EmptyState";
import PanelHeader from "@/components/layout/PanelHeader";
import FileItem from "./FileItem";
import FolderItem from "./FolderItem";
import NewFileDialog from "./NewFileDialog";
import NewFolderDialog from "./NewFolderDialog";
import type { FileNode } from "@/lib/files-tree";

export interface FileExplorerProps {
  selectedFile: string | null;
  onSelectFile: (name: string) => void;
  onFileDeleted?: (name: string) => void;
  onFileRenamed?: (oldPath: string, newPath: string) => void;
}

const DEFAULT_SCRIPT = `// example script
import http from 'k6/http';
import { sleep } from 'k6';

export const options = {
  stages: [
    { duration: '5s', target: 10 },
    { duration: '15s', target: 10 },
    { duration: '5s', target: 0 },
  ],
};

export default () => {
  http.get('https://test.k6.io');
  sleep(1);
};
`;

export default function FileExplorer({
  selectedFile,
  onSelectFile,
  onFileDeleted,
  onFileRenamed,
}: FileExplorerProps) {
  const [tree, setTree] = useState<FileNode[]>([]);
  const [scriptDialogOpen, setScriptDialogOpen] = useState(false);
  const [scriptDialogParent, setScriptDialogParent] = useState<string | null>(null);
  const [folderDialogOpen, setFolderDialogOpen] = useState(false);
  const [folderDialogParent, setFolderDialogParent] = useState<string | null>(null);

  const fetchTree = useCallback(async () => {
    const res = await fetch("/api/files");
    const data = (await res.json()) as { tree: FileNode[] };
    setTree(data.tree ?? []);
  }, []);

  useEffect(() => {
    void fetchTree();
  }, [fetchTree]);

  function openScriptDialog(parentPath: string | null) {
    setScriptDialogParent(parentPath);
    setScriptDialogOpen(true);
  }

  function handleScriptDialogOpenChange(open: boolean) {
    setScriptDialogOpen(open);
    if (!open) setScriptDialogParent(null);
  }

  function openFolderDialog(parentPath: string | null) {
    setFolderDialogParent(parentPath);
    setFolderDialogOpen(true);
  }

  function handleFolderDialogOpenChange(open: boolean) {
    setFolderDialogOpen(open);
    if (!open) setFolderDialogParent(null);
  }

  async function handleCreateScript(name: string, parentPath?: string) {
    const fullName = parentPath
      ? `${parentPath.replace(/\/$/, "")}/${name}`
      : name;
    await fetch("/api/files", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: fullName, content: DEFAULT_SCRIPT }),
    });
    await fetchTree();
    onSelectFile(fullName);
    handleScriptDialogOpenChange(false);
  }

  async function handleCreateFolder(path: string) {
    await fetch("/api/files/folder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path }),
    });
    await fetchTree();
    handleFolderDialogOpenChange(false);
  }

  async function handleDeleteFile(path: string) {
    await fetch(`/api/files/${encodeApiPath(path)}`, { method: "DELETE" });
    await fetchTree();
    onFileDeleted?.(path);
  }

  async function handleDeleteFolder(path: string) {
    const folderPath = path.replace(/\/+$/, "");
    await fetch("/api/files/folder", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: folderPath }),
    });
    await fetchTree();
  }

  async function handleRenameFile(oldPath: string, newPath: string) {
    await fetch("/api/files/rename", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ from: oldPath, to: newPath, type: "file" }),
    });
    await fetchTree();
    onFileRenamed?.(oldPath, newPath);
  }

  async function handleRenameFolder(oldPath: string, newPath: string) {
    await fetch("/api/files/rename", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ from: oldPath, to: newPath, type: "folder" }),
    });
    await fetchTree();
  }

  function renderTree(nodes: FileNode[], depth = 0): React.ReactNode {
    return nodes.map((node) => {
      if (node.type === "folder") {
        return (
          <FolderItem
            key={node.path}
            name={node.name}
            path={node.path}
            depth={depth}
            onRename={(newPath) => handleRenameFolder(node.path.replace(/\/$/, ""), newPath)}
            onDelete={() => void handleDeleteFolder(node.path)}
            onCreateScript={(parentPath) => openScriptDialog(parentPath)}
            onCreateFolder={(parentPath) => openFolderDialog(parentPath)}
          >
            {node.children && node.children.length > 0
              ? renderTree(node.children, depth + 1)
              : (
                <p className="py-1 font-mono text-[10px] text-muted-foreground" style={{ paddingLeft: `${1.5 + (depth + 1) * 1}rem` }}>
                  Empty folder
                </p>
              )}
          </FolderItem>
        );
      }
      return (
        <FileItem
          key={node.path}
          name={node.name}
          path={node.path}
          depth={depth}
          isSelected={selectedFile === node.path}
          onClick={() => onSelectFile(node.path)}
          onDelete={() => void handleDeleteFile(node.path)}
          onRename={(newPath) => handleRenameFile(node.path, newPath)}
        />
      );
    });
  }

  return (
    <div className="flex h-full flex-col">
      {/* Top toolbar with create buttons */}
      <PanelHeader
        label="Scripts"
        badge={
          <span className="rounded-full border border-border bg-panel-raised px-1.5 py-px font-mono text-[10px] text-muted-foreground">
            {countFiles(tree)}
          </span>
        }
        className="load-lab-grid"
        actions={
          <div className="flex items-center gap-1">
            <NewFileDialog
              open={scriptDialogOpen}
              onOpenChange={handleScriptDialogOpenChange}
              onTriggerClick={() => setScriptDialogParent(null)}
              onCreate={(name) =>
                handleCreateScript(name, scriptDialogParent ?? undefined)
              }
            />
            <NewFolderDialog
              open={folderDialogOpen}
              onOpenChange={handleFolderDialogOpenChange}
              onTriggerClick={() => setFolderDialogParent(null)}
              parentPath={folderDialogParent ?? undefined}
              onCreate={(path) => handleCreateFolder(path)}
            />
          </div>
        }
      />

      <ScrollArea className="flex-1 px-1 py-1">
        {tree.length === 0 ? (
          <EmptyState
            icon={FileCode2}
            title="No scripts yet"
            description="Create a script to start a load test."
            className="py-8"
          />
        ) : (
          renderTree(tree)
        )}
      </ScrollArea>
    </div>
  );
}

function encodeApiPath(path: string): string {
  return path
    .split("/")
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

function countFiles(nodes: FileNode[]): number {
  let count = 0;
  for (const node of nodes) {
    if (node.type === "file") count++;
    else if (node.children) count += countFiles(node.children);
  }
  return count;
}
