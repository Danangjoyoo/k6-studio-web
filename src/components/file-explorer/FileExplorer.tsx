"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { DEFAULT_NAMESPACE } from "@/lib/namespaces";
import { withBasePath } from "@/lib/base-path";

export interface FileExplorerProps {
  namespace?: string;
  selectedFile: string | null;
  onSelectFile: (name: string) => void;
  onFileDeleted?: (name: string) => void;
  onFileRenamed?: (
    oldPath: string,
    newPath: string,
    type?: MoveSelectionType
  ) => void;
  globalRunningScript?: string | null;
  globalRunningScripts?: string[];
}

type MoveSelectionType = "file" | "folder";

interface MoveSelection {
  path: string;
  type: MoveSelectionType;
}

interface VisibleMoveRow extends MoveSelection {
  key: string;
  disabled: boolean;
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

const EMPTY_RUNNING_SCRIPTS: string[] = [];

export default function FileExplorer({
  namespace = DEFAULT_NAMESPACE,
  selectedFile,
  onSelectFile,
  onFileDeleted,
  onFileRenamed,
  globalRunningScript = null,
  globalRunningScripts = EMPTY_RUNNING_SCRIPTS,
}: FileExplorerProps) {
  const [tree, setTree] = useState<FileNode[]>([]);
  const [scriptDialogOpen, setScriptDialogOpen] = useState(false);
  const [scriptDialogParent, setScriptDialogParent] = useState<string | null>(null);
  const [folderDialogOpen, setFolderDialogOpen] = useState(false);
  const [folderDialogParent, setFolderDialogParent] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [selection, setSelection] = useState<Record<string, MoveSelection>>({});
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(() => new Set());
  const [lastSelectionKey, setLastSelectionKey] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [moveStatus, setMoveStatus] = useState<string | null>(null);
  const [selectionRevealKeyHeld, setSelectionRevealKeyHeld] = useState(false);
  const dragSourceRef = useRef<MoveSelection | null>(null);
  const knownFolderPathsRef = useRef<Set<string>>(new Set());
  const fetchTreeRequestIdRef = useRef(0);
  const activeRunningScripts = useMemo(() => {
    const scripts = [...globalRunningScripts];
    if (globalRunningScript) scripts.push(globalRunningScript);
    return Array.from(new Set(scripts.filter(Boolean)));
  }, [globalRunningScript, globalRunningScripts]);

  const fetchTree = useCallback(async () => {
    const requestId = ++fetchTreeRequestIdRef.current;
    const res = await fetch(
      withBasePath(`/api/files?${namespaceQuery(namespace)}`)
    );
    const data = (await res.json()) as { tree: FileNode[] };
    if (requestId !== fetchTreeRequestIdRef.current) return;
    const nextTree = data.tree ?? [];
    const nextFolderPaths = new Set(flattenFolderPaths(nextTree));
    const previousKnownFolderPaths = knownFolderPathsRef.current;
    setTree(nextTree);
    setExpandedFolders((current) => {
      const next = new Set<string>();
      for (const folderPath of current) {
        if (nextFolderPaths.has(folderPath)) next.add(folderPath);
      }
      for (const folderPath of nextFolderPaths) {
        if (!previousKnownFolderPaths.has(folderPath)) next.add(folderPath);
      }
      return next;
    });
    knownFolderPathsRef.current = nextFolderPaths;
    const validKeys = new Set(flattenSelectionKeys(nextTree));
    setSelection((current) =>
      Object.fromEntries(
        Object.entries(current).filter(([key]) => validKeys.has(key))
      )
    );
  }, [namespace]);

  useEffect(() => {
    void fetchTree();
  }, [fetchTree]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Shift") {
        setSelectionRevealKeyHeld(true);
      }
    }

    function handleKeyUp(event: KeyboardEvent) {
      if (event.key === "Shift") {
        setSelectionRevealKeyHeld(false);
      }
    }

    function resetRevealKey() {
      setSelectionRevealKeyHeld(false);
    }

