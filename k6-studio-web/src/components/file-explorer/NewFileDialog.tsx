"use client";

import { useState } from "react";
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

export default function NewFileDialog({ onCreate }: NewFileDialogProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    const filename = name.trim().endsWith(".js")
      ? name.trim()
      : `${name.trim()}.js`;
    await onCreate(filename);
    setName("");
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="outline" size="sm" className="w-full text-xs" />
        }
      >
        + New Script
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New k6 Script</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <Input
            placeholder="script-name.js"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
          <Button type="submit">Create</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
