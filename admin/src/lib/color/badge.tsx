"use client";

import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { contrastBadge } from "./index";
import { cn } from "@/lib/utils";

export interface ContrastBadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  ratio: number;
  min?: number;
  showDetails?: boolean;
}

export function ContrastBadge({
  ratio,
  min = 4.5,
  showDetails = false,
  className,
  ...props
}: ContrastBadgeProps) {
  const result = contrastBadge(ratio, min);

  return (
    <Badge
      variant={result.variant}
      className={cn("font-mono text-xs cursor-default select-none", className)}
      title={result.label}
      aria-label={result.label}
      {...props}
    >
      <span className="inline-block w-1.5 h-1.5 rounded-full mr-1.5 bg-current" />
      {result.formatted}
      {showDetails ? (
        <span className="ml-1 opacity-80">({result.pass ? "Pass" : "Fail"})</span>
      ) : (
        <span className="ml-1 opacity-80">{result.pass ? "✓" : "✗"}</span>
      )}
    </Badge>
  );
}
