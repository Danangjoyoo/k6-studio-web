import { Gauge } from "lucide-react";

interface AppHeaderProps {
  isRunning?: boolean;
}

export default function AppHeader({ isRunning = false }: AppHeaderProps) {
  return (
    <header className="load-lab-grid flex h-11 shrink-0 items-center gap-3 border-b border-border bg-panel px-4">
      <div className="flex items-center gap-2">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/15 ring-1 ring-primary/30">
          <Gauge className="h-4 w-4 text-primary" aria-hidden />
        </div>
        <div className="leading-tight">
          <p className="text-sm font-semibold tracking-tight text-foreground">
            k6 Studio
          </p>
          <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
            Load lab
          </p>
        </div>
      </div>
      {isRunning && (
        <div className="ml-auto flex items-center gap-2 rounded-full border border-run/30 bg-run/10 px-2.5 py-1">
          <span className="h-1.5 w-1.5 rounded-full bg-run motion-safe-pulse animate-pulse motion-reduce:animate-none" />
          <span className="font-mono text-[10px] font-medium uppercase tracking-wider text-run">
            Test running
          </span>
        </div>
      )}
    </header>
  );
}
