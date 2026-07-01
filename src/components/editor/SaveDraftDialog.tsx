"use client";

import { useEffect, useState } from "react";
import { Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { resolveScriptFilename } from "@/components/file-explorer/NewFileDialog";

interface SaveDraftDialogProps {
  open: boolean;
  suggestedName: string;
  onOpenChange: (open: boolean) => void;
  onSave: (filename: string) => Promise<void>;
}

export default function SaveDraftDialog({
  open,
  suggestedName,
  onOpenChange,
  onSave,
}: SaveDraftDialogProps) {
  const [name, setName] = useState(suggestedName);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setName(suggestedName);
      setSaving(false);
    }
  }, [open, suggestedName]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;

    setSaving(true);
    await onSave(resolveScriptFilename(trimmed));
    setSaving(false);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-border bg-panel-raised">
        <DialogHeader>
          <DialogTitle>Save generated script</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">
              Script path
            </span>
            <Input
              autoFocus
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="path/to/script.ts"
              className="font-mono text-xs"
            />
          </label>
          <Button
            type="submit"
            size="sm"
            disabled={saving || !name.trim()}
            className="gap-1.5 self-end text-xs"
          >
            <Save className="h-3.5 w-3.5" />
            Save script
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
