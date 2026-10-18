"use client";

import * as React from "react";
import Link from "next/link";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  useFestivals,
  useReorderFestivals,
  useThemes,
} from "@/lib/api/hooks";
import type { ItemView } from "@/lib/api/types";
import type { Festival } from "@/lib/catalog/types";
import { getNextFestivalRun, formatYMD } from "@/lib/festival/countdown";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/items";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState, EmptyState } from "@/components/states";
import {
  Plus,
  GripVertical,
  Calendar,
  AlertTriangle,
  Sparkles,
  Edit,
  Clock,
} from "lucide-react";
import { toast } from "sonner";

function parseFestivalData(item: ItemView): Festival {
  if (typeof item.data === "string") {
    try {
      return JSON.parse(item.data);
    } catch {
      return {} as Festival;
    }
  }
  return (item.data || {}) as Festival;
}

interface SortableRowProps {
  item: ItemView;
  festival: Festival;
  publishedThemesCount: number;
  draftThemesCount: number;
}

function SortableFestivalRow({
  item,
  festival,
  publishedThemesCount,
  draftThemesCount,
}: SortableRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : undefined,
    opacity: isDragging ? 0.6 : 1,
  };

  const nextRun = React.useMemo(() => {
    return getNextFestivalRun(festival);
  }, [festival]);

  const todayStr = React.useMemo(() => formatYMD(new Date()), []);
  const futureDatesCount = React.useMemo(() => {
    return (festival.occurrences || []).filter((d) => d >= todayStr).length;
  }, [festival.occurrences, todayStr]);

  // Warning chip rule: festival within 30 days has < 3 published themes or < 2 future dates
  const isWithin30Days = nextRun !== null && (nextRun.isHappening || (nextRun.daysUntil >= 0 && nextRun.daysUntil <= 30));
  const hasLowThemes = isWithin30Days && publishedThemesCount < 3;
  const hasLowDates = isWithin30Days && futureDatesCount < 2;
  const showWarning = hasLowThemes || hasLowDates;

  return (
    <TableRow ref={setNodeRef} style={style} className="group hover:bg-muted/40 transition-colors">
      <TableCell className="w-10 text-center">
        <button
          type="button"
          {...attributes}
          {...listeners}
          aria-label="Drag to reorder"
          className="cursor-grab active:cursor-grabbing p-1.5 text-muted-foreground/60 hover:text-foreground rounded transition-colors"
        >
          <GripVertical className="h-4 w-4" />
        </button>
      </TableCell>

      <TableCell className="font-medium">
        <div className="flex flex-col">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-foreground text-sm">
              {festival.name?.en || item.id}
            </span>
            {festival.name?.my && (
              <span className="text-xs text-muted-foreground">
                ({festival.name.my})
              </span>
            )}
            {festival.comingSoon && (
              <Badge variant="secondary" className="text-[10px] uppercase font-mono px-1.5 py-0">
                Coming Soon
              </Badge>
            )}
          </div>
          <span className="text-xs font-mono text-muted-foreground/80">
            {item.id}
          </span>
        </div>
      </TableCell>

      <TableCell>
        <Badge
          variant={festival.kind === "collection" ? "outline" : "secondary"}
          className="text-xs capitalize"
        >
          {festival.kind || "festival"}
        </Badge>
      </TableCell>

      <TableCell>
        {nextRun ? (
          <div className="flex flex-col gap-0.5">
            <div className="flex items-center gap-1.5 text-xs font-medium text-foreground">
              <Calendar className="h-3.5 w-3.5 text-primary" />
              <span>{nextRun.startDate}</span>
            </div>
            <span className="text-[11px] text-muted-foreground flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {nextRun.isHappening
                ? `Active (Day ${nextRun.currentDay || 1})`
                : nextRun.daysUntil === 0
                ? "Today"
                : `in ${nextRun.daysUntil} ${nextRun.unit}${nextRun.daysUntil > 1 ? "s" : ""}`}
            </span>
          </div>
        ) : festival.comingSoon ? (
          <span className="text-xs text-muted-foreground italic">
            Not scheduled
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">
            Any time
          </span>
        )}
      </TableCell>

      <TableCell>
        <div className="flex items-center gap-2 text-xs">
          <Badge variant="default" className="text-xs px-2 py-0.5">
            {publishedThemesCount} published
          </Badge>
          {draftThemesCount > 0 && (
            <Badge variant="outline" className="text-xs px-2 py-0.5 text-muted-foreground">
              {draftThemesCount} drafts
            </Badge>
          )}
        </div>
      </TableCell>

      <TableCell>
        <StatusBadge status={item.status} />
      </TableCell>

      <TableCell>
        {showWarning && (
          <div className="flex flex-col gap-1">
            {hasLowThemes && (
              <Badge
                variant="destructive"
                className="text-[10px] gap-1 px-1.5 py-0.5 font-normal w-fit"
              >
                <AlertTriangle className="h-3 w-3" />
                &lt; 3 published themes ({publishedThemesCount})
              </Badge>
            )}
            {hasLowDates && (
              <Badge
                variant="destructive"
                className="text-[10px] gap-1 px-1.5 py-0.5 font-normal w-fit"
              >
                <AlertTriangle className="h-3 w-3" />
                &lt; 2 future dates ({futureDatesCount})
              </Badge>
            )}
          </div>
        )}
      </TableCell>

      <TableCell className="text-right">
        <Button variant="ghost" size="sm" asChild className="h-8 px-2 text-xs">
          <Link href={`/festivals/edit?id=${encodeURIComponent(item.id)}`}>
            <Edit className="h-3.5 w-3.5 mr-1" />
            Edit
          </Link>
        </Button>
      </TableCell>
    </TableRow>
  );
}

