"use client";

import * as React from "react";
import Link from "next/link";
import { Edit, Plus, Shapes } from "lucide-react";
import { useIconPacks } from "@/lib/api/hooks/useIconPacks";
import type { IconPack } from "@/lib/catalog/types";
import type { ItemView } from "@/lib/api/types";
import { useAuthStore } from "@/lib/auth/store";
import { can } from "@/lib/auth/can";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/items";
import { ErrorState, EmptyState } from "@/components/states";
import { IconPackPreview, type TileShape } from "./IconPackPreview";

function parse(item: ItemView): Partial<IconPack> {
  try {
    return typeof item.data === "string" ? JSON.parse(item.data) : ((item.data as unknown) as IconPack) ?? {};
  } catch {
    return {};
  }
}

export default function IconPacksPage() {
  const { data, isLoading, isError, error, refetch } = useIconPacks({ perPage: 100 });
  const user = useAuthStore((s) => s.user);
  const items = data?.items ?? [];
  return (
    <div className="space-y-6 p-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Icon packs</h1>
          <p className="text-sm text-muted-foreground mt-1">A tile picture and three colours; apps keep their own logos.</p>
        </div>
        {can(user, "items:save_draft") && (
          <Button asChild className="gap-2"><Link href="/icon-packs/new"><Plus className="h-4 w-4" />New icon pack</Link></Button>
        )}
      </div>
      {isLoading && <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-48 w-full" />)}</div>}
      {isError && <ErrorState title="Failed to load icon packs" description={error instanceof Error ? error.message : "Network error"} onRetry={() => refetch()} />}
      {!isLoading && !isError && items.length === 0 && <EmptyState title="No icon packs yet" description="Create a pack from a background tile." icon={Shapes} />}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => {
          const p = parse(item);
          return (
            <div key={item.id} className="rounded-xl border bg-card p-4 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-semibold">{p.name?.en || item.id}</div>
                  <div className="flex gap-1 mt-1">
                    <Badge variant="secondary" className="text-[10px]">{p.kind}</Badge>
                    {item.festivalId && <Badge variant="outline" className="text-[10px]">{item.festivalId}</Badge>}
                  </div>
                </div>
                <StatusBadge status={item.status} />
              </div>
              <IconPackPreview shape={(p.shape ?? "squircle") as TileShape} tile={p.tile} glyph={p.glyph} ring={p.ring} background={p.background} />
              <Button variant="ghost" size="sm" asChild className="h-8 px-2">
                <Link href={`/icon-packs/edit?id=${encodeURIComponent(item.id)}`}><Edit className="h-3.5 w-3.5 mr-1" />Edit</Link>
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
