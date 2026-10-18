"use client";

import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { X, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

export interface KeywordChipsProps {
  matched: string[];
  onRemove?: (keyword: string, index: number) => void;
  className?: string;
  emptyText?: string;
}

export function KeywordChips({
  matched,
  onRemove,
  className,
  emptyText,
}: KeywordChipsProps) {
  if (!matched || matched.length === 0) {
    if (!emptyText) return null;
    return (
      <div className={cn("text-xs text-muted-foreground italic", className)}>
        {emptyText}
      </div>
    );
  }

  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      <div className="flex items-center gap-1 text-xs text-muted-foreground mr-1">
        <Sparkles className="h-3 w-3 text-amber-500" />
        <span className="font-medium">Matched keywords:</span>
      </div>

      {matched.map((kw, index) => (
        <Badge
          key={`${kw}-${index}`}
          variant="secondary"
          className="h-6 px-2 py-0 text-xs font-normal inline-flex items-center gap-1 bg-secondary/70 hover:bg-secondary transition-colors"
        >
          <span>{kw}</span>
          {onRemove && (
            <button
              type="button"
              onClick={() => onRemove(kw, index)}
              className="rounded-full p-0.5 text-muted-foreground hover:text-foreground hover:bg-black/10 dark:hover:bg-white/10 transition-colors focus:outline-hidden"
              aria-label={`Remove keyword ${kw}`}
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </Badge>
      ))}
    </div>
  );
}
