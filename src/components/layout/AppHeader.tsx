import { useState } from "react";
import { cn } from "@/lib/utils";
import NamespaceSelector from "@/components/layout/NamespaceSelector";
import type { ActiveRun } from "@/lib/run-lock";

interface AppHeaderProps {
  namespace: string;
  onNamespaceChange: (namespace: string) => void;
  activeRunners?: number;
  runnerCapacity?: number;
  activeRuns?: ActiveRun[];
  onActiveRunSelect?: (run: ActiveRun) => void;
}

/** Inline k6 wordmark path — matches the official k6 logomark style. */
function K6Logo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden
    >
      {/* purple background circle */}
      <rect width="40" height="40" rx="8" fill="#7B61FF" />
      {/* stylised "k6" glyph */}
      <text
        x="50%"
        y="55%"
        dominantBaseline="middle"
        textAnchor="middle"
        fill="white"
        fontFamily="system-ui, sans-serif"
        fontSize="18"
        fontWeight="800"
      >
        k6
      </text>
    </svg>
  );
}

export default function AppHeader({
  namespace,
  onNamespaceChange,
  activeRunners = 0,
  runnerCapacity = 1,
  activeRuns = [],
  onActiveRunSelect,
}: AppHeaderProps) {
  const isRunning = activeRunners > 0;
  const [runnerListOpen, setRunnerListOpen] = useState(false);

  return (
    <header className="load-lab-grid flex h-11 shrink-0 items-center gap-3 border-b border-border bg-panel px-4">
      <div
        data-testid="app-header-left"
        className="flex min-w-0 items-center gap-3"
      >
        <div className="flex shrink-0 items-center gap-2">
          <K6Logo className="h-7 w-7" />
          <div className="leading-tight">
            <p className="text-sm font-semibold tracking-tight text-foreground">
              k6 Studio
            </p>
            <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
              Load lab
            </p>
          </div>
        </div>

        <div className="h-6 w-px bg-border" aria-hidden />
        <NamespaceSelector
          namespace={namespace}
          onNamespaceChange={onNamespaceChange}
        />
      </div>

      <div className="relative ml-auto flex min-w-0 items-center gap-3">
        {/* Active runner counter — always visible so users understand capacity */}
        <button
          type="button"
          data-testid="active-runner-status"
          className={cn(
            "flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[10px] font-medium uppercase tracking-wider transition-colors duration-200 hover:border-run/70 hover:bg-run/15 hover:text-run focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-run/40",
            isRunning
              ? "border-run/30 bg-run/10 text-run"
              : "border-border bg-panel-raised text-muted-foreground"
          )}
          onClick={() => setRunnerListOpen((open) => !open)}
        >
          {isRunning && (
            <span className="h-1.5 w-1.5 rounded-full bg-run animate-pulse motion-reduce:animate-none" />
          )}
          <span>
            Active runner: {activeRunners}/{runnerCapacity}
          </span>
        </button>

        {runnerListOpen && (
          <div className="absolute right-0 top-8 z-50 min-w-72 rounded-md border border-border bg-popover p-2 shadow-lg">
            <p className="px-1 pb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Active scripts
            </p>
            {activeRuns.length === 0 ? (
              <p className="px-1 py-1 font-mono text-xs text-muted-foreground">
                No active runners
              </p>
            ) : (
              <ul className="flex max-h-56 flex-col gap-1 overflow-auto">
                {activeRuns.map((run) => {
                  const label = `${run.namespace}/${run.script}`;
                  return (
                    <li key={run.id}>
                      <button
                        type="button"
                        title={label}
                        aria-label={`Open running script ${label}`}
                        onClick={() => {
                          onActiveRunSelect?.(run);
                          setRunnerListOpen(false);
                        }}
                        className="block w-full truncate rounded border border-border/70 bg-panel-raised px-2 py-1 text-left font-mono text-xs text-foreground transition-colors hover:border-run/60 hover:bg-run/10 hover:text-run focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-run/40"
                      >
                        {label}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}
      </div>
    </header>
  );
}
