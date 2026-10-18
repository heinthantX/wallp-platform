import * as React from "react";
import { cn } from "@/lib/utils";

interface JsonDiffProps {
  before: unknown;
  after: unknown;
}

export function JsonDiffViewer({ before, after }: JsonDiffProps) {
  const beforeStr = before !== undefined && before !== null
    ? JSON.stringify(before, null, 2)
    : "";
  const afterStr = after !== undefined && after !== null
    ? JSON.stringify(after, null, 2)
    : "";

  const beforeLines = beforeStr ? beforeStr.split("\n") : [];
  const afterLines = afterStr ? afterStr.split("\n") : [];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs font-mono rounded-lg border bg-muted/20 p-3 overflow-hidden">
      {/* Before Panel */}
      <div className="overflow-x-auto rounded border bg-background/50">
        <div className="border-b px-3 py-1.5 font-semibold text-muted-foreground bg-muted/40 flex items-center justify-between">
          <span>Before</span>
          <span className="text-[10px] text-muted-foreground/70">
            {beforeLines.length} lines
          </span>
        </div>
        <div className="p-2 space-y-0.5 min-w-[280px]">
          {beforeLines.length === 0 ? (
            <p className="text-muted-foreground italic p-2 text-center text-xs">
              None (created)
            </p>
          ) : (
            beforeLines.map((line, idx) => {
              const matchingAfterLine = afterLines[idx];
              const isDifferent = line !== matchingAfterLine;

              return (
                <div
                  key={idx}
                  className={cn(
                    "flex items-start gap-2 px-1 py-0.5 rounded text-[11px]",
                    isDifferent
                      ? "bg-red-500/10 text-red-700 dark:text-red-400 font-medium"
                      : "text-foreground"
                  )}
                >
                  <span className="w-6 shrink-0 select-none text-right text-muted-foreground/40">
                    {idx + 1}
                  </span>
                  <span className="w-3 shrink-0 select-none text-red-500/60">
                    {isDifferent ? "-" : " "}
                  </span>
                  <pre className="overflow-x-auto whitespace-pre font-mono">
                    {line}
                  </pre>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* After Panel */}
      <div className="overflow-x-auto rounded border bg-background/50">
        <div className="border-b px-3 py-1.5 font-semibold text-muted-foreground bg-muted/40 flex items-center justify-between">
          <span>After</span>
          <span className="text-[10px] text-muted-foreground/70">
            {afterLines.length} lines
          </span>
        </div>
        <div className="p-2 space-y-0.5 min-w-[280px]">
          {afterLines.length === 0 ? (
            <p className="text-muted-foreground italic p-2 text-center text-xs">
              None (deleted)
            </p>
          ) : (
            afterLines.map((line, idx) => {
              const matchingBeforeLine = beforeLines[idx];
              const isDifferent = line !== matchingBeforeLine;

              return (
                <div
                  key={idx}
                  className={cn(
                    "flex items-start gap-2 px-1 py-0.5 rounded text-[11px]",
                    isDifferent
                      ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 font-medium"
                      : "text-foreground"
                  )}
                >
                  <span className="w-6 shrink-0 select-none text-right text-muted-foreground/40">
                    {idx + 1}
                  </span>
                  <span className="w-3 shrink-0 select-none text-emerald-500/60">
                    {isDifferent ? "+" : " "}
                  </span>
                  <pre className="overflow-x-auto whitespace-pre font-mono">
                    {line}
                  </pre>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
