"use client";

import * as React from "react";
import { UploadCloud, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  useUploadImageAsset,
  useSaveWallpaper,
  ASSET_WARNING_LABELS,
  formatBytes,
} from "@/lib/api/hooks";
import type { UploadAssetResult } from "@/lib/api/types";
import type { WallpaperImage, AssetFormat } from "@/lib/catalog/types";
import { slugify } from "@/components/fields/IdField";
import { Badge } from "@/components/ui/badge";

export function toWallpaperImage(r: UploadAssetResult): WallpaperImage {
  const sizes = Object.entries(r.variants ?? {})
    .map(([w, a]) => ({
      width: Number(w),
      height: a.height ?? 0,
      asset: { url: a.url, sha256: a.sha256, bytes: a.bytes, format: a.format as AssetFormat },
    }))
    .sort((a, b) => a.width - b.width);
  if (sizes.length === 0 && r.width && r.height) {
    sizes.push({
      width: r.width,
      height: r.height,
      asset: { url: r.url, sha256: r.sha256, bytes: r.bytes, format: r.format as AssetFormat },
    });
  }
  return { sizes, blurhash: r.blurhash, dominant: r.dominant };
}

export function WarningChips({ warnings }: { warnings?: string[] | null }) {
  if (!warnings?.length) return null;
  return (
    <span className="inline-flex flex-wrap gap-1">
      {warnings.map((w) => (
        <Badge
          key={w}
          variant="outline"
          className="border-amber-500/40 bg-amber-500/10 text-[10px] text-amber-700 dark:text-amber-400"
        >
          {w}: {ASSET_WARNING_LABELS[w] ?? w}
        </Badge>
      ))}
    </span>
  );
}

export interface UploadRow {
  key: string;
  name: string;
  status: "uploading" | "done" | "error";
  result?: UploadAssetResult;
  message?: string;
}

/** Drag/drop, click or paste images; each is uploaded with ?variants=wallpaper and saved as a draft wallpaper. */
export function UploadZone({ canUpload = true }: { canUpload?: boolean }) {
  const upload = useUploadImageAsset();
  const save = useSaveWallpaper();
  const [rows, setRows] = React.useState<UploadRow[]>([]);
  const [dragging, setDragging] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const patchRow = (key: string, patch: Partial<UploadRow>) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const handleFiles = React.useCallback(
    async (files: File[]) => {
      const images = files.filter((f) => /^image\/(png|jpe?g|webp)$/.test(f.type) || /\.(png|jpe?g|webp)$/i.test(f.name));
      for (const file of images) {
        const key = `${file.name}-${Date.now()}-${Math.random()}`;
        setRows((rs) => [{ key, name: file.name, status: "uploading" }, ...rs]);
        try {
          const result = await upload.mutateAsync({ file, variants: "wallpaper" });
          const base = file.name.replace(/\.[^.]+$/, "");
          const id = `${slugify(base) || "wallpaper"}-${result.sha256.slice(0, 6)}`;
          await save.mutateAsync({
            id,
            isNew: true,
            data: { id, name: { en: base }, kind: "image", image: toWallpaperImage(result) },
          });
          patchRow(key, { status: "done", result });
        } catch (e) {
          patchRow(key, { status: "error", message: e instanceof Error ? e.message : "Upload failed" });
        }
      }
    },
    [upload, save]
  );

  React.useEffect(() => {
    if (!canUpload) return;
    const onPaste = (e: ClipboardEvent) => {
      const files = Array.from(e.clipboardData?.files ?? []);
      if (files.length) handleFiles(files);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [handleFiles, canUpload]);

  if (!canUpload) return null;

  return (
    <div className="space-y-3">
      <div
        role="button"
        tabIndex={0}
        aria-label="Upload wallpapers"
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          handleFiles(Array.from(e.dataTransfer.files));
        }}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed p-6 text-center transition-colors",
          dragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
        )}
      >
        <UploadCloud className="h-6 w-6 text-muted-foreground" />
        <p className="text-sm font-medium">Drop, click or paste images to upload</p>
        <p className="text-xs text-muted-foreground">
          PNG, JPG or WebP up to 10 MB. 1080 and 1440 WebP variants are generated automatically.
        </p>
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          multiple
          className="hidden"
          data-testid="wallpaper-file-input"
          onChange={(e) => {
            handleFiles(Array.from(e.target.files ?? []));
            e.target.value = "";
          }}
        />
      </div>

      {rows.length > 0 && (
        <ul className="space-y-2" aria-label="Uploads">
          {rows.map((r) => (
            <li key={r.key} className="rounded-lg border bg-card p-3 text-xs space-y-1.5">
              <div className="flex items-center gap-2">
                {r.status === "uploading" && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {r.status === "done" && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />}
                {r.status === "error" && <AlertCircle className="h-3.5 w-3.5 text-destructive" />}
                <span className="font-medium truncate">{r.name}</span>
                <span className="ml-auto text-muted-foreground">
                  {r.status === "uploading" ? "Uploading and generating variants..." : r.status === "done" ? "Draft created" : r.message}
                </span>
              </div>
              {r.status === "uploading" && (
                <div className="h-1 overflow-hidden rounded bg-muted">
                  <div className="h-full w-1/3 animate-pulse rounded bg-primary" />
                </div>
              )}
              {r.result && (
                <div className="flex flex-wrap items-center gap-2 text-muted-foreground">
                  {Object.entries(r.result.variants ?? {}).map(([w, a]) => (
                    <span key={w} className="font-mono">
                      {w}w: {formatBytes(a.bytes)}
                    </span>
                  ))}
                  <WarningChips warnings={r.result.warnings} />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
