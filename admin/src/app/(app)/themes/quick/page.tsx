"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, Loader2, RefreshCw, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Stepper } from "@/components/generator/Stepper";
import { RelationSelect, EngineSelect } from "@/components/fields";
import { slugify } from "@/components/fields/IdField";
import {
  assetSrc,
  useFromImage,
  useSaveTheme,
  useSaveWallpaper,
  useUploadImageAsset,
  useWallpaper,
} from "@/lib/api/hooks";
import type { GeneratorOption } from "@/lib/generator/types";
import type { WallpaperImage } from "@/lib/catalog/types";
import { cn } from "@/lib/utils";
import { toWallpaperImage } from "../../wallpapers/_components/UploadZone";

const STEPS = [
  { id: 1, title: "Wallpaper", description: "Festival and image" },
  { id: 2, title: "Palette", description: "Pick a candidate" },
  { id: 3, title: "Live scene", description: "Optional" },
  { id: 4, title: "Icons & font", description: "Optional icon pack" },
  { id: 5, title: "Create", description: "Save as draft" },
];

const randomSeed = () => Math.floor(Math.random() * 2147483647);

function Swatches({ palette }: { palette: Record<string, string | undefined> }) {
  return (
    <div className="flex h-8 overflow-hidden rounded-md border">
      {["background", "deep", "surface", "text", "textMuted", "motif"].map((k) =>
        palette[k] ? <div key={k} className="flex-1" style={{ background: palette[k] }} title={k} /> : null
      )}
    </div>
  );
}

