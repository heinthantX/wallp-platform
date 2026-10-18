"use client";

import * as React from "react";
import Link from "next/link";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState, EmptyState } from "@/components/states";
import { useOverview } from "@/lib/api/hooks/useOverview";
import { useReleases, useRollbackRelease } from "@/lib/api/hooks/useReleases";
import { useAuthStore } from "@/lib/auth/store";
import { can } from "@/lib/auth/can";

const editorPath: Record<string, string> = {
  theme: "themes",
  wallpaper: "wallpapers",
  font: "fonts",
  banner: "banners",
  festival: "festivals",
  "icon-pack": "icon-packs",
};

export function countdown(name: string, nights: number, themes: number) {
  const when = nights === 0 ? "tonight" : `in ${nights} night${nights === 1 ? "" : "s"}`;
  return `${name} ${when} · ${themes} theme${themes === 1 ? "" : "s"}`;
}

function LastRelease({ version, publishedAt }: { version: string; publishedAt: string }) {
  const user = useAuthStore((s) => s.user);
  const { data } = useReleases({ perPage: 50 });
  const rollback = useRollbackRelease();
  const previous = data?.items?.find((r) => !r.current);
  return (
    <div className="space-y-2 text-sm">
      <div className="font-mono">{version}</div>
      <div className="text-xs text-muted-foreground">{new Date(publishedAt).toLocaleString()}</div>
      {can(user, "releases:rollback") && previous && (
        <Button
          size="sm"
          variant="outline"
          disabled={rollback.isPending}
          onClick={() => {
            if (!window.confirm(`Roll back to ${previous.version}?`)) return;
            rollback.mutate(previous.version, {
              onSuccess: () => toast.success(`Rolled back to ${previous.version}`),
              onError: (e) => toast.error(e instanceof Error ? e.message : "Rollback failed"),
            });
          }}
        >
          <RotateCcw className="h-3.5 w-3.5 mr-1" />Roll back to {previous.version}
        </Button>
      )}
    </div>
  );
}

export function OverviewCards() {
  const { data, isLoading, isError, refetch } = useOverview();

  if (isLoading)
    return (
      <div className="grid gap-4 md:grid-cols-2" aria-label="Loading overview">
        {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-40 w-full" />)}
      </div>
    );
  if (isError || !data) return <ErrorState title="Failed to load overview" onRetry={() => refetch()} />;

  const festivals = data.nextFestivals ?? [];
  const queue = data.reviewQueue ?? [];
  const top = data.topThemesWeek ?? [];

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <CardHeader><CardTitle className="text-base">Next festivals</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {festivals.length === 0 && <EmptyState title="No upcoming festivals" description="" />}
          {festivals.map((f) => (
            <div key={f.id} className="flex items-center justify-between gap-2 text-sm">
              <Link href={`/festivals/edit?id=${encodeURIComponent(f.id)}`} className="hover:underline">
                {countdown(f.name, f.nightsUntil, f.publishedThemes)}
              </Link>
              {f.warning && (
                <Badge variant="outline" className="border-amber-500 text-amber-600 gap-1" title={f.warning}>
                  <AlertTriangle className="h-3 w-3" />{f.warning}
                </Badge>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Review queue</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {queue.length === 0 && <p className="text-sm text-muted-foreground">Nothing waiting for review.</p>}
          {queue.map((q) => (
            <div key={`${q.type}:${q.id}`} className="flex items-center justify-between text-sm">
              <Link
                href={`/${editorPath[q.type] ?? `${q.type}s`}/edit?id=${encodeURIComponent(q.id)}`}
                className="hover:underline"
              >
                {q.name}
              </Link>
              <span className="text-xs text-muted-foreground">{q.type} · {new Date(q.updatedAt).toLocaleDateString()}</span>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Last release</CardTitle></CardHeader>
        <CardContent>
          {data.lastRelease?.version ? (
            <LastRelease version={data.lastRelease.version} publishedAt={data.lastRelease.publishedAt} />
          ) : (
            <p className="text-sm text-muted-foreground">No release published yet.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Top themes this week</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {top.length === 0 && <p className="text-sm text-muted-foreground">No events yet — the app sends them in batches.</p>}
          {top.map((t) => (
            <div key={t.themeId} className="flex items-center justify-between text-sm">
              <Link href={`/themes/edit?id=${encodeURIComponent(t.themeId)}`} className="hover:underline">{t.name}</Link>
              <span className="text-xs text-muted-foreground">{t.applies} applies · {t.favourites} favs</span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
