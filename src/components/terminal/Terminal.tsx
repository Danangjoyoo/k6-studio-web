"use client";

import { useEffect, useRef } from "react";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import StatusPill from "@/components/layout/StatusPill";
import { createReadOnlyTerminalOptions } from "@/lib/terminal-options";
import { getLinesToAppend, shouldResetTerminal } from "@/lib/terminal-writer";

export interface TerminalProps {
  lines: string[];
  isRunning: boolean;
  resetKey?: string;
}

export default function Terminal({
  lines,
  isRunning,
  resetKey,
}: TerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const writtenCountRef = useRef(0);
  const prevResetKeyRef = useRef<string | undefined>(resetKey);
  const userScrolledUpRef = useRef(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const term = new XTerm(createReadOnlyTerminalOptions());
    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(container);
    fitAddon.fit();

    termRef.current = term;
    fitAddonRef.current = fitAddon;

    // Track whether the user has manually scrolled up so we don't override it
    term.onScroll(() => {
      const buf = term.buffer.active;
      userScrolledUpRef.current = buf.viewportY < buf.baseY;
    });

    const resizeObserver = new ResizeObserver(() => {
      fitAddon.fit();
    });
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      term.dispose();
      termRef.current = null;
      fitAddonRef.current = null;
      writtenCountRef.current = 0;
      prevResetKeyRef.current = undefined;
      userScrolledUpRef.current = false;
    };
  }, []);

  useEffect(() => {
    const term = termRef.current;
    if (!term) return;

    const prevCount = writtenCountRef.current;
    const prevKey = prevResetKeyRef.current;

    if (
      shouldResetTerminal({
        prevCount,
        nextCount: lines.length,
        prevKey,
        nextKey: resetKey,
      })
    ) {
      term.clear();
      writtenCountRef.current = 0;
      userScrolledUpRef.current = false;
    }

    const toAppend = getLinesToAppend(lines, writtenCountRef.current);
    for (const line of toAppend) {
      term.writeln(line);
    }
    writtenCountRef.current = lines.length;

    if (toAppend.length > 0 && !userScrolledUpRef.current) {
      term.scrollToBottom();
    }

    prevResetKeyRef.current = resetKey;
  }, [lines, resetKey]);

  return (
    <div className="flex h-full min-h-0 flex-col bg-terminal">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border bg-panel px-3 py-1.5">
        <span className="font-mono text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
          Output
        </span>
        {isRunning ? (
          <StatusPill variant="running" />
        ) : (
          <StatusPill variant="idle" />
        )}
      </div>
      <div className="relative min-h-0 flex-1 overflow-hidden p-1">
        {lines.length === 0 && !isRunning && (
          <p className="pointer-events-none absolute inset-0 flex items-center justify-center p-3 text-xs text-muted-foreground">
            Run a test to see output here.
          </p>
        )}
        <div
          ref={containerRef}
          data-testid="terminal-xterm"
          className="h-full w-full"
        />
      </div>
    </div>
  );
}