    function handleVisibilityChange() {
      if (document.visibilityState === "hidden") {
        resetRevealKey();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", resetRevealKey);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", resetRevealKey);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  useEffect(() => {
    setTree([]);
    setSelection({});
    setExpandedFolders(new Set());
    setLastSelectionKey(null);
    setDropTarget(null);
    setMoveStatus(null);
    dragSourceRef.current = null;
    knownFolderPathsRef.current = new Set();
  }, [namespace]);

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
    await fetch(withBasePath("/api/files"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ namespace, name: fullName, content: DEFAULT_SCRIPT }),
    });
    await fetchTree();
    onSelectFile(fullName);
    handleScriptDialogOpenChange(false);
  }

  async function handleCreateFolder(path: string) {
    await fetch(withBasePath("/api/files/folder"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ namespace, path }),
    });
    await fetchTree();
    handleFolderDialogOpenChange(false);
  }

  async function handleDeleteFile(path: string) {
    await fetch(
      withBasePath(`/api/files/${encodeApiPath(path)}?${namespaceQuery(namespace)}`),
      {
        method: "DELETE",
      }
    );
    await fetchTree();
    onFileDeleted?.(path);
  }

  async function handleDeleteFolder(path: string) {
    const folderPath = path.replace(/\/+$/, "");
    await fetch(withBasePath("/api/files/folder"), {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ namespace, path: folderPath }),
    });
    await fetchTree();
  }

  async function handleRenameFile(oldPath: string, newPath: string) {
    const response = await fetch(withBasePath("/api/files/rename"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ namespace, from: oldPath, to: newPath, type: "file" }),
    });
    if (!response.ok) {
      setMoveStatus(await readErrorMessage(response, "Rename failed"));
      return;
    }
    setMoveStatus(null);
    await fetchTree();
    onFileRenamed?.(oldPath, newPath, "file");
  }

  async function handleRenameFolder(oldPath: string, newPath: string) {
    const response = await fetch(withBasePath("/api/files/rename"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ namespace, from: oldPath, to: newPath, type: "folder" }),
    });
    if (!response.ok) {
      setMoveStatus(await readErrorMessage(response, "Rename failed"));
      return;
    }
    setMoveStatus(null);
    await fetchTree();
    const oldFolder = normalizeFolderPath(oldPath);
    const newFolder = normalizeFolderPath(newPath);
    onFileRenamed?.(oldFolder, newFolder, "folder");
  }

  function handleSelectionChange(
    item: MoveSelection,
    checked: boolean
  ) {
    if (isMovementDisabled(item, activeRunningScripts)) return;
    const key = selectionKey(item);
    setMoveStatus(null);
    setLastSelectionKey(key);
    setSelection((current) => {
      const next = { ...current };
      if (checked) next[key] = item;
      else delete next[key];
      return next;
    });
  }

  function toggleMoveSelection(item: MoveSelection) {
    if (isMovementDisabled(item, activeRunningScripts)) return;
    const key = selectionKey(item);
    setMoveStatus(null);
    setLastSelectionKey(key);
    setSelection((current) => {
      const next = { ...current };
      if (next[key]) delete next[key];
      else next[key] = item;
      return next;
    });
  }

  function selectVisibleRange(item: MoveSelection) {
    if (isMovementDisabled(item, activeRunningScripts)) return;
    const itemKey = selectionKey(item);
    const startKey = lastSelectionKey ?? itemKey;
    const startIndex = visibleMoveRows.findIndex((row) => row.key === startKey);
    const endIndex = visibleMoveRows.findIndex((row) => row.key === itemKey);
    if (endIndex === -1) {
      return;
    }
    if (startIndex === -1) {
      setMoveStatus(null);
      setLastSelectionKey(itemKey);
      setSelection((current) => ({
        ...current,
        [itemKey]: item,
      }));
      return;
    }

    const [from, to] =
      startIndex < endIndex ? [startIndex, endIndex] : [endIndex, startIndex];
    setMoveStatus(null);
    setLastSelectionKey(itemKey);
    setSelection((current) => {
      const next = { ...current };
      for (const row of visibleMoveRows.slice(from, to + 1)) {
        if (row.disabled) continue;
        next[row.key] = { path: row.path, type: row.type };
      }
      return next;
    });
  }

  function handleRowSelectionIntent(
    item: MoveSelection,
    disabled: boolean,
    event: React.MouseEvent<HTMLDivElement>,
    primaryAction: () => void
  ) {
    if (event.shiftKey) {
      event.preventDefault();
      event.stopPropagation();
      if (!disabled) selectVisibleRange(item);
      return;
    }
    if (event.metaKey || event.ctrlKey) {
      event.preventDefault();
      event.stopPropagation();
      if (!disabled) toggleMoveSelection(item);
      return;
    }
    primaryAction();
  }

  function toggleFolderOpen(path: string) {
    const folderPath = normalizeFolderPath(path);
    setExpandedFolders((current) => {
      const next = new Set(current);
      if (next.has(folderPath)) next.delete(folderPath);
      else next.add(folderPath);
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
    if (!source || isMovementDisabled(source, activeRunningScripts)) return;

    const sourceKey = selectionKey(source);
    const selectedItems = Object.values(selection);
    const rawItems = selection[sourceKey] ? selectedItems : [source];
    const items = pruneNestedSelections(
      rawItems.filter((item) => !isMovementDisabled(item, activeRunningScripts))
    );
    if (items.length === 0) return;

    const targetFolder = normalizeFolderPath(targetFolderPath);
    const response = await fetch(withBasePath("/api/files/move"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ namespace, items, targetFolder }),
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

    setSelection((current) => {
      const next = { ...current };
      for (const item of items) {
        delete next[selectionKey(item)];
      }
      return next;
    });
    setMoveStatus(null);
    for (const item of items) {
      const from = item.type === "folder" ? normalizeFolderPath(item.path) : item.path;
      onFileRenamed?.(
        from,
        joinPath(targetFolder, basename(from)),
        item.type
      );
    }
    await fetchTree();
  }

  function handleRootDragOver(event: React.DragEvent<HTMLDivElement>) {
    if (event.target !== event.currentTarget) return;
    event.preventDefault();
    setDropTarget(null);
  }

  function handleRootDrop(event: React.DragEvent<HTMLDivElement>) {
    if (event.target !== event.currentTarget) return;
    event.preventDefault();
    void handleDropOnFolder("");
  }

  function renderTree(nodes: FileNode[], depth = 0): React.ReactNode {
    return nodes.map((node) => {
      if (node.type === "folder") {
        const item: MoveSelection = {
          path: normalizeFolderPath(node.path),
          type: "folder",
        };
        const folderPath = normalizeFolderPath(node.path);
        const disabled = isMovementDisabled(item, activeRunningScripts);
        const isOpen = expandedFolders.has(folderPath);
        return (
          <FolderItem
            key={node.path}
            name={node.name}
            path={node.path}
            depth={depth}
            isOpen={isOpen}
            onToggleOpen={() => toggleFolderOpen(node.path)}
            onRowClick={(event) =>
              handleRowSelectionIntent(item, disabled, event, () => toggleFolderOpen(node.path))
            }
            onRename={(newPath) => handleRenameFolder(node.path.replace(/\/$/, ""), newPath)}
            onDelete={() => void handleDeleteFolder(node.path)}
            onCreateScript={(parentPath) => openScriptDialog(parentPath)}
            onCreateFolder={(parentPath) => openFolderDialog(parentPath)}
            isSelectionChecked={Boolean(selection[selectionKey(item)])}
            isSelectionDisabled={disabled}
            onSelectionChange={(checked) => handleSelectionChange(item, checked)}
            onSelectionToggle={() => toggleMoveSelection(item)}
            showSelectionControl={showSelectionControls}
            allowSelectionControlReveal={selectionRevealKeyHeld}
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
            {isOpen && node.children && node.children.length > 0
              ? renderTree(node.children, depth + 1)
              : isOpen && (
                <p
                  className="py-1 font-mono text-[10px] text-muted-foreground"
                  style={{ paddingLeft: `${1.5 + (depth + 1) * 1}rem` }}
                >
                  Empty folder
                </p>
              )}
          </FolderItem>
        );
      }
      const item: MoveSelection = { path: node.path, type: "file" };
      const disabled = isMovementDisabled(item, activeRunningScripts);
      return (
        <FileItem
          key={node.path}
          name={node.name}
          path={node.path}
          depth={depth}
          isSelected={selectedFile === node.path}
          onClick={(event) =>
            handleRowSelectionIntent(item, disabled, event, () => onSelectFile(node.path))
          }
          onDelete={() => void handleDeleteFile(node.path)}
          onRename={(newPath) => handleRenameFile(node.path, newPath)}
          isSelectionChecked={Boolean(selection[selectionKey(item)])}
          isSelectionDisabled={disabled}
          onSelectionChange={(checked) => handleSelectionChange(item, checked)}
          onSelectionToggle={() => toggleMoveSelection(item)}
          showSelectionControl={showSelectionControls}
          allowSelectionControlReveal={selectionRevealKeyHeld}
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
  const allMoveRows = useMemo(
    () =>
      collectVisibleMoveRows(
        tree,
        new Set(flattenFolderPaths(tree)),
        activeRunningScripts
      ),
    [tree, activeRunningScripts]
  );
  const allMoveRowsByKey = useMemo(
    () => new Map(allMoveRows.map((row) => [row.key, row])),
    [allMoveRows]
  );
  const visibleMoveRows = useMemo(
    () => collectVisibleMoveRows(filteredTree, expandedFolders, activeRunningScripts),
    [filteredTree, expandedFolders, activeRunningScripts]
  );
  const showSelectionControls = Object.keys(selection).length > 0;

  useEffect(() => {
    setSelection((current) => {
      let changed = false;
      const next: Record<string, MoveSelection> = {};
      for (const [key, item] of Object.entries(current)) {
        const row = allMoveRowsByKey.get(key);
        if (!row || row.disabled) {
          changed = true;
          continue;
        }
        next[key] = item;
      }
      return changed ? next : current;
    });
    setLastSelectionKey((current) => {
      if (!current) return current;
      const row = allMoveRowsByKey.get(current);
      return row && !row.disabled ? current : null;
    });
  }, [allMoveRowsByKey]);

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
        <div
          data-testid="file-explorer-root-drop-target"
          className="min-h-full"
          onDragOver={handleRootDragOver}
          onDrop={handleRootDrop}
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
            <div role="tree" aria-label="Scripts">
              {renderTree(filteredTree)}
            </div>
          )}
        </div>
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

function flattenFolderPaths(nodes: FileNode[]): string[] {
  const paths: string[] = [];
  for (const node of nodes) {
    if (node.type !== "folder") continue;
    const folderPath = normalizeFolderPath(node.path);
    paths.push(folderPath);
    paths.push(...flattenFolderPaths(node.children ?? []));
  }
  return paths;
}

function collectVisibleMoveRows(
  nodes: FileNode[],
  expandedFolders: Set<string>,
  runningScripts: string[]
): VisibleMoveRow[] {
  const rows: VisibleMoveRow[] = [];
  for (const node of nodes) {
    if (node.type === "folder") {
      const item: MoveSelection = {
        path: normalizeFolderPath(node.path),
        type: "folder",
      };
      rows.push({
        ...item,
        key: selectionKey(item),
        disabled: isMovementDisabled(item, runningScripts),
      });
      if (expandedFolders.has(item.path)) {
        rows.push(
          ...collectVisibleMoveRows(
            node.children ?? [],
            expandedFolders,
            runningScripts
          )
        );
      }
    } else {
      const item: MoveSelection = { path: node.path, type: "file" };
      rows.push({
        ...item,
        key: selectionKey(item),
        disabled: isMovementDisabled(item, runningScripts),
      });
    }
  }
  return rows;
}

function isMovementDisabled(
  item: MoveSelection,
  runningScripts: string[]
): boolean {
  if (runningScripts.length === 0) return false;
  if (item.type === "file") return runningScripts.includes(item.path);
  return runningScripts.some((runningScript) =>
    runningScript.startsWith(`${item.path.replace(/\/+$/, "")}/`)
  );
}

function pruneNestedSelections(items: MoveSelection[]): MoveSelection[] {
  const selectedFolders = items
    .filter((item) => item.type === "folder")
    .map((item) => normalizeFolderPath(item.path));

  return items.filter((item) => {
    const itemPath = normalizeFolderPath(item.path);
    return !selectedFolders.some((folderPath) => {
      if (folderPath === itemPath) return false;
      return itemPath.startsWith(`${folderPath}/`);
    });
  });
}

function joinPath(folder: string, name: string): string {
  return folder ? `${folder}/${name}` : name;
}

function basename(path: string): string {
  const normalized = path.replace(/\/+$/, "");
  const parts = normalized.split("/");
  return parts[parts.length - 1];
}

async function readErrorMessage(
  response: Response,
  fallback: string
): Promise<string> {
  try {
    const body = (await response.json()) as { error?: string };
    return body.error ?? fallback;
  } catch {
    return fallback;
  }
}

function encodeApiPath(path: string): string {
  return path
    .split("/")
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

function namespaceQuery(namespace: string): string {
  return `namespace=${encodeURIComponent(namespace)}`;
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
