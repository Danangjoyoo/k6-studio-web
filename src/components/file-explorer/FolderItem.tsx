"use client";

import { useRef, useState } from "react";
import { ChevronDown, ChevronRight, Folder, FolderOpen, FilePlus, FolderPlus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface FolderItemProps {
  name: string;
  path: string;
  depth?: number;
  defaultOpen?: boolean;
  isOpen?: boolean;
  onToggleOpen?: () => void;
  onRowClick?: (event: React.MouseEvent<HTMLDivElement>) => void;
  onRename: (newPath: string) => Promise<void>;
  onDelete: () => void;
  onCreateScript: (parentPath: string) => void;
  onCreateFolder: (parentPath: string) => void;
  children: React.ReactNode;
  isSelectionChecked?: boolean;
  isSelectionDisabled?: boolean;
  showSelectionControl?: boolean;
  onSelectionChange?: (checked: boolean, path: string) => void;
  onSelectionToggle?: (path: string) => void;
  isDragEnabled?: boolean;
  isDragDisabled?: boolean;
  isDropActive?: boolean;
  isDropDisabled?: boolean;
  onRowDragStart?: (path: string, event: React.DragEvent<HTMLDivElement>) => void;
  onRowDragOver?: (path: string, event: React.DragEvent<HTMLDivElement>) => void;
  onRowDrop?: (path: string, event: React.DragEvent<HTMLDivElement>) => void;
  onRowDragEnd?: (path: string, event: React.DragEvent<HTMLDivElement>) => void;
  onRowDragLeave?: (path: string, event: React.DragEvent<HTMLDivElement>) => void;
}

export default function FolderItem({
  name,
  path,
  depth = 0,
  defaultOpen = true,
  isOpen,
  onToggleOpen,
  onRowClick,
  onRename,
  onDelete,
  onCreateScript,
  onCreateFolder,
  children,
  isSelectionChecked,
  isSelectionDisabled = false,
  showSelectionControl,
  onSelectionChange,
  onSelectionToggle,
  isDragEnabled = false,
  isDragDisabled = false,
  isDropActive = false,
  isDropDisabled = false,
  onRowDragStart,
  onRowDragOver,
  onRowDrop,
  onRowDragEnd,
  onRowDragLeave,
}: FolderItemProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen);
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(name);
  const inputRef = useRef<HTMLInputElement>(null);
  const open = isOpen ?? uncontrolledOpen;
  const selectionVisible =
    Boolean(showSelectionControl) || Boolean(isSelectionChecked);

  function toggleOpen() {
    if (onToggleOpen) {
      onToggleOpen();
      return;
    }
    setUncontrolledOpen((value) => !value);
  }

  function handleRowClick(event: React.MouseEvent<HTMLDivElement>) {
    if (editing) return;
    if (onRowClick) {
      onRowClick(event);
      return;
    }
    toggleOpen();
  }

  function startEdit(e: React.MouseEvent) {
    e.stopPropagation();
    setEditValue(name);
    setEditing(true);
    setTimeout(() => inputRef.current?.select(), 10);
  }

  async function commitRename() {
    const newName = editValue.trim();
    setEditing(false);
    if (!newName || newName === name) return;
    // Rebuild path: replace last segment
    const parts = path.replace(/\/$/, "").split("/");
    parts[parts.length - 1] = newName;
    const newPath = parts.join("/");
    await onRename(newPath);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      void commitRename();
    } else if (e.key === "Escape") {
      setEditing(false);
    }
  }

  function handleSelectionChange(e: React.ChangeEvent<HTMLInputElement>) {
    e.stopPropagation();
    if (isSelectionDisabled) return;
    onSelectionChange?.(e.target.checked, path);
  }

  function handleDragStart(e: React.DragEvent<HTMLDivElement>) {
    if (!isDragEnabled || isDragDisabled) {
      e.preventDefault();
      return;
    }
    onRowDragStart?.(path, e);
  }

  function handleDragOver(e: React.DragEvent<HTMLDivElement>) {
    if (isDropDisabled || !onRowDragOver) return;
    e.preventDefault();
    onRowDragOver(path, e);
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    if (isDropDisabled || !onRowDrop) return;
    e.preventDefault();
    onRowDrop(path, e);
  }

  return (
    <TooltipProvider>
      <div>
        <div
          role="button"
          data-testid="sidebar-folder-item"
          data-path={path}
          data-selected={isSelectionChecked ? "true" : undefined}
          data-drop-active={isDropActive ? "true" : undefined}
          aria-selected={isSelectionChecked ? true : undefined}
          draggable={isDragEnabled && !isDragDisabled}
          tabIndex={0}
          style={{ paddingLeft: `${0.5 + depth * 1}rem` }}
          className={cn(
            "group mb-0.5 flex cursor-pointer items-center justify-between rounded-r-md border-l-2 border-l-transparent py-1.5 pr-2 text-sm text-muted-foreground transition-colors duration-150 hover:border-l-border hover:bg-sidebar-accent/50 hover:text-foreground",
            isDropActive &&
              !isDropDisabled &&
              "border-l-primary bg-sidebar-accent/70 text-foreground ring-1 ring-primary/30",
            isDragDisabled && "cursor-default",
            isSelectionDisabled && "opacity-75"
          )}
          onClick={handleRowClick}
          onDoubleClick={startEdit}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          onDragEnd={(e) => onRowDragEnd?.(path, e)}
          onDragLeave={(e) => onRowDragLeave?.(path, e)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              toggleOpen();
              return;
            }
            if (e.key === " " && onSelectionToggle && !isSelectionDisabled) {
              e.preventDefault();
              onSelectionToggle(path);
            }
          }}
        >
          <div className="flex min-w-0 items-center gap-1.5">
            {onSelectionChange && (
              <span
                data-testid="row-selection-control"
                data-selection-visible={selectionVisible ? "true" : "false"}
                className={cn(
                  "flex h-4 w-4 shrink-0 items-center justify-center transition-opacity",
                  selectionVisible
                    ? "pointer-events-auto opacity-100"
                    : "pointer-events-none opacity-0 group-hover:pointer-events-auto group-hover:opacity-100 group-focus:pointer-events-auto group-focus:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100"
                )}
                onClick={(e) => e.stopPropagation()}
                onDoubleClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => e.stopPropagation()}
              >
                <input
                  type="checkbox"
                  aria-label={`Select ${name}`}
                  checked={Boolean(isSelectionChecked)}
                  disabled={isSelectionDisabled}
                  className={cn(
                    "h-3.5 w-3.5 rounded border-border accent-primary",
                    isSelectionDisabled && "cursor-not-allowed opacity-50"
                  )}
                  onChange={handleSelectionChange}
                />
              </span>
            )}
            <span className="shrink-0 text-muted-foreground/70">
              {open ? (
                <ChevronDown className="h-3 w-3" />
              ) : (
                <ChevronRight className="h-3 w-3" />
              )}
            </span>
            {open ? (
              <FolderOpen className="h-3.5 w-3.5 shrink-0 text-primary/60" />
            ) : (
              <Folder className="h-3.5 w-3.5 shrink-0 text-primary/60" />
            )}
            {editing ? (
              <input
                ref={inputRef}
                className="w-28 rounded border border-primary bg-background px-1 font-mono text-xs text-foreground outline-none"
                value={editValue}
                autoFocus
                onChange={(e) => setEditValue(e.target.value)}
                onKeyDown={handleKeyDown}
                onBlur={() => void commitRename()}
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <span className="truncate font-mono text-xs">{name}</span>
            )}
          </div>

          {!editing && (
            <div className="flex shrink-0 items-center gap-0.5 opacity-0 group-hover:opacity-100">
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="New script here"
                      className="h-5 w-5"
                      onClick={(e) => { e.stopPropagation(); onCreateScript(path); }}
                    />
                  }
                >
                  <FilePlus className="h-3 w-3" />
                </TooltipTrigger>
                <TooltipContent>New script here</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="New folder here"
                      className="h-5 w-5"
                      onClick={(e) => { e.stopPropagation(); onCreateFolder(path); }}
                    />
                  }
                >
                  <FolderPlus className="h-3 w-3" />
                </TooltipTrigger>
                <TooltipContent>New folder here</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Delete folder"
                      className="h-5 w-5"
                      onClick={(e) => { e.stopPropagation(); onDelete(); }}
                    />
                  }
                >
                  <Trash2 className="h-3 w-3" />
                </TooltipTrigger>
                <TooltipContent>Delete folder</TooltipContent>
              </Tooltip>
            </div>
          )}
        </div>

        {open && <div>{children}</div>}
      </div>
    </TooltipProvider>
  );
}
