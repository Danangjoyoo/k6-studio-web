"use client";

import { useRef, useState } from "react";
import { FileCode2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface FileItemProps {
  name: string;
  path: string;
  depth?: number;
  isSelected: boolean;
  onClick: () => void;
  onDelete: () => void;
  onRename: (newPath: string) => Promise<void>;
}

export default function FileItem({
  name,
  path,
  depth = 0,
  isSelected,
  onClick,
  onDelete,
  onRename,
}: FileItemProps) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(name);
  const inputRef = useRef<HTMLInputElement>(null);

  function startEdit(e: React.MouseEvent) {
    e.stopPropagation();
    setEditValue(name);
    setEditing(true);
    // Focus after state update renders
    setTimeout(() => inputRef.current?.select(), 10);
  }

  async function commitRename() {
    const newName = editValue.trim();
    setEditing(false);
    if (!newName || newName === name) return;
    const parts = path.split("/");
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
      <div
        role="button"
        data-testid="sidebar-file-item"
        data-path={path}
        tabIndex={0}
        style={{ paddingLeft: `${0.5 + depth * 1}rem` }}
        className={cn(
          "group mb-0.5 flex cursor-pointer items-center justify-between rounded-r-md border-l-2 py-1.5 pr-2 text-sm transition-colors duration-150",
          isSelected
            ? "border-l-primary bg-sidebar-accent text-sidebar-accent-foreground"
            : "border-l-transparent text-muted-foreground hover:border-l-border hover:bg-sidebar-accent/50 hover:text-foreground"
        )}
        onClick={onClick}
        onDoubleClick={startEdit}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onClick();
          }
        }}
      >
        <div className="flex min-w-0 items-center gap-2">
          <FileCode2 className="h-3.5 w-3.5 shrink-0 text-primary/80" />
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
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Delete script"
                  className="h-5 w-5 shrink-0 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete();
                  }}
                />
              }
            >
              <Trash2 className="h-3 w-3" />
            </TooltipTrigger>
            <TooltipContent>Delete script</TooltipContent>
          </Tooltip>
        )}
      </div>
    </TooltipProvider>
  );
}
