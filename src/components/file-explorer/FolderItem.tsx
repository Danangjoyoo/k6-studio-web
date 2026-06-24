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

interface FolderItemProps {
  name: string;
  path: string;
  depth?: number;
  defaultOpen?: boolean;
  onRename: (newPath: string) => Promise<void>;
  onDelete: () => void;
  onCreateScript: (parentPath: string) => void;
  onCreateFolder: (parentPath: string) => void;
  children: React.ReactNode;
}

export default function FolderItem({
  name,
  path,
  depth = 0,
  defaultOpen = true,
  onRename,
  onDelete,
  onCreateScript,
  onCreateFolder,
  children,
}: FolderItemProps) {
  const [open, setOpen] = useState(defaultOpen);
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(name);
  const inputRef = useRef<HTMLInputElement>(null);

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

  return (
    <TooltipProvider>
      <div>
        <div
          role="button"
          data-testid="sidebar-folder-item"
          data-path={path}
          tabIndex={0}
          style={{ paddingLeft: `${0.5 + depth * 1}rem` }}
          className="group mb-0.5 flex cursor-pointer items-center justify-between rounded-r-md border-l-2 border-l-transparent py-1.5 pr-2 text-sm text-muted-foreground transition-colors duration-150 hover:border-l-border hover:bg-sidebar-accent/50 hover:text-foreground"
          onClick={() => !editing && setOpen((o) => !o)}
          onDoubleClick={startEdit}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              setOpen((o) => !o);
            }
          }}
        >
          <div className="flex min-w-0 items-center gap-1.5">
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
