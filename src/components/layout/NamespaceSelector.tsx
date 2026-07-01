"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  ChevronDown,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
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
  const [manageOpen, setManageOpen] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [editingNamespace, setEditingNamespace] = useState<string | null>(null);
  const [renameDrafts, setRenameDrafts] = useState<Record<string, string>>({});
  const [renameError, setRenameError] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
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
    if (!manageOpen) {
      setName("");
      setError(null);
      setCreating(false);
      setDeleteConfirmOpen(false);
      setDeleteTarget(null);
      setDeleteError(null);
      setDeleting(false);
      setEditingNamespace(null);
      setRenameDrafts({});
      setRenameError(null);
      setRenaming(null);
    }
  }, [manageOpen]);

  useEffect(() => {
    if (!selectorOpen) {
      setNamespaceQuery("");
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
    setName("");
    setCreating(false);
  }

  async function handleDeleteNamespace() {
    if (!deleteTarget || deleteTarget === DEFAULT_NAMESPACE) return;

    setDeleting(true);
    setDeleteError(null);
    const response = await fetch(
      withBasePath(`/api/namespaces?namespace=${encodeURIComponent(deleteTarget)}`),
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
    if (namespace === deleteTarget) {
      onNamespaceChange(DEFAULT_NAMESPACE);
    }
    setDeleting(false);
    setDeleteConfirmOpen(false);
    setDeleteTarget(null);
  }

  async function handleRenameNamespace(from: string) {
    if (from === DEFAULT_NAMESPACE) return;

    const to = (renameDrafts[from] ?? from).trim();
    if (!to || to === from) return;

    setRenaming(from);
    setRenameError(null);
    const response = await fetch(withBasePath("/api/namespaces"), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ from, to }),
    });

    if (!response.ok) {
      let message = "Could not rename namespace";
      try {
        const body = (await response.json()) as { error?: string };
        message = body.error ?? message;
      } catch {
        // Keep default message.
      }
      setRenameError(message);
      setRenaming(null);
      return;
    }

    await fetchNamespaces();
    if (namespace === from) {
      onNamespaceChange(to);
    }
    setEditingNamespace(null);
    setRenameDrafts((current) => {
      const next = { ...current };
      delete next[from];
      return next;
    });
    setRenaming(null);
  }

  function handleBeginRenameNamespace(item: string) {
    setEditingNamespace(item);
    setRenameError(null);
    setRenameDrafts((current) => ({
      ...current,
      [item]: current[item] ?? item,
    }));
  }

  function handleCancelRenameNamespace(item: string) {
    setEditingNamespace(null);
    setRenameError(null);
    setRenameDrafts((current) => {
      const next = { ...current };
      delete next[item];
      return next;
    });
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
                    <div
                      key={item}
                      data-testid={`namespace-option-row-${item}`}
                      className="flex min-w-0 items-stretch gap-1"
                    >
                      <button
                        type="button"
                        role="option"
                        aria-label={`Select namespace ${item}`}
                        aria-selected={selected}
                        onClick={() => handleSelectNamespace(item)}
                        className={cn(
                          "flex min-w-0 flex-1 items-center justify-between gap-2 rounded border px-2 py-1.5 text-left font-mono text-xs transition-colors",
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
                    </div>
                  );
                })
              )}
            </div>
            <div className="mt-2 border-t border-border pt-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="w-full justify-start gap-1.5"
                onClick={() => {
                  setManageOpen(true);
                  setSelectorOpen(false);
                }}
              >
                Manage namespaces
              </Button>
            </div>
          </div>
        )}
      </div>
      <Dialog open={manageOpen} onOpenChange={setManageOpen}>
        <DialogContent className="max-h-[calc(100vh-2rem)] max-w-2xl overflow-hidden border-border bg-panel-raised sm:max-w-2xl">
          <DialogHeader className="pr-10">
            <DialogTitle>Manage namespaces</DialogTitle>
          </DialogHeader>
          <div className="flex min-h-0 flex-col gap-4 overflow-hidden">
            <form
              onSubmit={handleCreate}
              className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end"
            >
              <label className="flex min-w-0 flex-col gap-1.5">
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
              <Button
                type="submit"
                className="w-full gap-1.5 sm:w-auto"
                disabled={creating || !name.trim()}
              >
                <Plus className="h-3.5 w-3.5" />
                Create namespace
              </Button>
            </form>
            {error && (
              <p role="alert" className="font-mono text-xs text-destructive">
                {error}
              </p>
            )}
            {renameError && (
              <p role="alert" className="font-mono text-xs text-destructive">
                {renameError}
              </p>
            )}
            {deleteError && (
              <p role="alert" className="font-mono text-xs text-destructive">
                {deleteError}
              </p>
            )}

            <div
              data-testid="namespace-management-list"
              className="flex max-h-[min(24rem,50vh)] min-h-0 flex-col gap-2 overflow-y-auto pr-1"
            >
              {namespaces.map((item) => {
                const protectedNamespace = item === DEFAULT_NAMESPACE;
                const editing = editingNamespace === item;
                const renameValue = renameDrafts[item] ?? item;
                return (
                  <div
                    key={item}
                    data-testid={`manage-namespace-row-${item}`}
                    className={cn(
                      "flex min-w-0 flex-col gap-2 rounded border border-border bg-panel px-2 py-2",
                      editing && "border-primary/45 bg-primary/5"
                    )}
                  >
                    <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                      <div className="flex min-w-0 flex-1 items-center gap-2">
                        {editing ? (
                          <Input
                            aria-label={`Rename ${item}`}
                            value={renameValue}
                            onChange={(event) =>
                              setRenameDrafts((current) => ({
                                ...current,
                                [item]: event.target.value,
                              }))
                            }
                            onKeyDown={(event) => {
                              if (event.key === "Enter") {
                                event.preventDefault();
                                void handleRenameNamespace(item);
                              }
                              if (event.key === "Escape") {
                                event.preventDefault();
                                handleCancelRenameNamespace(item);
                              }
                            }}
                            className="h-8 min-w-0 bg-input font-mono text-xs"
                            autoFocus
                          />
                        ) : (
                          <span
                            title={item}
                            className="min-w-0 truncate font-mono text-xs text-foreground"
                          >
                            {item}
                          </span>
                        )}
                        {protectedNamespace && (
                          <span className="shrink-0 rounded border border-border bg-muted/30 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                            Protected
                          </span>
                        )}
                        {!protectedNamespace && !editing && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`Edit namespace ${item}`}
                            className="shrink-0 rounded border border-border/80 text-muted-foreground hover:border-primary/50 hover:bg-primary/10 hover:text-primary"
                            onClick={() => handleBeginRenameNamespace(item)}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                      {!protectedNamespace && (
                        <div className="flex shrink-0 items-center gap-1">
                          {editing && (
                            <>
                              <Button
                                type="button"
                                variant="outline"
                                size="icon-sm"
                                aria-label={`Save namespace ${item}`}
                                disabled={
                                  renaming === item ||
                                  !renameValue.trim() ||
                                  renameValue.trim() === item
                                }
                                onClick={() => void handleRenameNamespace(item)}
                              >
                                <Check className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon-sm"
                                aria-label={`Cancel rename ${item}`}
                                disabled={renaming === item}
                                className="rounded border border-border/80"
                                onClick={() => handleCancelRenameNamespace(item)}
                              >
                                <X className="h-3.5 w-3.5" />
                              </Button>
                            </>
                          )}
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`Delete namespace ${item}`}
                            className="rounded border border-destructive/25 text-destructive hover:border-destructive/60 hover:bg-destructive/10 hover:text-destructive"
                            onClick={() => {
                              setDeleteTarget(item);
                              setDeleteConfirmOpen(true);
                              setDeleteError(null);
                            }}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {deleteConfirmOpen && deleteTarget && (
              <div className="rounded border border-destructive/30 bg-destructive/10 p-3">
                <p className="font-mono text-xs text-foreground">
                  Delete {deleteTarget}?
                </p>
                <div className="mt-2 flex items-center gap-2">
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
                      setDeleteTarget(null);
                      setDeleteError(null);
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
