"use client";

import * as React from "react";
import { toast } from "sonner";
import { HardDrive, Trash2, ShieldAlert } from "lucide-react";
import { useAssets, useDeleteAsset, assetSrc, formatBytes } from "@/lib/api/hooks";
import type { AssetItem } from "@/lib/api/types";
import { ApiError } from "@/lib/api/error";
import { useAuthStore } from "@/lib/auth/store";
import { can } from "@/lib/auth/can";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
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
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
} from "@/components/ui/alert-dialog";
import { ErrorState, EmptyState } from "@/components/states";

const FORMATS = ["png", "jpg", "webp", "ttf", "otf", "json"];
const IMAGE_FORMATS = ["png", "jpg", "webp"];

export default function AssetsPage() {
  const user = useAuthStore((s) => s.user);
  const [format, setFormat] = React.useState("all");
  const [target, setTarget] = React.useState<AssetItem | null>(null);
  const [inUse, setInUse] = React.useState<string | null>(null);

  const { data, isLoading, isError, error, refetch } = useAssets({
    perPage: 100,
    sort: "-createdAt",
    format: format === "all" ? undefined : format,
  });
  const del = useDeleteAsset();

  if (!can(user, "assets:manage")) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <EmptyState
          icon={ShieldAlert}
          title="Admins only"
          description="The asset library can only be managed by an admin."
        />
      </div>
    );
  }

  const confirmDelete = async () => {
    if (!target) return;
    try {
      await del.mutateAsync(target.sha256);
      toast.success("Asset deleted");
      setTarget(null);
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        setInUse(e.message || "This asset is still used by a catalog item.");
      } else {
        toast.error(e instanceof Error ? e.message : "Failed to delete asset");
      }
      setTarget(null);
    }
  };

  const items = data?.items ?? [];

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Asset library</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Every uploaded file, content-addressed by SHA-256. Assets used by a catalog item cannot be deleted.
          </p>
        </div>
        <Select value={format} onValueChange={setFormat}>
          <SelectTrigger className="h-9 w-[140px] text-xs" aria-label="Format filter">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All formats</SelectItem>
            {FORMATS.map((f) => (
              <SelectItem key={f} value={f}>
                {f}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {inUse && (
        <div
          role="alert"
          className="flex items-start justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive"
        >
          <span>
            <strong>asset_in_use:</strong> {inUse}
          </span>
          <Button variant="ghost" size="sm" onClick={() => setInUse(null)}>
            Dismiss
          </Button>
        </div>
      )}

      {isLoading && <Skeleton className="h-64 w-full" />}
      {isError && (
        <ErrorState
          title="Failed to load assets"
          description={error instanceof Error ? error.message : "Network error"}
          onRetry={() => refetch()}
        />
      )}
      {!isLoading && !isError && items.length === 0 && (
        <EmptyState
          icon={HardDrive}
          title="No assets"
          description="Uploaded wallpapers, fonts and icon files appear here."
        />
      )}
      {!isLoading && !isError && items.length > 0 && (
        <div className="overflow-hidden rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[64px]">
                  <span className="sr-only">Preview</span>
                </TableHead>
                <TableHead>SHA-256</TableHead>
                <TableHead>Format</TableHead>
                <TableHead>Size</TableHead>
                <TableHead>Dimensions</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((a) => (
                <TableRow key={a.sha256}>
                  <TableCell>
                    {IMAGE_FORMATS.includes(a.format) ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={assetSrc(a.url)}
                        alt=""
                        loading="lazy"
                        className="h-10 w-10 rounded object-cover"
                        style={{ backgroundColor: a.dominant }}
                      />
                    ) : (
                      <div className="flex h-10 w-10 items-center justify-center rounded bg-muted text-[10px] uppercase">
                        {a.format}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="font-mono text-xs" title={a.sha256}>
                    {a.sha256.slice(0, 12)}…
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="uppercase">
                      {a.format}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs">{formatBytes(a.bytes)}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {a.width && a.height ? `${a.width}x${a.height}` : "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 px-2 text-xs text-destructive"
                      aria-label={`Delete ${a.sha256.slice(0, 12)}`}
                      onClick={() => setTarget(a)}
                    >
                      <Trash2 className="mr-1 h-3.5 w-3.5" />
                      Delete
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <AlertDialog open={Boolean(target)} onOpenChange={(o) => !o && setTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this asset?</AlertDialogTitle>
            <AlertDialogDescription>
              {target?.sha256.slice(0, 16)}… ({target?.format}) will be removed from storage. If an
              item still uses it, the server refuses.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button variant="outline" onClick={() => setTarget(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmDelete} disabled={del.isPending}>
              Delete
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
