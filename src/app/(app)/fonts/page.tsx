"use client";

import * as React from "react";
import Link from "next/link";
import { Edit, Plus, Type } from "lucide-react";
import { useFonts } from "@/lib/api/hooks/useFonts";
import type { Font } from "@/lib/catalog/types";
import type { ItemView } from "@/lib/api/types";
import { useAuthStore } from "@/lib/auth/store";
import { can } from "@/lib/auth/can";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/items";
import { ErrorState, EmptyState } from "@/components/states";
import { FontPreview } from "./FontPreview";
import { GoogleFontDialog } from "./GoogleFontDialog";

function parse(item: ItemView): Partial<Font> {
  try {
    return typeof item.data === "string" ? JSON.parse(item.data) : ((item.data as unknown) as Font) ?? {};
  } catch {
    return {};
  }
}

export default function FontsPage() {
  const { data, isLoading, isError, error, refetch } = useFonts({ perPage: 100 });
  const user = useAuthStore((s) => s.user);
  const canEdit = can(user, "items:save_draft");
  const [gfOpen, setGfOpen] = React.useState(false);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setGfOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const items = data?.items ?? [];
  return (
    <div className="space-y-6 p-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Fonts</h1>
          <p className="text-sm text-muted-foreground mt-1">Google or uploaded TTF/OTF fonts with OFL-1.1 or Apache-2.0 licences.</p>
        </div>
        {canEdit && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setGfOpen(true)}>Add Google font</Button>
            <Button asChild className="gap-2">
              <Link href="/fonts/new"><Plus className="h-4 w-4" />Upload font</Link>
            </Button>
          </div>
        )}
      </div>

      {isLoading && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-40 w-full" />)}
        </div>
      )}
      {isError && <ErrorState title="Failed to load fonts" description={error instanceof Error ? error.message : "Network error"} onRetry={() => refetch()} />}
      {!isLoading && !isError && items.length === 0 && (
        <EmptyState title="No fonts yet" description="Add a Google font or upload your own." icon={Type} />
      )}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => {
          const f = parse(item);
          return (
            <div key={item.id} className="rounded-xl border bg-card p-4 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-semibold">{f.family || item.id}</div>
                  <div className="flex gap-1 mt-1">
                    <Badge variant="secondary" className="text-[10px] capitalize">{f.category}</Badge>
                    <Badge variant="outline" className="text-[10px]">{f.license}</Badge>
                  </div>
                </div>
                <StatusBadge status={item.status} />
              </div>
              <FontPreview family={f.family || item.id} file={f.files?.[0]} sampleText={f.sampleText} compact />
              <div className="flex justify-between items-center text-xs text-muted-foreground">
                <span>{(f.scripts ?? []).join(", ")}</span>
                <Button variant="ghost" size="sm" asChild className="h-8 px-2">
                  <Link href={`/fonts/edit?id=${encodeURIComponent(item.id)}`}><Edit className="h-3.5 w-3.5 mr-1" />Edit</Link>
                </Button>
              </div>
            </div>
          );
        })}
      </div>
      <GoogleFontDialog open={gfOpen} onOpenChange={setGfOpen} onImported={() => refetch()} />
    </div>
  );
}
