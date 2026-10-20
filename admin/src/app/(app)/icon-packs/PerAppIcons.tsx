"use client";

import * as React from "react";
import { toast } from "sonner";
import { Upload, X, RotateCcw, Loader2 } from "lucide-react";
import { useUploadAsset } from "@/lib/api/hooks/useFonts";
import { assetSrc } from "@/lib/api/hooks/useAssets";
import type { Asset } from "@/lib/catalog/types";
import { COMMON_APPS } from "./common-apps";
import { resolveAppFile } from "./resolve-app-file";
import { PromptKitButton } from "@/components/ai/PromptKitButton";
import { buildPromptKit } from "@/lib/prompt-kit";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { sliceSheetFile, DEFAULT_COLUMNS, type Slice } from "./sprite-sheet";

type Apps = Record<string, Asset>;
type Source = "exact" | "alias" | "manual" | "unmatched";
interface Row {
  id: number;
  file: File;
  status: "uploading" | "ok" | "error";
  pkg?: string;
  source: Source;
  suggestion?: string;
  asset?: Asset;
  committed?: boolean;
  replaced?: boolean;
}

const MAX_PARALLEL = 4;
const EXT = /\.(png|webp|jpe?g)$/i;
const labelOf = (pkg: string) => COMMON_APPS.find((a) => a.pkg === pkg)?.label;

// Cheap client-side mirror of the backend square / 192 px checks; skipped where decoding is unavailable (jsdom).
async function checkDims(file: File): Promise<string | null> {
  if (typeof createImageBitmap !== "function") return null;
  try {
    const bmp = await createImageBitmap(file);
    const { width: w, height: h } = bmp;
    bmp.close?.();
    if (Math.abs(w - h) / Math.max(w, h) > 0.01) return "not square";
    if (Math.min(w, h) < 192) return "under 192 px";
  } catch {
    /* undecodable here: leave it to the backend check */
  }
  return null;
}

