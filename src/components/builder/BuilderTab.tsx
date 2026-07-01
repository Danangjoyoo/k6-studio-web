"use client";

import { useReducer, useRef, useState, type Dispatch, type ReactNode } from "react";
import {
  ChevronDown,
  ChevronRight,
  Clock,
  Code2,
  GripVertical,
  Hammer,
  Plus,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  builderReducer,
  initialBuilderForm,
  type BuilderAction,
} from "@/components/builder/builder-state";
import SampleSetEditor from "@/components/builder/SampleSetEditor";
import { useScriptWorkspace } from "@/contexts/ScriptWorkspaceContext";
import {
  generateScript,
  hasScriptBuilderMarker,
  type BuilderForm,
  type GraphqlRequest,
  type RestRequest,
  type Step,
} from "@/lib/script-builder";
import { withBasePath } from "@/lib/base-path";
import { cn } from "@/lib/utils";

const UNITS = [
  { value: "s", label: "seconds" },
  { value: "m", label: "minutes" },
  { value: "h", label: "hours" },
] as const;

const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;
const THRESHOLD_METRICS = [
  "http_req_duration",
  "http_req_failed",
  "http_reqs",
  "iteration_duration",
  "checks",
];

type BuilderDispatch = Dispatch<BuilderAction>;

export default function BuilderTab() {
  const [form, dispatch] = useReducer(
    builderReducer,
    undefined,
    initialBuilderForm
  );
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [checkingTarget, setCheckingTarget] = useState(false);
  const [pendingApply, setPendingApply] = useState<{
    content: string;
    suggestedName: string;
  } | null>(null);
  const {
    namespace,
    selectedFile,
    applyBuilderToEditor,
  } = useScriptWorkspace();

  async function handleApplyToEditor() {
    const content = generateScript(form);
    const suggestedName = "built-by-builder.ts";

    if (!selectedFile) {
      applyBuilderToEditor(content, suggestedName);
      return;
    }

    setCheckingTarget(true);
    try {
      const response = await fetch(scriptFileUrl(selectedFile, namespace));
      const data = response.ok
        ? ((await response.json()) as { content?: unknown })
        : null;
      const existingContent =
        typeof data?.content === "string" ? data.content : "";

      if (hasScriptBuilderMarker(existingContent)) {
        applyBuilderToEditor(content, suggestedName);
        return;
      }
    } catch {
      // Fall through to the protective confirmation when the target cannot be
      // inspected.
    } finally {
      setCheckingTarget(false);
    }

    setPendingApply({ content, suggestedName });
    setConfirmOpen(true);
  }

  function handleConfirmApply() {
    if (!pendingApply) return;
    applyBuilderToEditor(pendingApply.content, pendingApply.suggestedName);
    setConfirmOpen(false);
    setPendingApply(null);
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-background">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border bg-panel px-3 py-2">
        <div className="mr-auto flex min-w-0 items-center gap-2">
          <Hammer className="h-4 w-4 shrink-0 text-run" />
          <div className="min-w-0">
            <p className="text-xs font-semibold text-foreground">Script Builder</p>
            <p className="truncate text-[11px] text-muted-foreground">
              Compose a k6 script from form controls
            </p>
          </div>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 gap-1.5 text-xs"
          onClick={() => dispatch({ type: "reset" })}
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Reset
        </Button>
        <Button
          type="button"
          size="sm"
          className="h-7 gap-1.5 text-xs"
          disabled={checkingTarget}
          onClick={() => void handleApplyToEditor()}
        >
          <Code2 className="h-3.5 w-3.5" />
          Apply to Editor
        </Button>
      </div>

      <Dialog
        open={confirmOpen}
        onOpenChange={(open) => {
          setConfirmOpen(open);
          if (!open) setPendingApply(null);
        }}
      >
        <DialogContent className="border-border bg-panel-raised">
          <DialogHeader>
            <DialogTitle>Apply generated script?</DialogTitle>
            <DialogDescription>
              your script will be overridden once applied, do you want to
              proceed?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleConfirmApply}>Proceed</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="min-h-0 flex-1 overflow-auto">
        <div className="flex w-full max-w-5xl flex-col gap-3 p-4">
          <BuilderSection index="1" title="Target" hint="where requests go">
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">
                Host
              </span>
              <Input
                value={form.host}
                onChange={(event) =>
                  dispatch({
                    type: "updatePath",
                    path: "host",
                    value: event.target.value,
                  })
                }
                placeholder="https://example.com"
                className="h-8 bg-input font-mono text-xs"
              />
            </label>
          </BuilderSection>

          <StagesSection form={form} dispatch={dispatch} />
          <ThresholdsSection form={form} dispatch={dispatch} />
          <StepsSection form={form} dispatch={dispatch} />
        </div>
      </div>
    </div>
  );
}

