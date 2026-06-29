"use client";

import { useEffect, useMemo, useRef, useState, type ClipboardEvent } from "react";
import { Eye, FileText, Pencil, Plus, Save, X } from "lucide-react";
import EmptyState from "@/components/layout/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import MarkdownPreview from "@/components/tabs/MarkdownPreview";
import { cn } from "@/lib/utils";
import type { ReportNote } from "@/lib/report-notes";
import { withBasePath } from "@/lib/base-path";

interface TestHistoryReportPreviewProps {
  namespace: string;
  reportName: string | null;
  activeTabId?: string;
  onActiveTabChange?: (tabId: string) => void;
}

type NoteTab = ReportNote & {
  persisted: boolean;
  dirty: boolean;
  error: string | null;
};

const SUMMARY_TAB_ID = "summary";
const UNTITLED_NOTE = "Untitled note";
const NOTE_SECONDARY_ACTION_CLASS =
  "border border-border bg-panel-raised text-muted-foreground shadow-sm hover:border-primary/60 hover:bg-panel-raised hover:text-foreground hover:ring-1 hover:ring-primary/30";
const NOTE_PRIMARY_ACTION_CLASS =
  "border border-primary/60 bg-primary text-primary-foreground shadow-sm hover:bg-primary/90 hover:ring-1 hover:ring-primary/50";