function SpriteImport({ onApply }: { onApply: (assets: Apps) => void }) {
  const upload = useUploadAsset();
  const [file, setFile] = React.useState<File | null>(null);
  const [columns, setColumns] = React.useState(DEFAULT_COLUMNS);
  const [auto, setAuto] = React.useState(true);
  const [slices, setSlices] = React.useState<Slice[]>([]);
  const [off, setOff] = React.useState<Set<string>>(new Set());
  const [slicing, setSlicing] = React.useState(false);
  const [progress, setProgress] = React.useState<{ done: number; total: number } | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const done = React.useRef<Apps>({});
  const urls = React.useRef<string[]>([]);

  const revoke = () => { urls.current.forEach((u) => URL.revokeObjectURL(u)); urls.current = []; };
  React.useEffect(() => revoke, []);

  const slice = React.useCallback(async (f: File, cols: number, detect: boolean) => {
    setSlicing(true);
    setError(null);
    try {
      const next = await sliceSheetFile(f, { columns: cols, auto: detect });
      revoke();
      urls.current = next.map((x) => x.url);
      setSlices(next);
      setOff(new Set());
      if (!next.length) setError("No glyphs found. Check the column count or the image.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not read the image");
    } finally {
      setSlicing(false);
    }
  }, []);

  const pick = (f?: File) => {
    if (!f) return;
    done.current = {};
    setFile(f);
    void slice(f, columns, auto);
  };
  const close = () => { if (progress) return; revoke(); setFile(null); setSlices([]); setError(null); };
  const chosen = slices.filter((x) => !off.has(x.pkg));

  const apply = async () => {
    setError(null);
    const todo = chosen.filter((x) => !done.current[x.pkg]);
    const total = chosen.length;
    setProgress({ done: total - todo.length, total });
    const queue = [...todo];
    let failed = 0;
    const worker = async () => {
      for (let x = queue.shift(); x; x = queue.shift()) {
        try {
          const a = await upload.mutateAsync(new File([x.blob], `${x.pkg}.png`, { type: "image/png" }));
          done.current[x.pkg] = { url: a.url, sha256: a.sha256, bytes: a.bytes, format: a.format as Asset["format"] };
          setProgress((p) => (p ? { ...p, done: p.done + 1 } : p));
        } catch (e) {
          failed++;
          setError(e instanceof Error ? e.message : "Upload failed");
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(MAX_PARALLEL, todo.length) }, worker));
    setProgress(null);
    if (failed) return; // keep the dialog open: Retry re-uploads only what is missing
    onApply({ ...done.current });
    done.current = {};
    revoke(); setFile(null); setSlices([]);
    toast.success(`Imported ${total} icons`);
  };

  return (
    <>
      <label className="inline-flex w-fit cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-muted">
        <Upload className="h-4 w-4" />
        Import sprite sheet
        <input type="file" accept="image/png,image/webp,image/jpeg" className="sr-only" aria-label="Import sprite sheet"
          onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ""; }} />
      </label>
      <Dialog open={Boolean(file)} onOpenChange={(o) => { if (!o) close(); }}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto" aria-describedby="sprite-desc">
          <DialogHeader>
            <DialogTitle>Import sprite sheet</DialogTitle>
            <DialogDescription id="sprite-desc">White glyphs on a solid dark background, cells in app order. Remove any cell you do not want.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-wrap items-center gap-4 text-sm">
            <label className="flex items-center gap-2">Columns
              <input type="number" min={1} max={24} value={columns} aria-label="Sprite columns" className="w-16 rounded border bg-background px-2 py-1"
                onChange={(e) => { const n = Math.max(1, Math.min(24, Number(e.target.value) || 1)); setColumns(n); if (file) void slice(file, n, auto); }} />
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={auto} onChange={(e) => { setAuto(e.target.checked); if (file) void slice(file, columns, e.target.checked); }} />
              Auto-detect grid
            </label>
            <span className="text-xs text-muted-foreground">{chosen.length} of {slices.length} selected</span>
          </div>
          {slicing ? (
            <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Slicing...</div>
          ) : (
            <ul className="grid grid-cols-4 sm:grid-cols-6 gap-3" data-testid="sprite-slices">
              {slices.map((x) => {
                const on = !off.has(x.pkg);
                return (
                  <li key={x.pkg} className={`relative flex flex-col items-center gap-1 rounded-md p-1 transition-opacity ${on ? "" : "opacity-30"}`}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={x.url} alt={x.label} className="h-14 w-14 rounded-xl bg-slate-800 object-contain p-1" />
                    <span className="w-full truncate text-center text-[10px]">{x.label}</span>
                    <button type="button" aria-label={on ? `Unassign ${x.label}` : `Assign ${x.label}`} aria-pressed={!on}
                      className="absolute right-0 top-0 rounded-full bg-background/90 p-0.5 border hover:text-destructive"
                      onClick={() => setOff((s) => { const n = new Set(s); if (n.has(x.pkg)) n.delete(x.pkg); else n.add(x.pkg); return n; })}>
                      {on ? <X className="h-3 w-3" /> : <RotateCcw className="h-3 w-3" />}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {error && (
            <div role="alert" className="flex items-center gap-3 rounded-md border border-destructive/40 bg-destructive/5 p-2 text-xs text-destructive">
              <span className="flex-1">{error}</span>
              {slices.length > 0 && !progress && <button type="button" className="inline-flex items-center gap-1 underline" onClick={apply}><RotateCcw className="h-3 w-3" />Retry</button>}
              {slices.length === 0 && file && <button type="button" className="inline-flex items-center gap-1 underline" onClick={() => slice(file, columns, auto)}><RotateCcw className="h-3 w-3" />Retry</button>}
            </div>
          )}
          <div className="flex items-center justify-end gap-3">
            {progress && <span className="text-sm" role="status">Uploading {progress.done} / {progress.total}</span>}
            <button type="button" className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-50" disabled={Boolean(progress)} onClick={close}>Cancel</button>
            <button type="button" className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-50" disabled={Boolean(progress) || slicing || !chosen.length} onClick={apply}>
              {progress ? <Loader2 className="h-4 w-4 animate-spin" aria-label="Uploading" /> : `Apply ${chosen.length} icons`}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function PerAppIcons({ apps = {}, onChange, tile, kitInfo }: { apps?: Apps; onChange: (next: Apps) => void; tile?: string; kitInfo?: { packName: string; style?: string; glyph?: string } }) {
  const upload = useUploadAsset();
  const [rows, setRows] = React.useState<Row[]>([]);
  const [drag, setDrag] = React.useState(false);
  const [showMissing, setShowMissing] = React.useState(false);
  const appsRef = React.useRef(apps);
  appsRef.current = apps;
  const nextId = React.useRef(0);
  const patch = React.useCallback((id: number, p: Partial<Row>) => setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...p } : r))), []);

  const run = React.useCallback(async (row: Row) => {
    patch(row.id, { status: "uploading" });
    try {
      const warn = await checkDims(row.file);
      if (warn) toast.warning(`${row.file.name}: ${warn}`);
      if (row.file.size > 1024 * 1024) toast.warning(`${row.file.name}: over 1 MB`);
      const a = await upload.mutateAsync(row.file);
      patch(row.id, { status: "ok", asset: { url: a.url, sha256: a.sha256, bytes: a.bytes, format: a.format as Asset["format"] } });
    } catch (e) {
      patch(row.id, { status: "error" });
      toast.error(e instanceof Error ? e.message : "Upload failed");
    }
  }, [patch, upload]);

  const addFiles = (list: FileList | File[]) => {
    const files = Array.from(list);
    const bad = files.filter((f) => !EXT.test(f.name));
    if (bad.length) toast.error(`Only PNG, WebP or JPG: ${bad.map((f) => f.name).join(", ")}`);
    const fresh: Row[] = files.filter((f) => EXT.test(f.name)).map((file) => {
      const r = resolveAppFile(file.name);
      return { id: nextId.current++, file, status: "uploading", pkg: r.pkg, source: r.source, suggestion: r.suggestion };
    });
    if (!fresh.length) return;
    setRows((rs) => [...rs, ...fresh]);
    const queue = [...fresh];
    const worker = async () => { for (let r = queue.shift(); r; r = queue.shift()) await run(r); };
    Array.from({ length: Math.min(MAX_PARALLEL, queue.length) }, worker);
  };

  // Commit finished, mapped rows into the form (a second file for a package replaces the first).
  React.useEffect(() => {
    const ready = rows.filter((r) => r.asset && r.pkg && !r.committed);
    if (!ready.length) return;
    const next = { ...appsRef.current };
    for (const r of ready) next[r.pkg!] = r.asset!;
    appsRef.current = next;
    onChange(next);
    setRows((rs) => rs.map((r) => {
      const hit = ready.find((x) => x.id === r.id);
      return hit ? { ...r, committed: true, replaced: Boolean(apps[r.pkg!]) || ready.some((x) => x.id < r.id && x.pkg === r.pkg) } : r;
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);

  const remove = (pkg: string) => {
    const { [pkg]: _drop, ...rest } = appsRef.current;
    void _drop;
    appsRef.current = rest;
    onChange(rest);
    setRows((rs) => rs.filter((r) => r.pkg !== pkg));
  };

  const mapped = COMMON_APPS.filter((a) => apps[a.pkg]);
  const missing = COMMON_APPS.filter((a) => !apps[a.pkg]);
  const pending = rows.filter((r) => !r.committed);
  const entries = Object.entries(apps);
  const srcOf = (pkg: string) => rows.find((r) => r.pkg === pkg && r.committed);

  return (
    <div className="space-y-4" data-testid="per-app-icons">
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-sm font-medium" data-testid="apps-counter">
          {mapped.length} / {COMMON_APPS.length} · {missing.length} missing
        </p>
        <button type="button" className="text-xs underline" aria-expanded={showMissing} onClick={() => setShowMissing((v) => !v)}>
          {showMissing ? "Hide" : "Show"} missing
        </button>
        {missing.length > 0 && (
          <PromptKitButton tip={false} label="Copy kit for missing" kit={() => buildPromptKit({ packName: kitInfo?.packName ?? "", style: kitInfo?.style, tile, glyph: kitInfo?.glyph, apps: missing })} />
        )}
      </div>
      {showMissing && (
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-1 text-xs">
          {missing.map((a) => (
            <li key={a.pkg}><span className="font-medium">{a.label}</span> <span className="text-muted-foreground">· {a.subject}</span></li>
          ))}
        </ul>
      )}

      <SpriteImport onApply={(assets) => { const next = { ...appsRef.current, ...assets }; appsRef.current = next; onChange(next); }} />

      <label
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); addFiles(e.dataTransfer.files); }}
        className={`flex flex-col items-center gap-1 rounded-md border-2 border-dashed p-6 text-sm cursor-pointer transition-colors ${drag ? "border-primary bg-primary/5" : "hover:bg-muted"}`}
      >
        <Upload className="h-4 w-4" />
        Drop app icons here or click to choose
        <span className="text-xs text-muted-foreground">Name files by package (com.whatsapp.png) or app (maps.png). Square, 192 px or more, under 1 MB.</span>
        <input type="file" multiple accept="image/png,image/webp,image/jpeg" className="sr-only" aria-label="Upload app icons"
          onChange={(e) => { if (e.target.files) addFiles(e.target.files); e.target.value = ""; }} />
      </label>

      {(entries.length > 0 || pending.length > 0) && (
        <table className="w-full text-sm" aria-label="App icon mapping">
          <tbody>
            {pending.map((r) => (
              <tr key={`p${r.id}`} className="border-b" data-testid="pending-row">
                <td className="w-12 py-1">{r.status === "uploading" ? <Loader2 className="h-4 w-4 animate-spin" aria-label="Uploading" /> : <span className="text-destructive text-xs">error</span>}</td>
                <td className="py-1 font-mono text-xs">{r.file.name}</td>
                <td className="py-1">
                  {r.status === "error" && (
                    <button type="button" className="inline-flex items-center gap-1 text-xs underline" onClick={() => run(r)}><RotateCcw className="h-3 w-3" />Retry</button>
                  )}
                  {!r.pkg && (
                    <select aria-label={`Map ${r.file.name} to app`} value="" className="rounded border bg-background px-1 py-0.5 text-xs"
                      onChange={(e) => e.target.value && patch(r.id, { pkg: e.target.value, source: "manual" })}>
                      <option value="">{r.suggestion ? `Suggested: ${labelOf(r.suggestion)}` : "Choose app..."}</option>
                      {COMMON_APPS.map((a) => <option key={a.pkg} value={a.pkg}>{a.label}</option>)}
                    </select>
                  )}
                  {r.pkg && <span className="font-mono text-xs">{r.pkg}</span>}
                </td>
                <td className="py-1 text-xs">{r.source !== "unmatched" && <span className="rounded bg-muted px-1.5 py-0.5">{r.source}</span>}</td>
                <td />
              </tr>
            ))}
            {entries.map(([pkg, a]) => {
              const r = srcOf(pkg);
              return (
                <tr key={pkg} className="border-b" data-testid="app-row">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <td className="w-12 py-1"><img src={assetSrc(a.url)} alt="" className="h-8 w-8 rounded object-cover" /></td>
                  <td className="py-1 font-mono text-xs">{pkg}</td>
                  <td className="py-1 text-xs text-muted-foreground">{labelOf(pkg)}</td>
                  <td className="py-1 text-xs space-x-1">
                    <span className="rounded bg-muted px-1.5 py-0.5">{r?.source ?? "saved"}</span>
                    {r?.replaced && <span className="rounded bg-amber-100 text-amber-900 px-1.5 py-0.5">replaced</span>}
                  </td>
                  <td className="py-1 text-right">
                    <button type="button" aria-label={`Remove ${pkg}`} className="p-1 hover:text-destructive" onClick={() => remove(pkg)}><X className="h-3.5 w-3.5" /></button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      <div className="mx-auto w-64 rounded-[2rem] border-4 p-3" aria-label="Home screen preview">
        <div className="grid grid-cols-4 gap-2">
          {COMMON_APPS.slice(0, 20).map((app) => {
            const a = apps[app.pkg];
            return (
              <div key={app.pkg} className="flex flex-col items-center gap-0.5" title={app.label}>
                {a ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={assetSrc(a.url)} alt={app.label} className="h-11 w-11 rounded-xl object-cover" />
                ) : (
                  <div className="h-11 w-11 rounded-xl grid place-items-center text-sm font-semibold text-white opacity-40" style={{ background: tile || "#1b1b2f" }}>{app.label[0]}</div>
                )}
                <span className="text-[9px] truncate w-full text-center">{app.label}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
