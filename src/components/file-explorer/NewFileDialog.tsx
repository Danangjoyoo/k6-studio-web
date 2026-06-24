"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

interface NewFileDialogProps {
  onCreate: (name: string) => Promise<void>;
}

export function resolveScriptFilename(name: string): string {
  const trimmed = name.trim();
  if (trimmed.endsWith(".ts") || trimmed.endsWith(".js")) {
    return trimmed;
  }
  return `${trimmed}.ts`;
}

export default function NewFileDialog({ onCreate }: NewFileDialogProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    const filename = resolveScriptFilename(name);
    await onCreate(filename);
    setName("");
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button
            variant="outline"
            size="sm"
            className="w-full gap-1.5 text-xs focus-visible:ring-run/40"
          />
        }
      >
        <Plus className="h-3.5 w-3.5" />
        Create script
      </DialogTrigger>
      <DialogContent className="border-border bg-panel-raised">
        <DialogHeader>
          <DialogTitle>Create script</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <Input
            placeholder="my-test.ts"
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
