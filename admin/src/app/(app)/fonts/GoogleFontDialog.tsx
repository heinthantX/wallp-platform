"use client";

import * as React from "react";
import { toast } from "sonner";
import { Search } from "lucide-react";
import { useGoogleFontSearch, useImportGoogleFont } from "@/lib/api/hooks/useFonts";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState, EmptyState } from "@/components/states";

export function GoogleFontDialog({
  open,
  onOpenChange,
  onImported,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onImported?: (id: string) => void;
}) {
  const [text, setText] = React.useState("");
  const [q, setQ] = React.useState("");
  React.useEffect(() => {
    const t = setTimeout(() => setQ(text.trim()), 300);
    return () => clearTimeout(t);
  }, [text]);

  const search = useGoogleFontSearch(q, open && q.length > 0);
  const importMutation = useImportGoogleFont();
  const [importing, setImporting] = React.useState<string | null>(null);

  const doImport = async (family: string, variants: string[]) => {
    setImporting(family);
    try {
      const saved = await importMutation.mutateAsync({ family, variants });
      toast.success(`${family} imported as draft`);
      onImported?.(saved?.id);
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Import failed");
    } finally {
      setImporting(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Add Google font</DialogTitle>
          <DialogDescription>Search by name. Files and licence are recorded automatically.</DialogDescription>
        </DialogHeader>
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            autoFocus
            className="pl-8"
            placeholder="e.g. Padauk"
            aria-label="Search Google Fonts"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
        </div>
        <div className="max-h-80 overflow-y-auto space-y-2">
          {search.isFetching && (
            <div className="space-y-2" data-testid="gf-skeleton">
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
            </div>
          )}
          {search.isError && (
            <ErrorState title="Search failed" description={search.error instanceof Error ? search.error.message : undefined} onRetry={() => search.refetch()} />
          )}
          {!search.isFetching && q && search.data?.length === 0 && (
            <EmptyState title="No matching fonts" description={`Nothing found for "${q}".`} />
          )}
          {!search.isFetching &&
            search.data?.map((f) => (
              <div key={f.family} className="flex items-center justify-between gap-3 rounded-lg border p-3">
                <div className="min-w-0">
                  <div className="font-medium">{f.family}</div>
                  <div className="flex flex-wrap gap-1 mt-1">
                    <Badge variant="secondary" className="text-[10px]">{f.category}</Badge>
                    {(f.subsets ?? []).slice(0, 4).map((s) => (
                      <Badge key={s} variant="outline" className="text-[10px]">{s}</Badge>
                    ))}
                  </div>
                </div>
                <Button size="sm" disabled={importing !== null} onClick={() => doImport(f.family, f.variants ?? [])}>
                  {importing === f.family ? "Importing..." : "Import"}
                </Button>
              </div>
            ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
