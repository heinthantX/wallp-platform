"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useThemes, useFestivals, useEngines } from "@/lib/api/hooks";
import type { ItemView, ListThemesQuery } from "@/lib/api/types";
import type { ThemeDetail } from "@/lib/catalog/types";
import { StatusBadge } from "@/components/items";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState, EmptyState } from "@/components/states";
import {
  Sparkles,
  Plus,
  LayoutGrid,
  List,
  Search,
  Edit,
  Radio,
} from "lucide-react";

function parseThemeData(item: ItemView): Partial<ThemeDetail> {
  if (typeof item.data === "string") {
    try {
      return JSON.parse(item.data);
    } catch {
      return {};
    }
  }
  return (item.data || {}) as Partial<ThemeDetail>;
}

function ThemeCard({ item }: { item: ItemView }) {
  const theme = parseThemeData(item);
  const palette = theme.palette || {
    background: "#0c0a1a",
    deep: "#05040a",
    surface: "#18142c",
    text: "#ffffff",
    textMuted: "#9b92c4",
    motif: "#ff7700",
  };
  const isLive = Boolean(theme.isLive);
  const displayFont = theme.fonts?.display;
  const nameEn = theme.name?.en || item.id;

  return (
    <Link
      href={`/themes/edit?id=${encodeURIComponent(item.id)}`}
      className="group relative flex flex-col rounded-2xl border bg-card text-card-foreground shadow-xs hover:shadow-md hover:border-primary/50 transition-all overflow-hidden"
    >
      {/* Visual Scene Thumbnail */}
      <div
        className="relative w-full aspect-[4/5] rounded-t-2xl overflow-hidden flex flex-col justify-between p-4"
        style={{
          background: `linear-gradient(180deg, ${palette.background} 0%, ${palette.deep || palette.background} 100%)`,
        }}
      >
        {/* Subtle glow / motif circle */}
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-28 h-28 rounded-full blur-md opacity-40 transition-transform group-hover:scale-110 duration-300"
          style={{
            backgroundColor: palette.motif || palette.text,
          }}
        />
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-20 h-20 rounded-full border-2 border-white/20 transition-transform group-hover:scale-105 duration-300 flex items-center justify-center shadow-lg"
          style={{
            backgroundColor: palette.motif || palette.surface,
          }}
        />

        {/* Top Badges */}
        <div className="relative z-10 flex items-center justify-between gap-1 w-full">
          <StatusBadge status={item.status} />
          {isLive && (
            <Badge
              variant="outline"
              className="bg-black/60 backdrop-blur-xs text-white border-white/20 text-[10px] uppercase font-mono tracking-wider gap-1 px-1.5"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              LIVE
            </Badge>
          )}
        </div>

        {/* Bottom Title on Thumbnail */}
        <div className="relative z-10 space-y-1">
          <h3
            className="text-base font-bold text-white tracking-wide truncate drop-shadow-md"
            style={{
              fontFamily: displayFont ? `"${displayFont}", sans-serif` : "inherit",
            }}
          >
            {nameEn}
          </h3>
          <p className="text-[11px] text-white/70 font-mono truncate">
            {item.id}
          </p>
        </div>
      </div>

      {/* Meta Footer */}
      <div className="p-3.5 space-y-2 bg-card">
        <div className="flex items-center justify-between text-xs">
          <span className="font-medium text-foreground truncate max-w-[120px]">
            {item.festivalId || "Any time"}
          </span>
          {theme.style && (
            <Badge variant="secondary" className="text-[10px] capitalize">
              {theme.style}
            </Badge>
          )}
        </div>
        <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-1 border-t border-border/50">
          <span className="font-mono text-[10px]">
            v{theme.rev || item.rev || 1} · {theme.scene?.engine || "layers"}
          </span>
          <span>
            {new Date(item.updatedAt).toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
            })}
          </span>
        </div>
      </div>
    </Link>
  );
}

