"use client";

import * as React from "react";
import Link from "next/link";
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Edit, GripVertical, Image as ImageIcon, Plus } from "lucide-react";
import { toast } from "sonner";
import { useBanners, useReorderBanners } from "@/lib/api/hooks/useBanners";
import type { Banner } from "@/lib/catalog/types";
import type { ItemView } from "@/lib/api/types";
import { useAuthStore } from "@/lib/auth/store";
import { can } from "@/lib/auth/can";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/items";
import { ErrorState, EmptyState } from "@/components/states";
import { BannerPreview } from "./BannerPreview";

function parse(item: ItemView): Banner {
  try {
    const b = typeof item.data === "string" ? JSON.parse(item.data) : item.data;
    return { ...(b as Banner), id: item.id };
  } catch {
    return { id: item.id } as Banner;
  }
}

function Row({ item, banner }: { item: ItemView; banner: Banner }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.6 : 1 }}
      className="flex items-center gap-3 rounded-lg border bg-card p-3"
    >
      <button type="button" {...attributes} {...listeners} aria-label="Drag to reorder" className="cursor-grab p-1.5 text-muted-foreground hover:text-foreground">
        <GripVertical className="h-4 w-4" />
      </button>
      <div className="h-10 w-16 rounded-md shrink-0" style={{ background: banner.look?.background }} />
      <div className="min-w-0 flex-1">
        <div className="font-medium truncate">{banner.title?.en || item.id}</div>
        <div className="text-xs text-muted-foreground font-mono">{item.id}</div>
      </div>
      <StatusBadge status={item.status} />
      <Button variant="ghost" size="sm" asChild className="h-8 px-2">
        <Link href={`/banners/edit?id=${encodeURIComponent(item.id)}`}><Edit className="h-3.5 w-3.5 mr-1" />Edit</Link>
      </Button>
    </div>
  );
}

export default function BannersPage() {
  const { data, isLoading, isError, error, refetch } = useBanners({ perPage: 100 });
  const reorder = useReorderBanners();
  const user = useAuthStore((s) => s.user);
  const [items, setItems] = React.useState<ItemView[]>([]);
  React.useEffect(() => {
    if (data?.items) setItems(data.items);
  }, [data?.items]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const from = items.findIndex((i) => i.id === active.id);
    const to = items.findIndex((i) => i.id === over.id);
    if (from < 0 || to < 0) return;
    const next = arrayMove(items, from, to);
    setItems(next);
    reorder.mutate(next.map((i) => i.id), {
      onError: () => {
        toast.error("Failed to update banner order");
        refetch();
      },
      onSuccess: () => toast.success("Banner order updated"),
    });
  };

  const banners = React.useMemo(() => items.filter((i) => i.status !== "archived").map(parse), [items]);

  return (
    <div className="space-y-6 p-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Banners</h1>
          <p className="text-sm text-muted-foreground mt-1">The store home carousel. Drag to reorder.</p>
        </div>
        {can(user, "items:save_draft") && (
          <Button asChild className="gap-2"><Link href="/banners/new"><Plus className="h-4 w-4" />New banner</Link></Button>
        )}
      </div>
      {isLoading && <div className="space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-16 w-full" />)}</div>}
      {isError && <ErrorState title="Failed to load banners" description={error instanceof Error ? error.message : "Network error"} onRetry={() => refetch()} />}
      {!isLoading && !isError && items.length === 0 && <EmptyState title="No banners yet" description="Create a banner for the store home carousel." icon={ImageIcon} />}
      {items.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
              <div className="space-y-2">{items.map((item) => <Row key={item.id} item={item} banner={parse(item)} />)}</div>
            </SortableContext>
          </DndContext>
          <BannerPreview banners={banners} />
        </div>
      )}
    </div>
  );
}