export default function TestHistoryReportPreview({
  namespace,
  reportName,
  activeTabId: controlledActiveTabId,
  onActiveTabChange,
}: TestHistoryReportPreviewProps) {
  const [notes, setNotes] = useState<NoteTab[]>([]);
  const [internalActiveTabId, setInternalActiveTabId] = useState(SUMMARY_TAB_ID);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [loadingNotes, setLoadingNotes] = useState(false);
  const requestIdRef = useRef(0);
  const activeTabId = controlledActiveTabId ?? internalActiveTabId;

  function setActiveTabId(tabId: string) {
    if (controlledActiveTabId === undefined) {
      setInternalActiveTabId(tabId);
    }
    onActiveTabChange?.(tabId);
  }

  useEffect(() => {
    if (!reportName) return;

    const requestId = ++requestIdRef.current;
    setLoadingNotes(true);
    setSaveError(null);
    setNotes([]);
    setInternalActiveTabId(SUMMARY_TAB_ID);
    setEditingNoteId(null);

    fetch(reportNotesApiUrl(reportName, namespace))
      .then(async (response) => {
        if (!response.ok) return { notes: [] };
        return (await response.json()) as { notes?: ReportNote[] };
      })
      .then((data) => {
        if (requestId !== requestIdRef.current) return;
        setNotes((data.notes ?? []).map(toNoteTab));
      })
      .catch(() => {
        if (requestId === requestIdRef.current) {
          setNotes([]);
          setSaveError("Could not load report notes");
        }
      })
      .finally(() => {
        if (requestId === requestIdRef.current) {
          setLoadingNotes(false);
        }
      });
  }, [namespace, reportName]);

  const activeNote = useMemo(
    () => notes.find((note) => note.id === activeTabId) ?? null,
    [activeTabId, notes]
  );

  if (!reportName) {
    return (
      <EmptyState
        icon={FileText}
        title="Select a report"
        description="Choose a report from the list to view results."
      />
    );
  }

  function handleAddNote() {
    const id = `note_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const draft: NoteTab = {
      id,
      title: UNTITLED_NOTE,
      markdown: "",
      persisted: false,
      dirty: true,
      error: null,
    };
    setNotes((current) => [...current, draft]);
    setActiveTabId(id);
    setEditingNoteId(null);
  }

  function selectSummaryTab() {
    setActiveTabId(SUMMARY_TAB_ID);
    setEditingNoteId(null);
  }

  function selectNoteTab(id: string) {
    setActiveTabId(id);
    setEditingNoteId(null);
  }

  function handleCloseNote(id: string) {
    const closing = notes.find((note) => note.id === id);
    const nextNotes = notes.filter((note) => note.id !== id);
    setNotes(nextNotes);
    if (activeTabId === id) {
      setActiveTabId(SUMMARY_TAB_ID);
    }
    if (editingNoteId === id) {
      setEditingNoteId(null);
    }
    if (closing?.persisted) {
      void persistNotes(nextNotes);
    }
  }

  function updateNote(id: string, patch: Partial<NoteTab>) {
    setNotes((current) =>
      current.map((note) =>
        note.id === id
          ? {
              ...note,
              ...patch,
              dirty: patch.dirty ?? true,
              error: patch.error ?? null,
            }
          : note
      )
    );
  }

  function handleSaveNote(id: string) {
    const nextNotes = notes.map((note) =>
      note.id === id
        ? {
            ...note,
            title: note.title.trim() || UNTITLED_NOTE,
            persisted: true,
            dirty: false,
            error: null,
          }
        : note
    );
    setNotes(nextNotes);
    setEditingNoteId(null);
    void persistNotes(nextNotes);
  }

  function handleEditorPaste(
    event: ClipboardEvent<HTMLTextAreaElement>,
    noteId: string
  ) {
    const imageItem = Array.from(event.clipboardData.items).find((item) =>
      item.type.startsWith("image/")
    );
    const file = imageItem?.getAsFile();
    if (!file) return;

    event.preventDefault();
    const start = event.currentTarget.selectionStart;
    const end = event.currentTarget.selectionEnd;
    void uploadPastedImage(noteId, file, start, end);
  }

  async function uploadPastedImage(
    noteId: string,
    file: File,
    start: number,
    end: number
  ) {
    if (!reportName) return;
    const formData = new FormData();
    formData.set("file", file);

    try {
      const response = await fetch(noteAssetsApiUrl(reportName, namespace), {
        method: "POST",
        body: formData,
      });
      if (!response.ok) {
        throw new Error("upload failed");
      }
      const body = (await response.json()) as { url?: string };
      if (!body.url) {
        throw new Error("upload failed");
      }
      const snippet = `![pasted image](${body.url})`;
      setNotes((current) =>
        current.map((note) =>
          note.id === noteId
            ? {
                ...note,
                markdown: insertAt(note.markdown, snippet, start, end),
                dirty: true,
                error: null,
              }
            : note
        )
      );
    } catch {
      updateNote(noteId, { error: "Could not upload pasted image" });
    }
  }

  async function persistNotes(nextNotes: NoteTab[]) {
    if (!reportName) return;
    setSaveError(null);
    const response = await fetch(reportNotesApiUrl(reportName, namespace), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        notes: nextNotes
          .filter((note) => note.persisted)
          .map(({ id, title, markdown }) => ({ id, title, markdown })),
      }),
    });
    if (!response.ok) {
      setSaveError("Could not save report notes");
    }
  }

  const summarySelected = activeTabId === SUMMARY_TAB_ID || !activeNote;
  const activeNoteIsEditing = activeNote ? editingNoteId === activeNote.id : false;

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-panel">
      <div className="flex shrink-0 items-end gap-1 border-b border-border bg-panel-raised px-2 pt-2">
        <div
          role="tablist"
          aria-label="Report preview tabs"
          className="flex min-w-0 flex-1 items-end gap-1"
        >
          <button
            type="button"
            role="tab"
            aria-selected={summarySelected}
            className={tabClassName(summarySelected)}
            onClick={selectSummaryTab}
          >
            Summary
          </button>

          {notes.map((note) => {
            const selected = activeTabId === note.id;
            return (
              <div
                key={note.id}
                className={noteTabShellClassName(selected)}
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  className="min-w-0 truncate px-3 text-left"
                  onClick={() => selectNoteTab(note.id)}
                >
                  <span className="truncate">{note.title || UNTITLED_NOTE}</span>
                </button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  className="mr-1 h-5 w-5 shrink-0 border border-border/70 bg-panel-raised text-muted-foreground hover:border-primary/60 hover:bg-panel hover:text-foreground"
                  aria-label={`Close note ${note.title || UNTITLED_NOTE}`}
                  onClick={() => handleCloseNote(note.id)}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            );
          })}

          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="mb-1 shrink-0"
            aria-label="Add note"
            onClick={handleAddNote}
          >
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {saveError && (
        <p role="alert" className="border-b border-border px-3 py-1 font-mono text-xs text-destructive">
          {saveError}
        </p>
      )}

      {summarySelected ? (
        <div className="min-h-0 flex-1 p-3">
          <iframe
            key={reportName}
            src={reportSummaryUrl(reportName, namespace)}
            className="h-full w-full rounded-md border border-border bg-white ring-1 ring-border"
            title={reportName}
            sandbox="allow-scripts allow-same-origin"
          />
        </div>
      ) : (
        activeNote && (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex shrink-0 items-center gap-1 border-b border-border bg-panel px-2 py-2">
              <Input
                aria-label="Note title"
                className="h-7 max-w-80 font-mono text-xs"
                value={activeNote.title}
                onChange={(event) =>
                  updateNote(activeNote.id, { title: event.target.value })
                }
              />
              <div className="flex-1" />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className={NOTE_SECONDARY_ACTION_CLASS}
                aria-label={activeNoteIsEditing ? "Preview note" : "Edit note"}
                onClick={() =>
                  setEditingNoteId(activeNoteIsEditing ? null : activeNote.id)
                }
              >
                {activeNoteIsEditing ? (
                  <Eye className="h-3.5 w-3.5" />
                ) : (
                  <Pencil className="h-3.5 w-3.5" />
                )}
                {activeNoteIsEditing ? "Preview" : "Edit"}
              </Button>
              <Button
                type="button"
                size="sm"
                className={NOTE_PRIMARY_ACTION_CLASS}
                aria-label="Save note"
                onClick={() => handleSaveNote(activeNote.id)}
              >
                <Save className="h-3.5 w-3.5" />
                Save
              </Button>
            </div>

            {activeNote.error && (
              <p role="alert" className="border-b border-border px-3 py-1 font-mono text-xs text-destructive">
                {activeNote.error}
              </p>
            )}

            <div className="min-h-0 flex-1 p-3">
              {activeNoteIsEditing ? (
                <textarea
                  aria-label="Markdown note"
                  className="h-full w-full resize-none rounded-md border border-border bg-panel px-3 py-2 font-mono text-xs text-foreground outline-none ring-1 ring-border placeholder:text-muted-foreground focus:border-primary"
                  placeholder={
                    loadingNotes
                      ? "Loading notes..."
                      : "Write Markdown notes. Paste an image to upload it."
                  }
                  value={activeNote.markdown}
                  onChange={(event) =>
                    updateNote(activeNote.id, { markdown: event.target.value })
                  }
                  onPaste={(event) => handleEditorPaste(event, activeNote.id)}
                />
              ) : (
                <div className="h-full overflow-auto rounded-md border border-border bg-panel px-4 py-3 ring-1 ring-border">
                  <MarkdownPreview markdown={activeNote.markdown} />
                </div>
              )}
            </div>
          </div>
        )
      )}
    </div>
  );
}

function toNoteTab(note: ReportNote): NoteTab {
  return {
    ...note,
    title: note.title || UNTITLED_NOTE,
    persisted: true,
    dirty: false,
    error: null,
  };
}

function insertAt(value: string, insertion: string, start: number, end: number): string {
  const safeStart = Math.max(0, Math.min(start, value.length));
  const safeEnd = Math.max(safeStart, Math.min(end, value.length));
  return `${value.slice(0, safeStart)}${insertion}${value.slice(safeEnd)}`;
}

function reportSummaryUrl(reportName: string, namespace: string): string {
  return withBasePath(
    `/api/reports/${encodeURIComponent(reportName)}?${namespaceQuery(namespace)}`
  );
}

function reportNotesApiUrl(reportName: string, namespace: string): string {
  return withBasePath(
    `/api/reports/${encodeURIComponent(reportName)}/notes?${namespaceQuery(namespace)}`
  );
}

function noteAssetsApiUrl(reportName: string, namespace: string): string {
  return withBasePath(
    `/api/reports/${encodeURIComponent(reportName)}/note-assets?${namespaceQuery(namespace)}`
  );
}

function namespaceQuery(namespace: string): string {
  return `namespace=${encodeURIComponent(namespace)}`;
}

function tabClassName(selected: boolean): string {
  return cn(
    "mb-0 inline-flex h-8 min-w-0 items-center gap-1 rounded-t-md border border-border border-b-0 px-3 text-xs font-medium transition-colors",
    selected
      ? "bg-panel text-foreground"
      : "bg-panel-raised text-muted-foreground hover:text-foreground"
  );
}

function noteTabShellClassName(selected: boolean): string {
  return cn(
    "mb-0 grid h-8 min-w-0 max-w-56 grid-cols-[minmax(0,1fr)_auto] items-center rounded-t-md border border-border border-b-0 text-xs font-medium transition-colors",
    selected
      ? "bg-panel text-foreground"
      : "bg-panel-raised text-muted-foreground hover:text-foreground"
  );
}