export default function FestivalsPage() {
  const { data: festivalsData, isLoading, isError, error, refetch } = useFestivals({ perPage: 100 });
  const { data: themesData } = useThemes({ perPage: 200 });
  const reorderMutation = useReorderFestivals();

  const [items, setItems] = React.useState<ItemView[]>([]);

  React.useEffect(() => {
    if (festivalsData?.items) {
      setItems(festivalsData.items);
    }
  }, [festivalsData?.items]);

  // Build counts mapping per festivalId
  const themeCounts = React.useMemo(() => {
    const map = new Map<string, { published: number; drafts: number }>();
    if (!themesData?.items) return map;

    for (const t of themesData.items) {
      if (!t.festivalId) continue;
      const cur = map.get(t.festivalId) || { published: 0, drafts: 0 };
      if (t.status === "published") {
        cur.published++;
      } else if (t.status !== "archived") {
        cur.drafts++;
      }
      map.set(t.festivalId, cur);
    }
    return map;
  }, [themesData?.items]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = items.findIndex((item) => item.id === active.id);
    const newIndex = items.findIndex((item) => item.id === over.id);

    if (oldIndex !== -1 && newIndex !== -1) {
      const nextItems = arrayMove(items, oldIndex, newIndex);
      setItems(nextItems);

      const nextIds = nextItems.map((i) => i.id);
      reorderMutation.mutate(nextIds, {
        onError: () => {
          toast.error("Failed to update festival order");
          refetch();
        },
        onSuccess: () => {
          toast.success("Festival order updated");
        },
      });
    }
  };

  return (
    <div className="space-y-6 p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Festivals &amp; Collections</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage festival calendar dates, store row order, countdown units, and festival looks.
          </p>
        </div>
        <Button asChild className="gap-2 shrink-0">
          <Link href="/festivals/edit">
            <Plus className="h-4 w-4" />
            <span>New Festival</span>
          </Link>
        </Button>
      </div>

      {isLoading && (
        <div className="rounded-xl border p-4 space-y-3">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      )}

      {isError && (
        <ErrorState
          title="Failed to load festivals"
          description={error instanceof Error ? error.message : "Network error"}
          onRetry={() => refetch()}
        />
      )}

      {!isLoading && !isError && items.length === 0 && (
        <EmptyState
          title="No festivals found"
          description="Create your first festival or collection to start curating seasonal themes."
          icon={Sparkles}
          actionLabel="Create Festival"
          onAction={() => {
            window.location.href = "/festivals/edit";
          }}
        />
      )}

      {!isLoading && !isError && items.length > 0 && (
        <div className="rounded-xl border bg-card text-card-foreground shadow-xs overflow-hidden">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10"></TableHead>
                  <TableHead className="w-[240px]">Festival / Collection</TableHead>
                  <TableHead className="w-[120px]">Kind</TableHead>
                  <TableHead className="w-[180px]">Next Run &amp; Countdown</TableHead>
                  <TableHead className="w-[180px]">Theme Counts</TableHead>
                  <TableHead className="w-[120px]">Status</TableHead>
                  <TableHead>Alerts</TableHead>
                  <TableHead className="w-[90px] text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <SortableContext
                  items={items.map((i) => i.id)}
                  strategy={verticalListSortingStrategy}
                >
                  {items.map((item) => {
                    const festData = parseFestivalData(item);
                    const counts = themeCounts.get(item.id) || { published: 0, drafts: 0 };
                    return (
                      <SortableFestivalRow
                        key={item.id}
                        item={item}
                        festival={festData}
                        publishedThemesCount={counts.published}
                        draftThemesCount={counts.drafts}
                      />
                    );
                  })}
                </SortableContext>
              </TableBody>
            </Table>
          </DndContext>
        </div>
      )}
    </div>
  );
}
