"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
  globalRunningScript?: string | null;
}

type MoveSelectionType = "file" | "folder";

interface MoveSelection {
  path: string;
  type: MoveSelectionType;
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
  globalRunningScript = null,
}: FileExplorerProps) {
  const [tree, setTree] = useState<FileNode[]>([]);
  const [scriptDialogOpen, setScriptDialogOpen] = useState(false);
  const [scriptDialogParent, setScriptDialogParent] = useState<string | null>(null);
  const [folderDialogOpen, setFolderDialogOpen] = useState(false);
  const [folderDialogParent, setFolderDialogParent] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [selection, setSelection] = useState<Record<string, MoveSelection>>({});
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [moveStatus, setMoveStatus] = useState<string | null>(null);
  const dragSourceRef = useRef<MoveSelection | null>(null);

  const fetchTree = useCallback(async () => {
    const res = await fetch("/api/files");
    const data = (await res.json()) as { tree: FileNode[] };
    const nextTree = data.tree ?? [];
    setTree(nextTree);
    const validKeys = new Set(flattenSelectionKeys(nextTree));
    setSelection((current) =>
      Object.fromEntries(
        Object.entries(current).filter(([key]) => validKeys.has(key))
      )
    );
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

  function handleSelectionChange(
    item: MoveSelection,
    checked: boolean
  ) {
    setMoveStatus(null);
    setSelection((current) => {
      const next = { ...current };
      if (checked) next[selectionKey(item)] = item;
      else delete next[selectionKey(item)];
      return next;
    });
  }

  function handleDragStart(item: MoveSelection) {
    dragSourceRef.current = item;
    setMoveStatus(null);
  }

  async function handleDropOnFolder(targetFolderPath: string) {
    const source = dragSourceRef.current;
    setDropTarget(null);
    dragSourceRef.current = null;
    if (!source || isMovementDisabled(source, globalRunningScript)) return;

    const sourceKey = selectionKey(source);
    const selectedItems = Object.values(selection);
    const rawItems = selection[sourceKey] ? selectedItems : [source];
    const items = pruneNestedSelections(
      rawItems.filter((item) => !isMovementDisabled(item, globalRunningScript))
    );
    if (items.length === 0) return;

    const targetFolder = normalizeFolderPath(targetFolderPath);
    const selectedPathUpdate = computeMovedSelectedPath(
      selectedFile,
      items,
      targetFolder
    );

    const response = await fetch("/api/files/move", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items, targetFolder }),
    });

    if (!response.ok) {
      let message = "Move failed";
      try {
        const body = (await response.json()) as { error?: string };
        message = body.error ?? message;
      } catch {
        // keep default message
      }
      setMoveStatus(message);
      return;
    }

    setSelection({});
    setMoveStatus(null);
    if (selectedPathUpdate) {
      onFileRenamed?.(selectedPathUpdate.from, selectedPathUpdate.to);
    }
    await fetchTree();
  }

  function renderTree(nodes: FileNode[], depth = 0): React.ReactNode {
    return nodes.map((node) => {
      if (node.type === "folder") {
        const item: MoveSelection = {
          path: normalizeFolderPath(node.path),
          type: "folder",
        };
        const disabled = isMovementDisabled(item, globalRunningScript);
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
            isSelectionChecked={Boolean(selection[selectionKey(item)])}
            isSelectionDisabled={disabled}
            onSelectionChange={(checked) => handleSelectionChange(item, checked)}
            isDragEnabled
            isDragDisabled={disabled}
            isDropActive={dropTarget === normalizeFolderPath(node.path)}
            onRowDragStart={() => handleDragStart(item)}
            onRowDragOver={() => setDropTarget(normalizeFolderPath(node.path))}
            onRowDragLeave={() =>
              setDropTarget((current) =>
                current === normalizeFolderPath(node.path) ? null : current
              )
            }
            onRowDrop={() => void handleDropOnFolder(node.path)}
            onRowDragEnd={() => {
              dragSourceRef.current = null;
              setDropTarget(null);
            }}
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
      const item: MoveSelection = { path: node.path, type: "file" };
      const disabled = isMovementDisabled(item, globalRunningScript);
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
          isSelectionChecked={Boolean(selection[selectionKey(item)])}
          isSelectionDisabled={disabled}
          onSelectionChange={(checked) => handleSelectionChange(item, checked)}
          isDragEnabled
          isDragDisabled={disabled}
          onRowDragStart={() => handleDragStart(item)}
          onRowDragEnd={() => {
            dragSourceRef.current = null;
            setDropTarget(null);
          }}
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
        {moveStatus && (
          <p
            role="status"
            className="mt-1 truncate font-mono text-[10px] text-destructive"
          >
            {moveStatus}
          </p>
        )}
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

function normalizeFolderPath(path: string): string {
  return path.replace(/\/+$/, "");
}

function selectionKey(item: MoveSelection): string {
  return `${item.type}:${item.path}`;
}

function flattenSelectionKeys(nodes: FileNode[]): string[] {
  const keys: string[] = [];
  for (const node of nodes) {
    if (node.type === "folder") {
      keys.push(selectionKey({ path: normalizeFolderPath(node.path), type: "folder" }));
      keys.push(...flattenSelectionKeys(node.children ?? []));
    } else {
      keys.push(selectionKey({ path: node.path, type: "file" }));
    }
  }
  return keys;
}

function isMovementDisabled(
  item: MoveSelection,
  runningScript: string | null
): boolean {
  if (!runningScript) return false;
  if (item.type === "file") return item.path === runningScript;
  return runningScript.startsWith(`${item.path.replace(/\/+$/, "")}/`);
}

function pruneNestedSelections(items: MoveSelection[]): MoveSelection[] {
  const selectedFolders = items
    .filter((item) => item.type === "folder")
    .map((item) => `${item.path.replace(/\/+$/, "")}/`);

  return items.filter((item) => {
    if (item.type === "folder") return true;
    return !selectedFolders.some((prefix) => item.path.startsWith(prefix));
  });
}

function computeMovedSelectedPath(
  selectedFile: string | null,
  items: MoveSelection[],
  targetFolder: string
): { from: string; to: string } | null {
  if (!selectedFile) return null;

  for (const item of items) {
    if (item.type === "file" && item.path === selectedFile) {
      return {
        from: selectedFile,
        to: joinPath(targetFolder, basename(item.path)),
      };
    }

    if (item.type === "folder") {
      const sourcePrefix = `${item.path.replace(/\/+$/, "")}/`;
      if (selectedFile.startsWith(sourcePrefix)) {
        return {
          from: selectedFile,
          to: `${joinPath(targetFolder, basename(item.path))}/${selectedFile.slice(sourcePrefix.length)}`,
        };
      }
    }
  }

  return null;
}

function joinPath(folder: string, name: string): string {
  return folder ? `${folder}/${name}` : name;
}

function basename(path: string): string {
  const normalized = path.replace(/\/+$/, "");
  const parts = normalized.split("/");
  return parts[parts.length - 1];
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
