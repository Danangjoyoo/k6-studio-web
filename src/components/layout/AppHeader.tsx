import { cn } from "@/lib/utils";
import NamespaceSelector from "@/components/layout/NamespaceSelector";

interface AppHeaderProps {
  namespace: string;
  onNamespaceChange: (namespace: string) => void;
  activeRunners?: number;
  runningScript?: string | null;
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
  runningScript = null,
}: AppHeaderProps) {
  const isRunning = activeRunners > 0;

  return (
    <header className="load-lab-grid flex h-11 shrink-0 items-center gap-3 border-b border-border bg-panel px-4">
      <div className="flex items-center gap-2">
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

      <div className="ml-auto flex items-center gap-3">
        <NamespaceSelector
          namespace={namespace}
          onNamespaceChange={onNamespaceChange}
        />

        {/* Active runner counter — always visible so users understand capacity */}
        <div
          data-testid="active-runner-status"
          className={cn(
            "flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[10px] font-medium uppercase tracking-wider transition-colors duration-200",
            isRunning
              ? "border-run/30 bg-run/10 text-run"
              : "border-border bg-panel-raised text-muted-foreground"
          )}
        >
          {isRunning && (
            <span className="h-1.5 w-1.5 rounded-full bg-run animate-pulse motion-reduce:animate-none" />
          )}
          <span>
            Active runner: {activeRunners}/1
          </span>
        </div>

        {isRunning && runningScript && (
          <span
            title={runningScript}
            className="max-w-[min(52vw,720px)] truncate rounded border border-border bg-panel-raised px-2 py-0.5 font-mono text-[10px] text-muted-foreground"
          >
            {runningScript}
          </span>
        )}
      </div>
    </header>
  );
}
