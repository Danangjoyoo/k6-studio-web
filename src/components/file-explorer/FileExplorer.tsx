"use client";

import { useCallback, useEffect, useState } from "react";
import { FileCode2, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
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
  const [query, setQuery] = useState("");

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

  const filteredTree = filterTree(tree, query);

  return (
    <div className="flex h-full min-h-0 flex-col">
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

      <div className="shrink-0 border-b border-sidebar-border bg-sidebar px-2 py-2">
        <label className="relative block">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            role="searchbox"
            aria-label="Search scripts"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search scripts"
            className="h-7 w-full rounded-md bg-panel pl-7 pr-2 font-mono text-xs"
          />
        </label>
      </div>

      <ScrollArea
        data-testid="file-explorer-scroll"
        className="min-h-0 flex-1 px-1 py-1"
      >
        {tree.length === 0 ? (
          <EmptyState
            icon={FileCode2}
            title="No scripts yet"
            description="Create a script to start a load test."
            className="py-8"
          />
        ) : filteredTree.length === 0 ? (
          <EmptyState
            icon={Search}
            title="No matches"
            description="Try another search."
            className="py-8"
          />
        ) : (
          renderTree(filteredTree)
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

function filterTree(nodes: FileNode[], query: string): FileNode[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return nodes;

  const result: FileNode[] = [];
  for (const node of nodes) {
    const selfMatches =
      node.name.toLowerCase().includes(normalized) ||
      node.path.toLowerCase().includes(normalized);

    if (node.type === "folder") {
      const children = filterTree(node.children ?? [], query);
      if (selfMatches || children.length > 0) {
        result.push({
          ...node,
          children: selfMatches ? node.children : children,
        });
      }
    } else if (selfMatches) {
      result.push(node);
    }
  }
  return result;
}
