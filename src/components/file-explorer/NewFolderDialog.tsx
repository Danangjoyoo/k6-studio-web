"use client";

import { useEffect, useState } from "react";
import { FolderPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

interface NewFolderDialogProps {
  onCreate: (path: string) => Promise<void>;
  parentPath?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onTriggerClick?: () => void;
  showTrigger?: boolean;
}

export default function NewFolderDialog({
  onCreate,
  parentPath,
  open,
  onOpenChange,
  onTriggerClick,
  showTrigger = true,
}: NewFolderDialogProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const [name, setName] = useState("");
  const dialogOpen = open ?? internalOpen;
  const isControlled = open !== undefined;

  useEffect(() => {
    if (!dialogOpen) setName("");
  }, [dialogOpen]);

  function handleOpenChange(next: boolean) {
    if (!isControlled) {
      setInternalOpen(next);
    }
    onOpenChange?.(next);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    const fullPath = parentPath
      ? `${parentPath.replace(/\/$/, "")}/${trimmed}`
      : trimmed;
    await onCreate(fullPath);
    handleOpenChange(false);
  }

  return (
    <Dialog open={dialogOpen} onOpenChange={handleOpenChange}>
      {showTrigger && (
        <DialogTrigger
          render={
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-xs"
              onClick={onTriggerClick}
            />
          }
        >
          <FolderPlus className="h-3.5 w-3.5" />
          New folder
        </DialogTrigger>
      )}
      <DialogContent className="border-border bg-panel-raised">
        <DialogHeader>
          <DialogTitle>
            {parentPath ? `New folder in ${parentPath}` : "New folder"}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <Input
            placeholder="folder-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="font-mono text-sm"
            autoFocus
          />
          <Button type="submit">Create</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
