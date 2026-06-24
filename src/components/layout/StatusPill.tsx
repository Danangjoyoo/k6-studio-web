import { cn } from "@/lib/utils";

export type StatusPillVariant =
  | "saved"
  | "saving"
  | "unsaved"
  | "running"
  | "idle";

const VARIANTS: Record<
  StatusPillVariant,
  { label: string; dot: string; text: string }
> = {
  saved: {
    label: "Saved",
    dot: "bg-ok",
    text: "text-ok",
  },
  saving: {
    label: "Saving…",
    dot: "bg-warn animate-pulse motion-reduce:animate-none",
    text: "text-warn",
  },
  unsaved: {
    label: "Unsaved",
    dot: "bg-warn",
    text: "text-warn",
  },
  running: {
    label: "Running",
    dot: "bg-run animate-pulse motion-reduce:animate-none",
    text: "text-run",
  },
  idle: {
    label: "Idle",
    dot: "bg-muted-foreground/50",
    text: "text-muted-foreground",
  },
};

interface StatusPillProps {
  variant: StatusPillVariant;
  className?: string;
}

export default function StatusPill({ variant, className }: StatusPillProps) {
  const config = VARIANTS[variant];

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-border bg-panel-raised px-2 py-0.5",
        className
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", config.dot)} />
      <span
        className={cn(
          "font-mono text-[10px] font-medium uppercase tracking-wider",
          config.text
        )}
      >
        {config.label}
      </span>
    </span>
  );
}
