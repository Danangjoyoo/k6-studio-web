"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Plus, Search, Trash2 } from "lucide-react";
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
import { withBasePath } from "@/lib/base-path";
import { cn } from "@/lib/utils";

interface NamespaceSelectorProps {
  namespace: string;
  onNamespaceChange: (namespace: string) => void;
}

export default function NamespaceSelector({
  namespace,
  onNamespaceChange,
}: NamespaceSelectorProps) {
  const [namespaces, setNamespaces] = useState<string[]>([DEFAULT_NAMESPACE]);
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [namespaceQuery, setNamespaceQuery] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const selectorRef = useRef<HTMLDivElement | null>(null);

  const fetchNamespaces = useCallback(async () => {
    const response = await fetch(withBasePath("/api/namespaces"));
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

  const filteredNamespaces = useMemo(() => {
    const normalized = namespaceQuery.trim().toLowerCase();
    if (!normalized) return namespaces;
    return namespaces.filter((item) =>
      item.toLowerCase().includes(normalized)
    );
  }, [namespaceQuery, namespaces]);

  useEffect(() => {
    void fetchNamespaces();
  }, [fetchNamespaces]);

  useEffect(() => {
    if (!createOpen) {
      setName("");
      setError(null);
      setCreating(false);
    }
  }, [createOpen]);

  useEffect(() => {
    if (!selectorOpen) {
      setNamespaceQuery("");
      setDeleteConfirmOpen(false);
      setDeleteError(null);
      setDeleting(false);
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      if (!selectorRef.current?.contains(event.target as Node)) {
        setSelectorOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setSelectorOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [selectorOpen]);

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;

    setCreating(true);
    setError(null);
    const response = await fetch(withBasePath("/api/namespaces"), {
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
    setCreateOpen(false);
  }

  async function handleDeleteNamespace() {
    if (namespace === DEFAULT_NAMESPACE) return;

    setDeleting(true);
    setDeleteError(null);
    const response = await fetch(
      withBasePath(`/api/namespaces?namespace=${encodeURIComponent(namespace)}`),
      { method: "DELETE" }
    );

    if (!response.ok) {
      let message = "Could not delete namespace";
      try {
        const body = (await response.json()) as { error?: string };
        message = body.error ?? message;
      } catch {
        // Keep default message.
      }
      setDeleteError(message);
      setDeleting(false);
      return;
    }

    await fetchNamespaces();
    onNamespaceChange(DEFAULT_NAMESPACE);
    setDeleting(false);
    setDeleteConfirmOpen(false);
    setSelectorOpen(false);
  }

  function handleSelectNamespace(nextNamespace: string) {
    onNamespaceChange(nextNamespace);
    setSelectorOpen(false);
    setNamespaceQuery("");
  }

  return (
    <div className="flex items-center gap-1.5">
      <div ref={selectorRef} className="relative flex items-center gap-1.5">
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Namespace
        </span>
        <button
          type="button"
          aria-label={`Namespace: ${namespace}`}
          aria-haspopup="listbox"
          aria-expanded={selectorOpen}
          onClick={() => setSelectorOpen((open) => !open)}
          className="flex h-7 max-w-48 min-w-28 items-center justify-between gap-1.5 rounded border border-border bg-panel-raised px-2 font-mono text-[11px] text-foreground outline-none transition-colors hover:border-primary/60 hover:bg-muted/40 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
        >
          <span className="truncate">{namespace}</span>
          <ChevronDown
            className={cn(
              "h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform",
              selectorOpen && "rotate-180"
            )}
          />
        </button>

        {selectorOpen && (
          <div className="absolute left-0 top-8 z-50 w-64 rounded-md border border-border bg-popover p-2 shadow-lg">
            <label className="relative block">
              <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                role="searchbox"
                aria-label="Search namespaces"
                value={namespaceQuery}
                onChange={(event) => setNamespaceQuery(event.target.value)}
                placeholder="Search namespaces"
                className="h-7 w-full rounded-md bg-panel pl-7 pr-2 font-mono text-xs"
                autoFocus
              />
            </label>
            <div
              role="listbox"
              aria-label="Namespaces"
              className="mt-2 flex max-h-56 flex-col gap-1 overflow-auto"
            >
              {filteredNamespaces.length === 0 ? (
                <p className="px-2 py-1 font-mono text-xs text-muted-foreground">
                  No namespaces
                </p>
              ) : (
                filteredNamespaces.map((item) => {
                  const selected = item === namespace;
                  return (
                    <button
                      key={item}
                      type="button"
                      role="option"
                      aria-label={`Select namespace ${item}`}
                      aria-selected={selected}
                      onClick={() => handleSelectNamespace(item)}
                      className={cn(
                        "flex min-w-0 items-center justify-between gap-2 rounded border px-2 py-1.5 text-left font-mono text-xs transition-colors",
                        selected
                          ? "border-primary/50 bg-primary/10 text-foreground"
                          : "border-transparent text-muted-foreground hover:border-border hover:bg-panel-raised hover:text-foreground"
                      )}
                    >
                      <span className="truncate">{item}</span>
                      {selected && (
                        <Check className="h-3.5 w-3.5 shrink-0 text-primary" />
                      )}
                    </button>
                  );
                })
              )}
            </div>
            {namespace !== DEFAULT_NAMESPACE && (
              <div className="mt-2 border-t border-border pt-2">
                {deleteError && (
                  <p role="alert" className="mb-2 font-mono text-xs text-destructive">
                    {deleteError}
                  </p>
                )}
                {deleteConfirmOpen ? (
                  <div className="flex flex-col gap-2">
                    <p className="font-mono text-[11px] text-muted-foreground">
                      Delete {namespace}?
                    </p>
                    <div className="flex items-center gap-1">
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        aria-label="Confirm delete namespace"
                        disabled={deleting}
                        onClick={() => void handleDeleteNamespace()}
                      >
                        Delete
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={deleting}
                        onClick={() => {
                          setDeleteConfirmOpen(false);
                          setDeleteError(null);
                        }}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-label="Delete namespace"
                    className="w-full justify-start gap-1.5 text-destructive hover:text-destructive"
                    onClick={() => setDeleteConfirmOpen(true)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete namespace
                  </Button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
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