function ThemesView() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Read URL params
  const festivalParam = searchParams.get("festival") || "";
  const statusParam = searchParams.get("status") || "";
  const styleParam = searchParams.get("style") || "";
  const engineParam = searchParams.get("engine") || "";
  const qParam = searchParams.get("q") || "";
  const sortParam = searchParams.get("sort") || "-updatedAt";

  const [viewMode, setViewMode] = React.useState<"grid" | "table">("grid");
  const [searchInput, setSearchInput] = React.useState(qParam);

  // Sync state with URL params
  React.useEffect(() => {
    setSearchInput(qParam);
  }, [qParam]);

  const updateFilters = React.useCallback(
    (newParams: Record<string, string>) => {
      const sp = new URLSearchParams(searchParams.toString());
      for (const [key, val] of Object.entries(newParams)) {
        if (!val || val === "all") {
          sp.delete(key);
        } else {
          sp.set(key, val);
        }
      }
      router.replace(`/themes?${sp.toString()}`);
    },
    [router, searchParams]
  );

  const {
    data: themesData,
    isLoading,
    isError,
    error,
    refetch,
  } = useThemes({
    festival: festivalParam || undefined,
    status: (statusParam as ListThemesQuery["status"]) || undefined,
    style: styleParam || undefined,
    engine: engineParam || undefined,
    q: qParam || undefined,
    sort: sortParam || undefined,
    perPage: 100,
  });

  const { data: festivalsData } = useFestivals({ perPage: 100 });
  const { data: enginesData } = useEngines();

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateFilters({ q: searchInput.trim() });
  };

  const items = themesData?.items || [];

  return (
    <div className="space-y-6 p-6 max-w-7xl mx-auto">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Themes</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Browse, design, and configure phone themes across festivals, engines, and color palettes.
          </p>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <Button variant="outline" asChild className="gap-2">
            <Link href="/themes/generate/">
              <Sparkles className="h-4 w-4 text-primary" />
              <span>Generate</span>
            </Link>
          </Button>

          <Button asChild className="gap-2">
            <Link href="/themes/new">
              <Plus className="h-4 w-4" />
              <span>New Theme</span>
            </Link>
          </Button>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 p-3.5 rounded-xl border bg-card text-card-foreground shadow-2xs">
        {/* Search */}
        <form onSubmit={handleSearchSubmit} className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onBlur={() => updateFilters({ q: searchInput.trim() })}
            placeholder="Search by name, ID or tag..."
            className="pl-9 h-9 text-xs"
          />
        </form>

        {/* Dropdown filters */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Festival filter */}
          <Select
            value={festivalParam || "all"}
            onValueChange={(val) => updateFilters({ festival: val })}
          >
            <SelectTrigger className="h-9 text-xs w-[130px]">
              <SelectValue placeholder="Festival" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Festivals</SelectItem>
              {festivalsData?.items?.map((f) => (
                <SelectItem key={f.id} value={f.id}>
                  {f.id}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Status filter */}
          <Select
            value={statusParam || "all"}
            onValueChange={(val) => updateFilters({ status: val })}
          >
            <SelectTrigger className="h-9 text-xs w-[120px]">
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

          {/* Style filter */}
          <Select
            value={styleParam || "all"}
            onValueChange={(val) => updateFilters({ style: val })}
          >
            <SelectTrigger className="h-9 text-xs w-[110px]">
              <SelectValue placeholder="Style" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Styles</SelectItem>
              <SelectItem value="classic">Classic</SelectItem>
              <SelectItem value="cozy">Cozy</SelectItem>
              <SelectItem value="minimal">Minimal</SelectItem>
              <SelectItem value="cute">Cute</SelectItem>
            </SelectContent>
          </Select>

          {/* Engine filter */}
          <Select
            value={engineParam || "all"}
            onValueChange={(val) => updateFilters({ engine: val })}
          >
            <SelectTrigger className="h-9 text-xs w-[120px]">
              <SelectValue placeholder="Engine" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Engines</SelectItem>
              {enginesData?.engines?.map((eng) => (
                <SelectItem key={eng.id} value={eng.id}>
                  {eng.id}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Sort selector */}
          <Select
            value={sortParam}
            onValueChange={(val) => updateFilters({ sort: val })}
          >
            <SelectTrigger className="h-9 text-xs w-[130px]">
              <SelectValue placeholder="Sort by" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="-updatedAt">Updated (Newest)</SelectItem>
              <SelectItem value="updatedAt">Updated (Oldest)</SelectItem>
              <SelectItem value="sort">Catalogue Sort</SelectItem>
              <SelectItem value="id">Identifier (A-Z)</SelectItem>
            </SelectContent>
          </Select>

          {/* View mode toggle */}
          <div className="flex items-center rounded-lg border p-0.5 bg-muted/40">
            <Button
              variant={viewMode === "grid" ? "secondary" : "ghost"}
              size="icon"
              onClick={() => setViewMode("grid")}
              className="h-8 w-8"
              aria-label="Grid view"
            >
              <LayoutGrid className="h-4 w-4" />
            </Button>
            <Button
              variant={viewMode === "table" ? "secondary" : "ghost"}
              size="icon"
              onClick={() => setViewMode("table")}
              className="h-8 w-8"
              aria-label="Table view"
            >
              <List className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Loading state */}
      {isLoading && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {Array.from({ length: 10 }).map((_, i) => (
            <Skeleton key={i} className="aspect-[4/6] rounded-2xl w-full" />
          ))}
        </div>
      )}

      {/* Error state */}
      {isError && (
        <ErrorState
          title="Failed to load themes"
          description={error instanceof Error ? error.message : "Network error"}
          onRetry={() => refetch()}
        />
      )}

      {/* Empty state */}
      {!isLoading && !isError && items.length === 0 && (
        <EmptyState
          title="No themes match your filters"
          description="Try broadening your search or filter options, or create a new theme draft."
          icon={Sparkles}
          actionLabel="Create Theme"
          onAction={() => {
            window.location.href = "/themes/new";
          }}
        />
      )}

      {/* Grid View */}
      {!isLoading && !isError && items.length > 0 && viewMode === "grid" && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {items.map((item) => (
            <ThemeCard key={item.id} item={item} />
          ))}
        </div>
      )}

      {/* Table View */}
      {!isLoading && !isError && items.length > 0 && viewMode === "table" && (
        <div className="rounded-xl border bg-card text-card-foreground shadow-xs overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[260px]">Theme</TableHead>
                <TableHead className="w-[140px]">Festival</TableHead>
                <TableHead className="w-[120px]">Status</TableHead>
                <TableHead className="w-[100px]">Style</TableHead>
                <TableHead className="w-[120px]">Engine</TableHead>
                <TableHead className="w-[80px]">Live</TableHead>
                <TableHead className="w-[140px]">Last Updated</TableHead>
                <TableHead className="w-[90px] text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => {
                const theme = parseThemeData(item);
                const nameEn = theme.name?.en || item.id;
                return (
                  <TableRow key={item.id} className="hover:bg-muted/40 transition-colors">
                    <TableCell className="font-medium">
                      <div className="flex flex-col">
                        <span className="font-semibold text-sm">{nameEn}</span>
                        <span className="text-xs font-mono text-muted-foreground">
                          {item.id} (rev {theme.rev || item.rev || 1})
                        </span>
                      </div>
                    </TableCell>

                    <TableCell className="text-xs">
                      {item.festivalId ? (
                        <Badge variant="outline" className="text-xs font-mono">
                          {item.festivalId}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground italic">None</span>
                      )}
                    </TableCell>

                    <TableCell>
                      <StatusBadge status={item.status} />
                    </TableCell>

                    <TableCell>
                      {theme.style ? (
                        <Badge variant="secondary" className="text-xs capitalize">
                          {theme.style}
                        </Badge>
                      ) : (
                        "—"
                      )}
                    </TableCell>

                    <TableCell className="font-mono text-xs">
                      {theme.scene?.engine || "layers"}
                    </TableCell>

                    <TableCell>
                      {theme.isLive ? (
                        <span className="inline-flex items-center gap-1 text-xs text-emerald-500 font-medium">
                          <Radio className="h-3 w-3 animate-pulse" />
                          Yes
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">No</span>
                      )}
                    </TableCell>

                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(item.updatedAt).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </TableCell>

                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" asChild className="h-8 px-2 text-xs">
                        <Link href={`/themes/edit?id=${encodeURIComponent(item.id)}`}>
                          <Edit className="h-3.5 w-3.5 mr-1" />
                          Edit
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

export default function ThemesPage() {
  return (
    <React.Suspense
      fallback={
        <div className="p-6 max-w-7xl mx-auto space-y-6">
          <Skeleton className="h-10 w-48" />
          <Skeleton className="h-64 w-full" />
        </div>
      }
    >
      <ThemesView />
    </React.Suspense>
  );
}
