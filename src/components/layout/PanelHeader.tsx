import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface PanelHeaderProps {
  label: string;
  badge?: ReactNode;
  actions?: ReactNode;
  className?: string;
}

export default function PanelHeader({
  label,
  badge,
  actions,
  className,
}: PanelHeaderProps) {
  return (
    <div
      className={cn(
        "flex shrink-0 flex-wrap items-start justify-between gap-2 border-b border-border bg-panel px-3 py-2",
        className
      )}
    >
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <span className="font-mono text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
          {label}
        </span>
        {badge}
      </div>
      {actions && (
        <div className="flex min-w-0 flex-wrap items-center justify-end gap-1">
          {actions}
        </div>
      )}
    </div>
  );
}
