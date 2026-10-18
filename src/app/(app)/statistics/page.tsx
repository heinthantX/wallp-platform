"use client";

import * as React from "react";
import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowUpDown, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ErrorState } from "@/components/states";
import { useDailyStats, useThemeStats } from "@/lib/api/hooks/useStats";
import type { ThemeStat } from "@/lib/api/types";
import { downloadCsv, statsToCsv } from "./csv";

const PRESETS = [7, 30, 90] as const;
const day = (d: Date) => d.toISOString().slice(0, 10);

function rangeFor(days: number) {
  const to = new Date();
  const from = new Date(to.getTime() - (days - 1) * 86400000);
  return { from: day(from), to: day(to) };
}

type SortKey = "themeId" | "applies" | "favourites" | "popularity";

function StatisticsContent() {
  const router = useRouter();
  const sp = useSearchParams();
  const days = PRESETS.find((p) => String(p) === sp.get("range")) ?? 30;
  const range = React.useMemo(() => rangeFor(days), [days]);
  const themes = useThemeStats(range);
  const daily = useDailyStats(range);
  const [sort, setSort] = React.useState<{ key: SortKey; dir: 1 | -1 }>({ key: "applies", dir: -1 });

  const rows = React.useMemo(() => {
    const items: ThemeStat[] = [...(themes.data ?? [])];
    return items.sort((a, b) =>
      sort.key === "themeId" ? sort.dir * a.themeId.localeCompare(b.themeId) : sort.dir * (a[sort.key] - b[sort.key])
    );
  }, [themes.data, sort]);

  const bars = daily.data ?? [];
  const max = Math.max(1, ...bars.map((b) => b.applies));
  const th = (key: SortKey, label: string) => (
    <TableHead>
      <button className="inline-flex items-center gap-1" onClick={() => setSort((s) => ({ key, dir: s.key === key ? (-s.dir as 1 | -1) : -1 }))}>
        {label}<ArrowUpDown className="h-3 w-3" />
      </button>
    </TableHead>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-bold tracking-tight">Statistics</h1>
        <div className="flex items-center gap-2">
          {PRESETS.map((p) => (
            <Button
              key={p}
              size="sm"
              variant={p === days ? "default" : "outline"}
              onClick={() => router.replace(`/statistics?range=${p}`)}
            >
              {p}d
            </Button>
          ))}
          <Button
            size="sm"
            variant="outline"
            disabled={rows.length === 0}
            onClick={() => downloadCsv(`theme-stats-${range.from}_${range.to}.csv`, statsToCsv(rows))}
          >
            <Download className="h-3.5 w-3.5 mr-1" />Export CSV
          </Button>
        </div>
      </div>

      {daily.isLoading ? (
        <Skeleton className="h-32 w-full" />
      ) : (
        <svg viewBox={`0 0 ${Math.max(bars.length, 1) * 10} 100`} className="w-full h-32 text-primary" role="img" aria-label="Daily applies">
          {bars.map((b, i) => {
            const h = (b.applies / max) * 96;
            return (
              <rect key={b.day} x={i * 10 + 1} y={100 - h} width={8} height={h} fill="currentColor">
                <title>{`${b.day}: ${b.applies} applies, ${b.favourites} favourites`}</title>
              </rect>
            );
          })}
        </svg>
      )}

      {themes.isLoading ? (
        <Skeleton className="h-48 w-full" />
      ) : themes.isError ? (
        <ErrorState title="Failed to load statistics" onRetry={() => themes.refetch()} />
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No events yet — the app sends them in batches.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              {th("themeId", "Theme")}{th("applies", "Applies")}{th("favourites", "Favourites")}{th("popularity", "Popularity")}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.themeId}>
                <TableCell className="font-mono">{r.themeId}</TableCell>
                <TableCell>{r.applies}</TableCell>
                <TableCell>{r.favourites}</TableCell>
                <TableCell>{r.popularity.toFixed(2)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

export default function StatisticsPage() {
  return (
    <Suspense fallback={<Skeleton className="h-64 w-full" />}>
      <StatisticsContent />
    </Suspense>
  );
}