export default function QuickThemePage() {
  const router = useRouter();
  const fromImage = useFromImage();
  const upload = useUploadImageAsset();
  const saveWallpaper = useSaveWallpaper();
  const saveTheme = useSaveTheme();

  const [step, setStep] = React.useState(1);
  const [festivalId, setFestivalId] = React.useState<string>();
  const [file, setFile] = React.useState<File | null>(null);
  const [existingId, setExistingId] = React.useState<string>();
  const [wallpaperId, setWallpaperId] = React.useState<string>();
  const [image, setImage] = React.useState<File | null>(null);
  const [options, setOptions] = React.useState<GeneratorOption[]>([]);
  const [picked, setPicked] = React.useState<number>();
  const [engine, setEngine] = React.useState<string>();
  const [iconPackId, setIconPackId] = React.useState<string>();
  const [fontId, setFontId] = React.useState<string>();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string>();

  const existing = useWallpaper(existingId);

  const generate = async (img: File) => {
    setBusy(true);
    setError(undefined);
    try {
      const res = await fromImage.mutateAsync({ image: img, festivalId, seed: randomSeed() });
      const opts = ((res?.options ?? []) as unknown as GeneratorOption[]).slice(0, 6);
      if (opts.length === 0) throw new Error("No palette candidates returned");
      setOptions(opts);
      setPicked(undefined);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Generation failed");
      return false;
    } finally {
      setBusy(false);
    }
  };

  const chosen = picked !== undefined ? options[picked] : undefined;

  // Why Next is disabled (undefined = valid).
  const blocker: string | undefined = (() => {
    if (busy) return "Working...";
    if (step === 1) {
      if (!festivalId) return "Pick a festival";
      if (!file && !existingId) return "Upload an image or pick a wallpaper";
      if (existingId && !file && !existing.data) return "Loading wallpaper...";
    }
    if (step === 2 && !chosen) return "Pick a palette";
    if (step === 4 && !fontId) return "Pick a clock font";
    return undefined;
  })();

  const next = async () => {
    if (blocker) return;
    if (step === 1) {
      setBusy(true);
      setError(undefined);
      try {
        let img = file;
        let wid = existingId;
        if (file) {
          // Re-upload only if the file changed since the last time.
          if (image !== file || !wallpaperId) {
            const result = await upload.mutateAsync({ file, variants: "wallpaper" });
            const base = file.name.replace(/\.[^.]+$/, "");
            wid = `${slugify(base) || "wallpaper"}-${result.sha256.slice(0, 6)}`;
            await saveWallpaper.mutateAsync({
              id: wid,
              isNew: true,
              data: { id: wid, name: { en: base }, kind: "image", image: toWallpaperImage(result), festivalId },
            });
          } else wid = wallpaperId;
        } else {
          const raw = existing.data?.data;
          const d = (typeof raw === "string" ? JSON.parse(raw) : raw) as { image?: WallpaperImage } | null;
          const url = d?.image?.sizes?.[0]?.asset.url;
          if (!url) throw new Error("That wallpaper has no image to derive a palette from");
          // no-store: an <img> may have cached this file without CORS headers.
          const blob = await (await fetch(assetSrc(url), { cache: "no-store" })).blob();
          img = new File([blob], `${existingId}.webp`, { type: blob.type || "image/webp" });
        }
        setWallpaperId(wid);
        setImage(img);
        if (!(await generate(img!))) return;
        setStep(2);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Upload failed");
      } finally {
        setBusy(false);
      }
      return;
    }
    if (step < 5) setStep(step + 1);
  };

  const back = () => (step > 1 ? setStep(step - 1) : router.push("/themes"));

  const create = async () => {
    if (!chosen || !festivalId || !wallpaperId || !fontId) return;
    const data = {
      ...chosen.data,
      festivalId,
      wallpaperIds: [wallpaperId],
      ...(iconPackId ? { iconPackId } : {}),
      fonts: { ...chosen.data.fonts, display: fontId },
      scene: engine ? { ...chosen.data.scene, engine } : chosen.data.scene,
    };
    try {
      const created = await saveTheme.mutateAsync({ id: data.id, data, isNew: true });
      toast.success("Draft theme created");
      router.push(`/themes/edit/?id=${encodeURIComponent(created.id)}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create theme");
    }
  };

  const onKey = React.useRef<(e: KeyboardEvent) => void>(() => {});
  onKey.current = (e) => {
    if (e.defaultPrevented) return;
    if (e.key === "Escape") router.push("/themes");
    else if (e.key === "Enter" && (e.target === document.body || (e.target as HTMLElement).tagName === "DIV")) {
      if (step === 5) void create();
      else void next();
    }
  };
  React.useEffect(() => {
    const h = (e: KeyboardEvent) => onKey.current(e);
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild className="h-8 w-8">
          <Link href="/themes" aria-label="Back to themes">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <Zap className="h-6 w-6 text-primary" />
            Quick theme
          </h1>
          <p className="text-xs text-muted-foreground">Wallpaper to draft theme in five steps. No AI keys needed.</p>
        </div>
      </div>

      <Card className="p-2 shadow-2xs">
        <Stepper currentStep={step} steps={STEPS} />
      </Card>

      <Card className="space-y-5 p-6">
        {step === 1 && (
          <>
            <RelationSelect kind="festivals" label="Festival" value={festivalId} onChange={setFestivalId} />
            <div className="space-y-1.5">
              <label htmlFor="quick-image" className="text-sm font-medium">
                Upload an image
              </label>
              <input
                id="quick-image"
                data-testid="quick-image-input"
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="block w-full text-sm"
                onChange={(e) => {
                  setFile(e.target.files?.[0] ?? null);
                  if (e.target.files?.[0]) setExistingId(undefined);
                }}
              />
              {file && <p className="text-xs text-muted-foreground">{file.name}</p>}
            </div>
            <p className="text-center text-xs text-muted-foreground">or</p>
            <RelationSelect
              kind="wallpapers"
              label="Existing wallpaper"
              optional
              value={existingId}
              onChange={(v) => {
                setExistingId(v);
                if (v) setFile(null);
              }}
            />
          </>
        )}

        {step === 2 && (
          <>
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">Pick a palette</h2>
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                disabled={busy || !image}
                onClick={() => image && generate(image)}
              >
                <RefreshCw className={cn("h-3.5 w-3.5", busy && "animate-spin")} />
                Reshuffle
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {busy
                ? Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-24 rounded-lg" />)
                : options.map((o, i) => (
                    <button
                      key={`${o.seed}-${i}`}
                      type="button"
                      aria-pressed={picked === i}
                      onClick={() => setPicked(i)}
                      className={cn(
                        "space-y-2 rounded-lg border p-2 text-left transition-all hover:border-primary/50",
                        picked === i && "border-primary ring-2 ring-primary/40"
                      )}
                    >
                      <Swatches palette={o.data.palette as unknown as Record<string, string>} />
                      <p className="truncate text-xs font-medium">{o.data.name?.en || o.data.id}</p>
                    </button>
                  ))}
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <p className="text-sm text-muted-foreground">
              Keeping the generated scene ({chosen?.data.scene?.engine ?? "layers"}). Optionally switch the engine.
            </p>
            <EngineSelect
              label="Engine"
              value={engine ?? chosen?.data.scene?.engine ?? "layers"}
              onChange={setEngine}
            />
            {engine && (
              <Button variant="ghost" size="sm" onClick={() => setEngine(undefined)}>
                Keep generated scene
              </Button>
            )}
          </>
        )}

        {step === 4 && (
          <>
            <RelationSelect kind="iconPacks" label="Icon pack" optional value={iconPackId} onChange={setIconPackId} />
            <RelationSelect kind="fonts" label="Clock font" value={fontId} onChange={setFontId} />
          </>
        )}

        {step === 5 && chosen && (
          <div className="space-y-3 text-sm">
            <Swatches palette={chosen.data.palette as unknown as Record<string, string>} />
            <dl className="grid grid-cols-[8rem_1fr] gap-y-1">
              <dt className="text-muted-foreground">Festival</dt>
              <dd>{festivalId}</dd>
              <dt className="text-muted-foreground">Wallpaper</dt>
              <dd>{wallpaperId}</dd>
              <dt className="text-muted-foreground">Scene</dt>
              <dd>{engine ?? chosen.data.scene?.engine}</dd>
              <dt className="text-muted-foreground">Icon pack</dt>
              <dd>{iconPackId ?? "None"}</dd>
              <dt className="text-muted-foreground">Clock font</dt>
              <dd>{fontId}</dd>
            </dl>
          </div>
        )}

        {error && (
          <div role="alert" className="flex items-center justify-between rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
            <span>{error}</span>
            <Button size="sm" variant="outline" onClick={next} disabled={busy}>
              Retry
            </Button>
          </div>
        )}
      </Card>

      <div className="flex items-center justify-between">
        <Button variant="outline" onClick={back} disabled={busy}>
          Back
        </Button>
        <div className="flex items-center gap-3">
          {blocker && !busy && <span className="text-xs text-muted-foreground">{blocker}</span>}
          {step < 5 ? (
            <Button onClick={next} disabled={Boolean(blocker)} className="gap-2">
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              Next
            </Button>
          ) : (
            <Button onClick={create} disabled={saveTheme.isPending}>
              Create draft theme
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
