"use client";

import { useCallback, useEffect, useState } from "react";
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
import { DEFAULT_NAMESPACE } from "@/lib/namespaces";

interface NamespaceSelectorProps {
  namespace: string;
  onNamespaceChange: (namespace: string) => void;
}

export default function NamespaceSelector({
  namespace,
  onNamespaceChange,
}: NamespaceSelectorProps) {
  const [namespaces, setNamespaces] = useState<string[]>([DEFAULT_NAMESPACE]);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const fetchNamespaces = useCallback(async () => {
    const response = await fetch("/api/namespaces");
    if (!response.ok) return;
    const data = (await response.json()) as { namespaces?: string[] };
    const next = Array.from(
      new Set([DEFAULT_NAMESPACE, ...(data.namespaces ?? [])])
    );
    setNamespaces(next);
    if (!next.includes(namespace)) {
      onNamespaceChange(DEFAULT_NAMESPACE);
    }
  }, [namespace, onNamespaceChange]);

  useEffect(() => {
    void fetchNamespaces();
  }, [fetchNamespaces]);

  useEffect(() => {
    if (!open) {
      setName("");
      setError(null);
      setCreating(false);
    }
  }, [open]);

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;

    setCreating(true);
    setError(null);
    const response = await fetch("/api/namespaces", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: trimmed }),
    });

    if (!response.ok) {
      let message = "Could not create namespace";
      try {
        const body = (await response.json()) as { error?: string };
        message = body.error ?? message;
      } catch {
        // Keep default message.
      }
      setError(message);
      setCreating(false);
      return;
    }

    await fetchNamespaces();
    onNamespaceChange(trimmed);
    setOpen(false);
  }

  return (
    <div className="flex items-center gap-1.5">
      <label className="flex items-center gap-1.5">
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Namespace
        </span>
        <select
          aria-label="Namespace"
          value={namespace}
          onChange={(event) => onNamespaceChange(event.target.value)}
          className="h-7 max-w-44 rounded border border-border bg-panel-raised px-2 font-mono text-[11px] text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
        >
          {namespaces.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
      </label>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger
          render={
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              aria-label="Create namespace"
            />
          }
        >
          <Plus className="h-3.5 w-3.5" />
        </DialogTrigger>
        <DialogContent className="border-border bg-panel-raised">
          <DialogHeader>
            <DialogTitle>Create namespace</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreate} className="flex flex-col gap-3">
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">
                Namespace name
              </span>
              <Input
                aria-label="Namespace name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="font-mono text-sm"
                autoFocus
              />
            </label>
            {error && (
              <p role="alert" className="font-mono text-xs text-destructive">
                {error}
              </p>
            )}
            <Button type="submit" disabled={creating || !name.trim()}>
              Create
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