function scriptFileUrl(filename: string, namespace: string): string {
  return withBasePath(
    `/api/files/${encodeApiPath(filename)}?namespace=${encodeURIComponent(namespace)}`
  );
}

function encodeApiPath(path: string): string {
  return path
    .split("/")
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

function BuilderSection({
  index,
  title,
  hint,
  children,
}: {
  index: string;
  title: string;
  hint: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-lg border border-border bg-panel">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2.5">
        <span className="flex h-5 w-5 items-center justify-center rounded bg-panel-raised font-mono text-[11px] font-semibold text-primary">
          {index}
        </span>
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        <span className="ml-auto text-[11px] text-muted-foreground">{hint}</span>
      </div>
      <div className="p-3">{children}</div>
    </section>
  );
}

function StagesSection({
  form,
  dispatch,
}: {
  form: BuilderForm;
  dispatch: BuilderDispatch;
}) {
  const dragIndexRef = useRef<number | null>(null);

  return (
    <BuilderSection index="2" title="Load profile" hint="options.stages">
      <div className="flex flex-col gap-2">
        {form.stages.map((stage, index) => (
          <div
            key={index}
            draggable
            onDragStart={() => {
              dragIndexRef.current = index;
            }}
            onDragOver={(event) => event.preventDefault()}
            onDrop={() => {
              if (dragIndexRef.current !== null) {
                dispatch({
                  type: "moveStage",
                  from: dragIndexRef.current,
                  to: index,
                });
              }
              dragIndexRef.current = null;
            }}
            className="grid grid-cols-[auto_1fr_8rem_1fr_auto] items-end gap-2"
          >
            <DragHandle />
            <LabeledInput
              label="Duration"
              value={stage.duration}
              path={`stages.${index}.duration`}
              dispatch={dispatch}
            />
            <LabeledSelect
              label="Unit"
              value={stage.unit}
              path={`stages.${index}.unit`}
              options={UNITS}
              dispatch={dispatch}
            />
            <LabeledInput
              label="Target VUs"
              value={stage.target}
              path={`stages.${index}.target`}
              dispatch={dispatch}
            />
            <IconButton
              label="Remove stage"
              disabled={form.stages.length <= 1}
              onClick={() => dispatch({ type: "removeStage", index })}
            />
          </div>
        ))}
        <AddButton
          label="Add stage"
          onClick={() => dispatch({ type: "addStage" })}
        />
      </div>
    </BuilderSection>
  );
}

function ThresholdsSection({
  form,
  dispatch,
}: {
  form: BuilderForm;
  dispatch: BuilderDispatch;
}) {
  return (
    <BuilderSection index="3" title="Thresholds" hint="optional quality gates">
      <div className="flex flex-col gap-2">
        {form.thresholds.map((threshold, index) => (
          <div
            key={index}
            className="grid grid-cols-[1.2fr_1fr_auto] items-end gap-2"
          >
            <LabeledSelect
              label="Metric"
              value={threshold.metric}
              path={`thresholds.${index}.metric`}
              options={THRESHOLD_METRICS.map((metric) => ({
                value: metric,
                label: metric,
              }))}
              dispatch={dispatch}
            />
            <LabeledInput
              label="Condition"
              value={threshold.condition}
              path={`thresholds.${index}.condition`}
              dispatch={dispatch}
            />
            <IconButton
              label="Remove threshold"
              onClick={() => dispatch({ type: "removeThreshold", index })}
            />
          </div>
        ))}
        <AddButton
          label="Add threshold"
          onClick={() => dispatch({ type: "addThreshold" })}
        />
      </div>
    </BuilderSection>
  );
}

function StepsSection({
  form,
  dispatch,
}: {
  form: BuilderForm;
  dispatch: BuilderDispatch;
}) {
  const dragIndexRef = useRef<number | null>(null);

  return (
    <BuilderSection index="4" title="Scenario steps" hint="runs in order">
      <div className="flex flex-col gap-3">
        {form.steps.map((step, index) => (
          <StepCard
            key={index}
            step={step}
            index={index}
            dispatch={dispatch}
            onDragStart={() => {
              dragIndexRef.current = index;
            }}
            onDrop={() => {
              if (dragIndexRef.current !== null) {
                dispatch({
                  type: "moveStep",
                  from: dragIndexRef.current,
                  to: index,
                });
              }
              dragIndexRef.current = null;
            }}
          />
        ))}
        <div className="grid grid-cols-2 gap-2">
          <AddButton
            label="Add API request"
            onClick={() => dispatch({ type: "addRequestStep" })}
          />
          <AddButton
            label="Add sleep"
            onClick={() => dispatch({ type: "addSleepStep" })}
          />
        </div>
      </div>
    </BuilderSection>
  );
}

function StepCard({
  step,
  index,
  dispatch,
  onDragStart,
  onDrop,
}: {
  step: Step;
  index: number;
  dispatch: BuilderDispatch;
  onDragStart: () => void;
  onDrop: () => void;
}) {
  if (step.type === "sleep") {
    return (
      <div
        draggable
        onDragStart={onDragStart}
        onDragOver={(event) => event.preventDefault()}
        onDrop={onDrop}
        className="flex overflow-hidden rounded-lg border border-border bg-panel-raised"
      >
        <DragRail />
        <div className="grid flex-1 grid-cols-[auto_1fr_8rem_auto] items-center gap-2 p-3">
          <span className="inline-flex items-center gap-1 rounded bg-run/10 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-run">
            <Clock className="h-3 w-3" />
            Sleep
          </span>
          <LabeledInput
            label="Duration"
            value={step.duration}
            path={`steps.${index}.duration`}
            dispatch={dispatch}
          />
          <LabeledSelect
            label="Unit"
            value={step.unit}
            path={`steps.${index}.unit`}
            options={UNITS}
            dispatch={dispatch}
          />
          <IconButton
            label="Remove step"
            onClick={() => dispatch({ type: "removeStep", index })}
          />
        </div>
      </div>
    );
  }

  const request = step.request;
  const summary =
    request.reqType === "rest"
      ? `${request.method} ${request.path || "/"}`
      : `GraphQL ${request.path || "/"}`;

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragOver={(event) => event.preventDefault()}
      onDrop={onDrop}
      className="flex overflow-hidden rounded-lg border border-border bg-panel-raised"
    >
      <DragRail />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 p-3">
          <span className="inline-flex items-center gap-1 rounded bg-primary/10 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-primary">
            <Code2 className="h-3 w-3" />
            API request
          </span>
          <SegmentedRequestType
            reqType={request.reqType}
            onChange={(reqType) =>
              dispatch({ type: "setRequestType", index, reqType })
            }
          />
          <span className="min-w-0 truncate font-mono text-[11px] text-muted-foreground">
            {summary}
          </span>
          <button
            type="button"
            aria-label={step.collapsed ? "Expand step" : "Collapse step"}
            className="ml-auto text-muted-foreground hover:text-foreground"
            onClick={() => dispatch({ type: "toggleCollapse", index })}
          >
            {step.collapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </button>
          <IconButton
            label="Remove step"
            onClick={() => dispatch({ type: "removeStep", index })}
          />
        </div>
        {!step.collapsed && (
          <div className="flex flex-col gap-3 border-t border-border p-3">
            {request.reqType === "rest" ? (
              <RestRequestFields
                request={request}
                index={index}
                dispatch={dispatch}
              />
            ) : (
              <GraphqlRequestFields
                request={request}
                index={index}
                dispatch={dispatch}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function RestRequestFields({
  request,
  index,
  dispatch,
}: {
  request: RestRequest;
  index: number;
  dispatch: BuilderDispatch;
}) {
  return (
    <>
      <div className="grid grid-cols-[8rem_1fr] gap-2">
        <LabeledSelect
          label="Method"
          value={request.method}
          path={`steps.${index}.request.method`}
          options={METHODS.map((method) => ({ value: method, label: method }))}
          dispatch={dispatch}
        />
        <LabeledInput
          label="Path"
          value={request.path}
          path={`steps.${index}.request.path`}
          dispatch={dispatch}
        />
      </div>
      <SampleSetEditor
        kind="payload"
        title="Body"
        path={`steps.${index}.request.bodies`}
        values={request.bodies}
        addLabel="add body sample"
        dispatch={dispatch}
      />
      <SampleSetEditor
        kind="keyValue"
        title="Headers"
        path={`steps.${index}.request.headerSets`}
        sets={request.headerSets}
        addSetLabel="add header sample"
        addRowLabel="add header to this set"
        dispatch={dispatch}
      />
      <SampleSetEditor
        kind="keyValue"
        title="Query params"
        path={`steps.${index}.request.querySets`}
        sets={request.querySets}
        addSetLabel="add query sample"
        addRowLabel="add param to this set"
        dispatch={dispatch}
      />
    </>
  );
}

function GraphqlRequestFields({
  request,
  index,
  dispatch,
}: {
  request: GraphqlRequest;
  index: number;
  dispatch: BuilderDispatch;
}) {
  return (
    <>
      <LabeledInput
        label="Endpoint path"
        value={request.path}
        path={`steps.${index}.request.path`}
        dispatch={dispatch}
      />
      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-muted-foreground">
          Query / mutation
        </span>
        <textarea
          value={request.query}
          onChange={(event) =>
            dispatch({
              type: "updatePath",
              path: `steps.${index}.request.query`,
              value: event.target.value,
            })
          }
          className="min-h-24 rounded border border-input bg-input px-2 py-1.5 font-mono text-xs text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
        />
      </label>
      <SampleSetEditor
        kind="payload"
        title="Variables"
        path={`steps.${index}.request.variables`}
        values={request.variables}
        addLabel="add variables sample"
        dispatch={dispatch}
      />
      <SampleSetEditor
        kind="keyValue"
        title="Headers"
        path={`steps.${index}.request.headerSets`}
        sets={request.headerSets}
        addSetLabel="add header sample"
        addRowLabel="add header to this set"
        dispatch={dispatch}
      />
    </>
  );
}

function SegmentedRequestType({
  reqType,
  onChange,
}: {
  reqType: "rest" | "graphql";
  onChange: (reqType: "rest" | "graphql") => void;
}) {
  return (
    <div className="inline-flex overflow-hidden rounded border border-border">
      {(["rest", "graphql"] as const).map((type) => (
        <button
          key={type}
          type="button"
          className={cn(
            "px-2.5 py-1 text-[11px] font-medium uppercase transition-colors",
            reqType === type
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-muted hover:text-foreground"
          )}
          onClick={() => onChange(type)}
        >
          {type === "rest" ? "REST" : "GraphQL"}
        </button>
      ))}
    </div>
  );
}

function LabeledInput({
  label,
  value,
  path,
  dispatch,
}: {
  label: string;
  value: string;
  path: string;
  dispatch: BuilderDispatch;
}) {
  return (
    <label className="flex min-w-0 flex-col gap-1.5">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <Input
        value={value}
        onChange={(event) =>
          dispatch({
            type: "updatePath",
            path,
            value: event.target.value,
          })
        }
        className="h-8 bg-input font-mono text-xs"
      />
    </label>
  );
}

function LabeledSelect({
  label,
  value,
  path,
  options,
  dispatch,
}: {
  label: string;
  value: string;
  path: string;
  options: ReadonlyArray<{ value: string; label: string }>;
  dispatch: BuilderDispatch;
}) {
  return (
    <label className="flex min-w-0 flex-col gap-1.5">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <select
        value={value}
        onChange={(event) =>
          dispatch({
            type: "updatePath",
            path,
            value: event.target.value,
          })
        }
        className="h-8 rounded border border-input bg-input px-2 font-mono text-xs text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function DragHandle() {
  return (
    <span className="mb-1 flex h-8 w-6 items-center justify-center text-muted-foreground">
      <GripVertical className="h-4 w-4" />
    </span>
  );
}

function DragRail() {
  return (
    <span className="flex w-8 shrink-0 cursor-grab items-center justify-center border-r border-border bg-background/20 text-muted-foreground">
      <GripVertical className="h-4 w-4" />
    </span>
  );
}

function IconButton({
  label,
  disabled,
  onClick,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
    >
      <Trash2 className="h-3.5 w-3.5" />
    </Button>
  );
}

function AddButton({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="inline-flex min-h-8 items-center justify-center gap-1.5 rounded-md border border-dashed border-border px-3 py-1.5 text-xs font-medium text-primary transition-colors hover:border-primary/50 hover:bg-primary/10"
      onClick={onClick}
    >
      <Plus className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}
