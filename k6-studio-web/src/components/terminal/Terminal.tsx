"use client";

import { useEffect, useRef } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";

export interface TerminalProps {
  lines: string[];
  isRunning: boolean;
}

export default function Terminal({ lines, isRunning }: TerminalProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [lines]);

  return (
    <div className="flex flex-col h-full bg-black font-mono text-xs">
      <div className="flex items-center gap-2 px-3 py-1 border-b border-slate-700 bg-slate-900">
        <span className="text-slate-400 text-xs">Terminal</span>
        {isRunning && (
          <span className="text-green-400 animate-pulse text-xs">
            ● running
          </span>
        )}
      </div>
      <ScrollArea className="flex-1">
        <div className="p-3 space-y-0.5">
          {lines.map((line, i) => (
            <div
              key={i}
              className="text-green-300 whitespace-pre-wrap leading-5"
            >
              {line}
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
      </ScrollArea>
    </div>
  );
}
