"use client";

import { Trash2, FileCode2 } from "lucide-react";
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
        role="button"
        tabIndex={0}
        className={cn(
          "group mb-0.5 flex cursor-pointer items-center justify-between rounded-r-md border-l-2 px-2 py-1.5 text-sm transition-colors duration-150",
          isSelected
            ? "border-l-primary bg-sidebar-accent text-sidebar-accent-foreground"
            : "border-l-transparent text-muted-foreground hover:border-l-border hover:bg-sidebar-accent/50 hover:text-foreground"
        )}
        onClick={onClick}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onClick();
          }
        }}
      >
        <div className="flex min-w-0 items-center gap-2">
          <FileCode2 className="h-3.5 w-3.5 shrink-0 text-primary/80" />
          <span className="truncate font-mono text-xs">{name}</span>
        </div>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon"
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
      </div>
    </TooltipProvider>
  );
}
