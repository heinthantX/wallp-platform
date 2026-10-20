"use client";

import * as React from "react";
import Link from "next/link";
import { Edit, Plus, Tags } from "lucide-react";
import { useCategories } from "@/lib/api/hooks/useCategories";
import { useThemes, useWallpapers } from "@/lib/api/hooks";
import type { ItemView } from "@/lib/api/types";
import { useAuthStore } from "@/lib/auth/store";
import { can } from "@/lib/auth/can";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/items";
import { ErrorState, EmptyState } from "@/components/states";

function parse<T>(item: ItemView): Partial<T> {
  try {
    return (typeof item.data === "string" ? JSON.parse(item.data) : item.data) ?? {};
  } catch {
    return {};
  }
}

/** How many items list each category id in their categoryIds. */
function countBy(items: ItemView[] | null | undefined): Map<string, number> {
  const m = new Map<string, number>();
  for (const i of items ?? []) {
    for (const c of parse<{ categoryIds: string[] }>(i).categoryIds ?? []) m.set(c, (m.get(c) ?? 0) + 1);
  }
  return m;
}

const count = (n: number, noun: string) => `${n} ${noun}${n === 1 ? "" : "s"}`;

export default function CategoriesPage() {
  const { data, isLoading, isError, error, refetch } = useCategories({ perPage: 100 });
  const themes = useThemes({ perPage: 100 });
  const walls = useWallpapers({ perPage: 100 });
  const user = useAuthStore((s) => s.user);
  const canEdit = can(user, "items:save_draft");
  const items = data?.items ?? [];
  const themeCount = countBy(themes.data?.items);
  const wallCount = countBy(walls.data?.items);

  return (
    <div className="space-y-6 p-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Categories</h1>
          <p className="text-sm text-muted-foreground mt-1">Store categories. A theme or wallpaper can be in many.</p>
        </div>
        {canEdit && (
          <Button asChild className="gap-2">
            <Link href="/categories/new"><Plus className="h-4 w-4" />New category</Link>
          </Button>
        )}
      </div>
      {isLoading && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-24 w-full" />)}
        </div>
      )}
      {isError && <ErrorState title="Failed to load categories" description={error instanceof Error ? error.message : "Network error"} onRetry={() => refetch()} />}
      {!isLoading && !isError && items.length === 0 && (
        <EmptyState title="No categories yet" description="Create one, then tick it on themes and wallpapers." icon={Tags} />
      )}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => {
          const c = parse<{ name: { en?: string }; sort: number }>(item);
          return (
            <div key={item.id} className="rounded-xl border bg-card p-4 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-semibold">{c.name?.en || item.id}</div>
                  <div className="font-mono text-[11px] text-muted-foreground">{item.id}</div>
                </div>
                <StatusBadge status={item.status} />
              </div>
              <div className="flex justify-between items-center text-xs text-muted-foreground">
                <span>
                  {count(themeCount.get(item.id) ?? 0, "theme")} · {count(wallCount.get(item.id) ?? 0, "wallpaper")}
                </span>
                <Button variant="ghost" size="sm" asChild className="h-8 px-2">
                  <Link href={`/categories/edit?id=${encodeURIComponent(item.id)}`}><Edit className="h-3.5 w-3.5 mr-1" />Edit</Link>
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
