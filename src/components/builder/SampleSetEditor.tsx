"use client";

import type { Dispatch } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { BuilderAction } from "@/components/builder/builder-state";
import type { KeyValue } from "@/lib/script-builder";

interface PayloadSampleEditorProps {
  kind: "payload";
  title: string;
  path: string;
  values: string[];
  addLabel: string;
  dispatch: Dispatch<BuilderAction>;
}

interface KeyValueSampleEditorProps {
  kind: "keyValue";
  title: string;
  path: string;
  sets: KeyValue[][];
  addSetLabel: string;
  addRowLabel: string;
  dispatch: Dispatch<BuilderAction>;
}

type SampleSetEditorProps = PayloadSampleEditorProps | KeyValueSampleEditorProps;

export default function SampleSetEditor(props: SampleSetEditorProps) {
  if (props.kind === "payload") {
    return (
      <section className="rounded-md border border-border bg-panel">
        <SampleHeader title={props.title} count={props.values.length} />
        <div className="flex flex-col gap-2 px-3 pb-3">
          {props.values.map((value, index) => (
            <div key={index} className="flex items-start gap-2">
              <span className="mt-2 w-5 shrink-0 font-mono text-[10px] text-muted-foreground">
                {index + 1}
              </span>
              <textarea
                value={value}
                onChange={(event) =>
                  props.dispatch({
                    type: "updatePath",
                    path: `${props.path}.${index}`,
                    value: event.target.value,
                  })
                }
                className="min-h-14 flex-1 resize-y rounded border border-input bg-input px-2 py-1.5 font-mono text-xs text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={`Remove ${props.title} sample ${index + 1}`}
                disabled={props.values.length <= 1}
                onClick={() =>
                  props.dispatch({
                    type: "removeSample",
                    path: props.path,
                    index,
                  })
                }
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
          <button
            type="button"
            className="self-start font-mono text-[11px] text-muted-foreground hover:text-primary"
            onClick={() =>
              props.dispatch({ type: "pushSample", path: props.path })
            }
          >
            + {props.addLabel}
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-md border border-border bg-panel">
      <SampleHeader title={props.title} count={props.sets.length} />
      <div className="flex flex-col gap-2 px-3 pb-3">
        {props.sets.map((set, setIndex) => (
          <div key={setIndex} className="flex items-start gap-2">
            <span className="mt-2 w-5 shrink-0 font-mono text-[10px] text-muted-foreground">
              {setIndex + 1}
            </span>
            <div className="flex flex-1 flex-col gap-1.5">
              {set.map((row, rowIndex) => (
                <div
                  key={`${setIndex}-${rowIndex}`}
                  className="grid grid-cols-[1fr_1.4fr_auto] gap-1.5"
                >
                  <Input
                    value={row.k}
                    placeholder="key"
                    onChange={(event) =>
                      props.dispatch({
                        type: "updatePath",
                        path: `${props.path}.${setIndex}.${rowIndex}.k`,
                        value: event.target.value,
                      })
                    }
                    className="h-7 bg-input font-mono text-xs"
                  />
                  <Input
                    value={row.v}
                    placeholder="value"
                    onChange={(event) =>
                      props.dispatch({
                        type: "updatePath",
                        path: `${props.path}.${setIndex}.${rowIndex}.v`,
                        value: event.target.value,
                      })
                    }
                    className="h-7 bg-input font-mono text-xs"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Remove ${props.title} row ${rowIndex + 1}`}
                    disabled={set.length <= 1}
                    onClick={() =>
                      props.dispatch({
                        type: "removeSample",
                        path: `${props.path}.${setIndex}`,
                        index: rowIndex,
                      })
                    }
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
              <button
                type="button"
                className="self-start font-mono text-[11px] text-muted-foreground hover:text-primary"
                onClick={() =>
                  props.dispatch({
                    type: "pushSample",
                    path: `${props.path}.${setIndex}`,
                  })
                }
              >
                + {props.addRowLabel}
              </button>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={`Remove ${props.title} set ${setIndex + 1}`}
              disabled={props.sets.length <= 1}
              onClick={() =>
                props.dispatch({
                  type: "removeSample",
                  path: props.path,
                  index: setIndex,
                })
              }
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}
        <button
          type="button"
          className="inline-flex items-center gap-1 self-start font-mono text-[11px] text-muted-foreground hover:text-primary"
          onClick={() => props.dispatch({ type: "pushSample", path: props.path })}
        >
          <Plus className="h-3 w-3" />
          {props.addSetLabel}
        </button>
      </div>
    </section>
  );
}

function SampleHeader({ title, count }: { title: string; count: number }) {
  return (
    <div className="flex items-center gap-2 px-3 py-2">
      <h4 className="text-xs font-semibold text-foreground">{title}</h4>
      <span className="ml-auto rounded-full border border-border bg-panel-raised px-2 py-px font-mono text-[10px] text-muted-foreground">
        {count} sample{count === 1 ? "" : "s"}
      </span>
    </div>
  );
}
