"use client";

import { Trash2, FileCode } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

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
        className={`group flex items-center justify-between px-2 py-1 rounded cursor-pointer text-sm ${
          isSelected
            ? "bg-slate-700 text-white"
            : "text-slate-300 hover:bg-slate-800"
        }`}
        onClick={onClick}
      >
        <div className="flex items-center gap-2 truncate">
          <FileCode className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{name}</span>
        </div>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon"
                className="h-5 w-5 opacity-0 group-hover:opacity-100 shrink-0"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete();
                }}
              />
            }
          >
            <Trash2 className="h-3 w-3" />
          </TooltipTrigger>
          <TooltipContent>Delete</TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  );
}
