"use client";

import { GripVertical, GripHorizontal } from "lucide-react";
import {
  Panel,
  PanelGroup,
  PanelResizeHandle,
} from "react-resizable-panels";
import { cn } from "@/lib/utils";

function ResizablePanelGroup({
  className,
  ...props
}: React.ComponentProps<typeof PanelGroup>) {
  return (
    <PanelGroup
      className={cn(
        "flex h-full w-full data-[panel-group-direction=vertical]:flex-col",
        className
      )}
      {...props}
    />
  );
}

function ResizablePanel({ ...props }: React.ComponentProps<typeof Panel>) {
  return <Panel {...props} />;
}

function ResizableHandle({
  withHandle = false,
  className,
  direction = "horizontal",
  ...props
}: React.ComponentProps<typeof PanelResizeHandle> & {
  withHandle?: boolean;
  direction?: "horizontal" | "vertical";
}) {
  return (
    <PanelResizeHandle
      className={cn(
        "relative flex shrink-0 items-center justify-center",
        "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
        direction === "horizontal"
          ? "w-px cursor-col-resize bg-border hover:bg-primary/40 active:bg-primary/60"
          : "h-px cursor-row-resize bg-border hover:bg-primary/40 active:bg-primary/60",
        "transition-colors duration-100",
        className
      )}
      data-testid="resize-handle"
      {...props}
    >
      {withHandle && (
        <div className="z-10 flex h-4 w-3 items-center justify-center rounded-sm border border-border bg-panel">
          {direction === "horizontal" ? (
            <GripVertical className="h-2.5 w-2.5 text-muted-foreground" />
          ) : (
            <GripHorizontal className="h-2.5 w-2.5 text-muted-foreground" />
          )}
        </div>
      )}
    </PanelResizeHandle>
  );
}

export { ResizablePanelGroup, ResizablePanel, ResizableHandle };
