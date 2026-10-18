"use client";

import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type ItemStatus =
  | "draft"
  | "in_review"
  | "approved"
  | "scheduled"
  | "published"
  | "archived"
  | string;

export interface StatusBadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  status: ItemStatus;
  showDot?: boolean;
}

export function StatusBadge({
  status,
  showDot = true,
  className,
  ...props
}: StatusBadgeProps) {
  const normalized = (status || "draft").toLowerCase().replace(/\s+/g, "_");

  let label = "Draft";
  let variantClass = "bg-muted text-muted-foreground border-border";
  let dotClass = "bg-muted-foreground";

  switch (normalized) {
    case "draft":
      label = "Draft";
      variantClass = "bg-secondary text-secondary-foreground border-secondary";
      dotClass = "bg-muted-foreground";
      break;
    case "in_review":
      label = "In Review";
      variantClass = "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/20";
      dotClass = "bg-amber-500";
      break;
    case "approved":
      label = "Approved";
      variantClass = "bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/20";
      dotClass = "bg-blue-500";
      break;
    case "scheduled":
      label = "Scheduled";
      variantClass = "bg-purple-500/15 text-purple-700 dark:text-purple-400 border-purple-500/20";
      dotClass = "bg-purple-500";
      break;
    case "published":
      label = "Published";
      variantClass = "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/20";
      dotClass = "bg-emerald-500";
      break;
    case "archived":
      label = "Archived";
      variantClass = "bg-zinc-500/15 text-zinc-600 dark:text-zinc-400 border-zinc-500/20";
      dotClass = "bg-zinc-400";
      break;
    default:
      label = status;
      break;
  }

  return (
    <Badge
      variant="outline"
      className={cn("gap-1.5 font-medium text-xs select-none", variantClass, className)}
      {...props}
    >
      {showDot && (
        <span
          className={cn("h-1.5 w-1.5 rounded-full shrink-0", dotClass)}
          aria-hidden="true"
        />
      )}
      <span>{label}</span>
    </Badge>
  );
}
