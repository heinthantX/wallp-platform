"use client";

import * as React from "react";
import { useEngines } from "@/lib/api/hooks/useEngines";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/states";
import { EVENT_ICONS } from "@/components/fields/EventIconSelect";
import { Cpu, Sparkles, HelpCircle } from "lucide-react";

export default function EnginesPage() {
  const { data, isLoading, isError, error, refetch } = useEngines();

  return (
    <div className="space-y-8 p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Engines &amp; Event Icons</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Scene engines supported by client apps, their parameters, and the event countdown icon allowlist.
        </p>
      </div>

      {isLoading && (
        <div className="space-y-6">
          <div className="rounded-xl border p-4 space-y-3">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
          <div className="rounded-xl border p-4 space-y-3">
            <Skeleton className="h-6 w-48" />
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          </div>
        </div>
      )}

      {isError && (
        <ErrorState
          title="Failed to load engines"
          description={error instanceof Error ? error.message : "Network error"}
          onRetry={() => refetch()}
        />
      )}

      {!isLoading && !isError && data && (
        <>
          {/* Section 1: Scene Engines */}
          <div className="rounded-xl border bg-card text-card-foreground shadow-xs">
            <div className="p-4 border-b flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Cpu className="h-5 w-5 text-primary" />
                <h2 className="text-base font-semibold">Supported Scene Engines</h2>
              </div>
              <Badge variant="secondary">
                {data.engines?.length || 0} engines
              </Badge>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[180px]">Engine ID</TableHead>
                  <TableHead className="w-[140px]">Since App Version</TableHead>
                  <TableHead>Configurable Parameters</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.engines && data.engines.length > 0 ? (
                  data.engines.map((engine) => (
                    <TableRow key={engine.id}>
                      <TableCell className="font-mono font-medium text-sm">
                        {engine.id}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="font-mono text-xs">
                          v{engine.sinceApp}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {engine.params && engine.params.length > 0 ? (
                          <div className="flex flex-wrap gap-1.5">
                            {engine.params.map((param) => (
                              <code
                                key={param}
                                className="px-2 py-0.5 rounded bg-muted text-xs font-mono text-foreground"
                              >
                                {param}
                              </code>
                            ))}
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground italic">
                            None (fixed scene)
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center py-6 text-muted-foreground text-sm">
                      No engines found in the catalogue.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          {/* Section 2: Event Icons Allowlist */}
          <div className="rounded-xl border bg-card text-card-foreground shadow-xs">
            <div className="p-4 border-b flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" />
                <h2 className="text-base font-semibold">Event Icon Allowlist</h2>
              </div>
              <span className="text-xs text-muted-foreground">
                theme-api.md § 7.3
              </span>
            </div>
            <div className="p-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {(data.eventIcons || EVENT_ICONS.map((i) => i.id)).map((iconId) => {
                  const match = EVENT_ICONS.find((i) => i.id === iconId);
                  const IconComp = match?.icon || HelpCircle;
                  return (
                    <div
                      key={iconId}
                      className="flex items-center gap-3 p-3 rounded-lg border bg-background/50 hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                        <IconComp className="h-5 w-5" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-medium truncate">
                          {match?.name || iconId}
                        </p>
                        <p className="text-[11px] font-mono text-muted-foreground truncate">
                          {iconId}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
