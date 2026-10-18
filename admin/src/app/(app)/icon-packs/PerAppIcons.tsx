"use client";

import * as React from "react";
import { toast } from "sonner";
import { Upload, X, RotateCcw, Loader2 } from "lucide-react";
import { useUploadAsset } from "@/lib/api/hooks/useFonts";
import { assetSrc } from "@/lib/api/hooks/useAssets";
import type { Asset } from "@/lib/catalog/types";
import { COMMON_APPS } from "./common-apps";
import { resolveAppFile } from "./resolve-app-file";

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

export function PerAppIcons({ apps = {}, onChange, tile }: { apps?: Apps; onChange: (next: Apps) => void; tile?: string }) {
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
      </div>
      {showMissing && (
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-1 text-xs">
          {missing.map((a) => (
            <li key={a.pkg}><span className="font-medium">{a.label}</span> <span className="text-muted-foreground">· {a.subject}</span></li>
          ))}
        </ul>
      )}

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
