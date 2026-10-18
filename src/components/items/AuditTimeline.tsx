"use client";

import * as React from "react";
import { useAudit } from "@/lib/api/hooks/useAudit";
import { JsonDiffViewer } from "@/components/json-diff";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  History,
  User,
  ChevronDown,
  ChevronRight,
  Clock,
  FileCode,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { AuditView } from "@/lib/api/types";

export interface AuditTimelineProps {
  itemType: string;
  itemId: string;
  title?: string;
  className?: string;
}

export function AuditTimeline({
  itemType,
  itemId,
  title = "Audit History",
  className,
}: AuditTimelineProps) {
  const { data, isLoading, isError, error } = useAudit({
    itemType,
    itemId,
    perPage: 50,
  });

  const [expandedId, setExpandedId] = React.useState<number | null>(null);

  const toggleExpand = (id: number) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  const auditItems = data?.items || [];

  return (
    <div className={cn("rounded-xl border bg-card text-card-foreground p-4 space-y-4 shadow-xs", className)}>
      <div className="flex items-center justify-between border-b pb-3">
        <div className="flex items-center gap-2">
          <History className="h-4 w-4 text-muted-foreground" />
          <h3 className="font-semibold text-sm">{title}</h3>
        </div>
        {data && (
          <Badge variant="secondary" className="text-[11px] font-mono">
            {auditItems.length} records
          </Badge>
        )}
      </div>

      {isLoading && (
        <div className="space-y-3 py-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      )}

      {isError && (
        <div className="rounded-md border border-destructive/20 bg-destructive/10 p-3 text-xs text-destructive">
          Failed to load audit timeline: {error instanceof Error ? error.message : "Network error"}
        </div>
      )}

      {!isLoading && !isError && auditItems.length === 0 && (
        <div className="py-6 text-center text-xs text-muted-foreground">
          No audit entries recorded for this item yet.
        </div>
      )}

      {!isLoading && !isError && auditItems.length > 0 && (
        <div className="relative pl-6 space-y-6 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-muted-foreground/20">
          {auditItems.map((entry: AuditView) => {
            const isExpanded = expandedId === entry.id;
            const hasDiff = entry.before !== undefined || entry.after !== undefined;
            const formattedDate = new Date(entry.at).toLocaleString(undefined, {
              dateStyle: "short",
              timeStyle: "short",
            });

            return (
              <div key={entry.id} className="relative group">
                {/* Timeline dot */}
                <div className="absolute -left-6 top-1 h-3.5 w-3.5 rounded-full border-2 border-background bg-primary" />

                <div className="rounded-lg border bg-background/50 p-3 text-xs space-y-2 transition-colors hover:border-foreground/20">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className="font-mono text-[10px] uppercase">
                        {entry.action}
                      </Badge>
                      <span className="flex items-center gap-1 text-muted-foreground font-medium">
                        <User className="h-3 w-3" />
                        {entry.userName || entry.userId || "System"}
                      </span>
                    </div>

                    <div className="flex items-center gap-1 text-muted-foreground text-[11px]">
                      <Clock className="h-3 w-3" />
                      <span>{formattedDate}</span>
                    </div>
                  </div>

                  {hasDiff && (
                    <div className="pt-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => toggleExpand(entry.id)}
                        className="h-6 px-1.5 text-[11px] text-muted-foreground hover:text-foreground"
                      >
                        {isExpanded ? (
                          <ChevronDown className="h-3 w-3 mr-1" />
                        ) : (
                          <ChevronRight className="h-3 w-3 mr-1" />
                        )}
                        <FileCode className="h-3 w-3 mr-1" />
                        {isExpanded ? "Hide payload diff" : "View payload diff"}
                      </Button>

                      {isExpanded && (
                        <div className="mt-2 pt-2 border-t">
                          <JsonDiffViewer before={entry.before} after={entry.after} />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
