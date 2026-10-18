"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useWallpapers, useFestivals, assetSrc } from "@/lib/api/hooks";
import type { ItemView, ListWallpapersQuery } from "@/lib/api/types";
import type { Wallpaper } from "@/lib/catalog/types";
import { StatusBadge } from "@/components/items";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState, EmptyState } from "@/components/states";
import { useAuthStore } from "@/lib/auth/store";
import { can } from "@/lib/auth/can";
import { Image as ImageIcon, Plus } from "lucide-react";
import { BlurImage } from "./_components/BlurImage";
import { UploadZone } from "./_components/UploadZone";

function parseData(item: ItemView): Partial<Wallpaper> {
  if (typeof item.data === "string") {
    try {
      return JSON.parse(item.data);
    } catch {
      return {};
    }
  }
  return (item.data || {}) as Partial<Wallpaper>;
}

function WallpaperCard({ item }: { item: ItemView }) {
  const w = parseData(item);
  const sizes = w.image?.sizes ?? [];
  const best = sizes[0];
  return (
    <Link
      href={`/wallpapers/edit?id=${encodeURIComponent(item.id)}`}
      className="group flex flex-col overflow-hidden rounded-2xl border bg-card shadow-xs transition-all hover:border-primary/50 hover:shadow-md"
    >
      <div className="relative aspect-[9/16] w-full">
        {best ? (
          <BlurImage
            src={assetSrc(best.asset.url)}
            dominant={w.image?.dominant}
            alt={w.name?.en || item.id}
            className="h-full w-full"
          />
        ) : (
          <div className="flex h-full items-center justify-center bg-gradient-to-b from-[#1b1035] to-[#05020d] text-xs text-white/60">
            {w.kind === "scene" ? "Scene" : "No image"}
          </div>
        )}
        <div className="absolute left-2 top-2">
          <StatusBadge status={item.status} />
        </div>
      </div>
      <div className="space-y-1.5 p-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="truncate text-sm font-semibold">{w.name?.en || item.id}</h3>
          <Badge variant="secondary" className="text-[10px] capitalize">
            {w.kind ?? "image"}
          </Badge>
        </div>
        <p className="truncate font-mono text-[11px] text-muted-foreground">
          {item.festivalId || "Any time"}
          {sizes.length > 0 && ` · ${sizes.map((s) => s.width).join("/")}w`}
        </p>
      </div>
    </Link>
  );
}

function WallpapersView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const user = useAuthStore((s) => s.user);
  const festival = searchParams.get("festival") || "";
  const status = searchParams.get("status") || "";
  const kind = searchParams.get("kind") || "";

  const updateFilters = (params: Record<string, string>) => {
    const sp = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(params)) {
      if (!v || v === "all") sp.delete(k);
      else sp.set(k, v);
    }
    router.replace(`/wallpapers?${sp.toString()}`);
  };

  const { data, isLoading, isError, error, refetch } = useWallpapers({
    festival: festival || undefined,
    status: (status as ListWallpapersQuery["status"]) || undefined,
    kind: (kind as ListWallpapersQuery["kind"]) || undefined,
    sort: "-updatedAt",
    perPage: 100,
  });
  const { data: festivals } = useFestivals({ perPage: 100 });
  const items = data?.items || [];

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Wallpapers</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Still image and scene wallpapers attached to themes and festivals.
          </p>
        </div>
        {can(user, "items:save_draft") && (
          <Button asChild className="gap-2">
            <Link href="/wallpapers/new">
              <Plus className="h-4 w-4" />
              <span>New Scene / Image</span>
            </Link>
          </Button>
        )}
      </div>

      <UploadZone canUpload={can(user, "items:save_draft")} />

      <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-card p-3.5">
        <Select value={festival || "all"} onValueChange={(v) => updateFilters({ festival: v })}>
          <SelectTrigger className="h-9 w-[140px] text-xs" aria-label="Festival filter">
            <SelectValue placeholder="Festival" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Festivals</SelectItem>
            {festivals?.items?.map((f) => (
              <SelectItem key={f.id} value={f.id}>
                {f.id}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={status || "all"} onValueChange={(v) => updateFilters({ status: v })}>
          <SelectTrigger className="h-9 w-[130px] text-xs" aria-label="Status filter">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="in_review">In Review</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="scheduled">Scheduled</SelectItem>
            <SelectItem value="published">Published</SelectItem>
            <SelectItem value="archived">Archived</SelectItem>
          </SelectContent>
        </Select>
        <Select value={kind || "all"} onValueChange={(v) => updateFilters({ kind: v })}>
          <SelectTrigger className="h-9 w-[110px] text-xs" aria-label="Kind filter">
            <SelectValue placeholder="Kind" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Kinds</SelectItem>
            <SelectItem value="image">Image</SelectItem>
            <SelectItem value="scene">Scene</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {Array.from({ length: 12 }).map((_, i) => (
            <Skeleton key={i} className="aspect-[9/16] w-full rounded-2xl" />
          ))}
        </div>
      )}
      {isError && (
        <ErrorState
          title="Failed to load wallpapers"
          description={error instanceof Error ? error.message : "Network error"}
          onRetry={() => refetch()}
        />
      )}
      {!isLoading && !isError && items.length === 0 && (
        <EmptyState
          title="No wallpapers match your filters"
          description="Upload an image above or create a scene wallpaper."
          icon={ImageIcon}
        />
      )}
      {!isLoading && !isError && items.length > 0 && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {items.map((item) => (
            <WallpaperCard key={item.id} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function WallpapersPage() {
  return (
    <React.Suspense
      fallback={
        <div className="mx-auto max-w-7xl space-y-6 p-6">
          <Skeleton className="h-10 w-48" />
          <Skeleton className="h-64 w-full" />
        </div>
      }
    >
      <WallpapersView />
    </React.Suspense>
  );
}
