"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, Loader2, Sparkles, Zap } from "lucide-react";
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
  useFonts,
  useUploadImageAsset,
  useWallpaper,
  useWallpapers,
} from "@/lib/api/hooks";
import { useAiStatus } from "@/lib/api/hooks/useAiStatus";
import { useAiScene } from "@/lib/api/hooks/useAiImages";
import { useAiSuggest, type AiSuggestion } from "@/lib/api/hooks/useAiSuggest";
import type { GeneratorOption } from "@/lib/generator/types";
import type { WallpaperImage } from "@/lib/catalog/types";
import { cn } from "@/lib/utils";
import { LayersCanvas } from "@/components/preview";
import { NEUTRAL_PALETTE } from "../../wallpapers/_components/WallpaperEditor";
import { toWallpaperImage } from "../../wallpapers/_components/UploadZone";

const STEPS = [
  { id: 1, title: "Wallpaper", description: "Festival and image" },
  { id: 2, title: "Icon pack", description: "Required" },
  { id: 3, title: "Font", description: "Search and preview" },
  { id: 4, title: "Live scene", description: "Optional" },
  { id: 5, title: "Create", description: "Save as draft" },
];

const randomSeed = () => Math.floor(Math.random() * 2147483647);

function parseData<T>(raw: unknown): T | null {
  try {
    return (typeof raw === "string" ? JSON.parse(raw) : raw) as T | null;
  } catch {
    return null;
  }
}

function EmptyState({ noun, href, cta }: { noun: string; href: string; cta: string }) {
  return (
    <p className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
      No {noun} yet.{" "}
      <Link className="underline" href={href}>
        {cta}
      </Link>
    </p>
  );
}

function WallpaperGrid({ value, onChange }: { value?: string; onChange: (id: string) => void }) {
  const { data, isLoading, isError, refetch } = useWallpapers({ perPage: 100 });
  const [q, setQ] = React.useState("");
  if (isLoading)
    return (
      <div className="grid grid-cols-3 gap-3" data-testid="wallpaper-skeleton">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-28 rounded-lg" />
        ))}
      </div>
    );
  if (isError)
    return (
      <div role="alert" className="flex items-center justify-between rounded-md border border-destructive/40 p-3 text-sm text-destructive">
        Could not load wallpapers.
        <Button size="sm" variant="outline" onClick={() => refetch()}>
          Retry
        </Button>
      </div>
    );
  const items = (data?.items ?? []).map((i) => {
    const d = parseData<{ name?: { en?: string }; image?: WallpaperImage; scene?: { engine?: string } }>(i.data);
    return { id: i.id, name: d?.name?.en || i.id, thumb: d?.image?.sizes?.[0]?.asset.url, scene: d?.scene?.engine ? d.scene : undefined };
  });
  if (items.length === 0)
    return <EmptyState noun="wallpapers" href="/wallpapers/new" cta="Create a wallpaper" />;
  const shown = items.filter((i) => `${i.name} ${i.id}`.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <div className="space-y-2">
      <input
        aria-label="Search wallpapers"
        placeholder="Search wallpapers by name"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        className="h-9 w-full rounded-md border bg-transparent px-3 text-sm"
      />
      <div className="grid max-h-72 grid-cols-2 gap-3 overflow-y-auto sm:grid-cols-3">
        {shown.map((i) => (
          <button
            key={i.id}
            type="button"
            aria-pressed={value === i.id}
            data-wallpaper-id={i.id}
            onClick={() => onChange(i.id)}
            className={cn(
              "space-y-1 rounded-lg border p-1.5 text-left transition-all hover:border-primary/50",
              value === i.id && "border-primary ring-2 ring-primary/40"
            )}
          >
            {i.thumb ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={assetSrc(i.thumb)} alt="" className="h-24 w-full rounded-md object-cover" />
            ) : i.scene ? (
              <div className="h-24 overflow-hidden rounded-md [&_canvas]:h-full [&_canvas]:w-full [&_canvas]:object-cover">
                <LayersCanvas scene={i.scene as never} palette={NEUTRAL_PALETTE} width={160} height={96} animate={false} />
              </div>
            ) : (
              <div className="h-24 rounded-md bg-muted" />
            )}
            <p className="truncate text-xs font-medium">{i.name}</p>
          </button>
        ))}
        {shown.length === 0 && <p className="col-span-full text-sm text-muted-foreground">No matches.</p>}
      </div>
    </div>
  );
}

type AiPick = { id: string; scene: GeneratorOption["data"]["scene"]; suggestion?: AiSuggestion };

function DescribePanel({ festivalId, pick, onPick, onError }: { festivalId?: string; pick?: AiPick; onPick: (p: AiPick) => void; onError: (m?: string) => void }) {
  const { data, isLoading } = useAiStatus();
  const suggest = useAiSuggest();
  const scene = useAiScene();
  const saveWallpaper = useSaveWallpaper();
  const [text, setText] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const providers = data?.providers ?? [];
  const ok = (ids: string[]) => providers.some((p) => ids.includes(p.id) && p.configured);
  const why = isLoading
    ? "Checking AI status..."
    : !ok(["openrouter", "gemini"]) || !ok(["cloudflare"])
      ? `Set ${providers.find((p) => p.id === "cloudflare")?.envKeys?.join(" and ") || "CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_AI_TOKEN"} and a text AI key (OpenRouter or Gemini) to enable`
      : null;

  const run = async () => {
    const description = text.trim();
    if (!description || why || busy) return;
    setBusy(true);
    onError(undefined);
    try {
      const [s, sg] = await Promise.allSettled([
        scene.mutateAsync({ description, withArt: true }),
        suggest.mutateAsync({ description, kind: "theme" }),
      ]);
      if (s.status === "rejected") throw s.reason;
      const suggestion = sg.status === "fulfilled" ? sg.value : undefined;
      const name = suggestion?.names?.[0]?.en || s.value.name;
      const id = `${slugify(name) || "ai-scene"}-${Math.random().toString(16).slice(2, 8).padEnd(6, "0")}`;
      await saveWallpaper.mutateAsync({
        id,
        isNew: true,
        data: { id, name: { en: name }, kind: "scene", scene: s.value.scene, festivalId },
      });
      onPick({ id, scene: s.value.scene as AiPick["scene"], suggestion });
    } catch (e) {
      onError(e instanceof Error ? e.message : "AI generation failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2">
      <label htmlFor="quick-describe" className="text-sm font-medium">
        Describe with AI
      </label>
      <textarea
        id="quick-describe"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            void run();
          }
        }}
        rows={3}
        maxLength={500}
        disabled={Boolean(why)}
        placeholder="Warm lantern-lit Diwali night, deep indigo sky with golden sparks"
        className="w-full rounded-md border bg-transparent px-3 py-2 text-sm disabled:opacity-60"
      />
      <div className="flex items-center gap-3">
        <Button type="button" size="sm" onClick={run} disabled={!text.trim() || Boolean(why) || busy} className="gap-2">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {pick && !busy ? "Try again" : "Generate"}
        </Button>
        <span className="text-xs text-muted-foreground">{busy ? "Designing theme... (art can take ~20 s)" : why}</span>
      </div>
      {pick && (
        <div data-wallpaper-id={pick.id} className="overflow-hidden rounded-lg border animate-in fade-in [&_canvas]:h-auto [&_canvas]:w-full">
          <LayersCanvas scene={pick.scene as never} palette={NEUTRAL_PALETTE} width={320} height={192} animate={false} />
        </div>
      )}
    </div>
  );
}

function FontPicker({ value, onChange }: { value?: string; onChange: (id: string) => void }) {
  const { data, isLoading, isError, refetch } = useFonts({ perPage: 100 });
  const [q, setQ] = React.useState("");
  if (isLoading)
    return (
      <div className="space-y-2">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-10 rounded-md" />
        ))}
      </div>
    );
  if (isError)
    return (
      <div role="alert" className="flex items-center justify-between rounded-md border border-destructive/40 p-3 text-sm text-destructive">
        Could not load fonts.
        <Button size="sm" variant="outline" onClick={() => refetch()}>
          Retry
        </Button>
      </div>
    );
  const items = (data?.items ?? []).map((i) => {
    const d = parseData<{ family?: string; name?: { en?: string } }>(i.data);
    return { id: i.id, family: d?.family || d?.name?.en || i.id };
  });
  if (items.length === 0) return <EmptyState noun="fonts" href="/fonts/new" cta="Import fonts" />;
  const needle = q.trim().toLowerCase();
  const shown = items.filter((i) => `${i.family} ${i.id}`.toLowerCase().includes(needle));
  const sel = items.find((i) => i.id === value);
  return (
    <div className="space-y-3">
      <input
        aria-label="Search fonts"
        placeholder="Search fonts by family"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        className="h-9 w-full rounded-md border bg-transparent px-3 text-sm"
      />
      <ul className="max-h-64 space-y-1 overflow-y-auto" aria-label="Fonts">
        {shown.map((i) => (
          <li key={i.id}>
            <button
              type="button"
              aria-pressed={value === i.id}
              onClick={() => onChange(i.id)}
              className={cn(
                "flex w-full items-center justify-between rounded-md border px-3 py-2 text-left text-sm hover:border-primary/50",
                value === i.id && "border-primary ring-2 ring-primary/40"
              )}
            >
              <span style={{ fontFamily: `"${i.family}", sans-serif` }}>{i.family}</span>
              <span className="font-mono text-[11px] text-muted-foreground">{i.id}</span>
            </button>
          </li>
        ))}
        {shown.length === 0 && <li className="text-sm text-muted-foreground">No matches.</li>}
      </ul>
      {sel && (
        <p data-testid="font-preview" className="rounded-md border p-3 text-2xl" style={{ fontFamily: `"${sel.family}", sans-serif` }}>
          12:45 {sel.family}
        </p>
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
  const [engine, setEngine] = React.useState<string>();
  const [iconPackId, setIconPackId] = React.useState<string>();
  const [fontId, setFontId] = React.useState<string>();
  const [wallpaperScene, setWallpaperScene] = React.useState<GeneratorOption["data"]["scene"]>();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string>();
  const [aiPick, setAiPick] = React.useState<AiPick>();

  const existing = useWallpaper(existingId);

  const generate = async (img: File) => {
    setBusy(true);
    setError(undefined);
    try {
      const res = await fromImage.mutateAsync({ image: img, festivalId, seed: randomSeed() });
      const opts = (res?.options ?? []) as unknown as GeneratorOption[];
      if (opts.length === 0) throw new Error("Could not derive colours from this wallpaper");
      setOptions(opts.slice(0, 1));
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Generation failed");
      return false;
    } finally {
      setBusy(false);
    }
  };

  const chosen = options[0];

  // Why Next is disabled (undefined = valid).
  const blocker: string | undefined = (() => {
    if (busy) return "Working...";
    if (step === 1) {
      if (!file && !existingId) return "Pick a wallpaper or upload an image";
      if (existingId && !file && !existing.data) return "Loading wallpaper...";
    }
    if (step === 2 && !iconPackId) return "Pick an icon pack";
    if (step === 3 && !fontId) return "Pick a font";
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
        } else if (aiPick && aiPick.id === existingId) {
          const layer = ((aiPick.scene?.params as { layers?: unknown[] } | undefined)?.layers?.[0] ?? {}) as { type?: string; asset?: { url?: string } };
          setWallpaperScene(aiPick.scene);
          if (layer.type === "image" && layer.asset?.url) {
            // Prefer the generated art itself: the preview canvas can be CORS-tainted by it.
            const blob = await (await fetch(assetSrc(layer.asset.url), { cache: "no-store" })).blob();
            img = new File([blob], `${existingId}.webp`, { type: blob.type || "image/webp" });
          } else {
            const canvas = document.querySelector<HTMLCanvasElement>(`[data-wallpaper-id="${existingId}"] canvas`);
            const blob = canvas && (await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/png")));
            if (!blob) throw new Error("Could not read this scene's colours. Try again in a moment.");
            img = new File([blob], `${existingId}.png`, { type: "image/png" });
          }
        } else {
          const raw = existing.data?.data;
          const d = (typeof raw === "string" ? JSON.parse(raw) : raw) as
            | { image?: WallpaperImage; scene?: GeneratorOption["data"]["scene"] }
            | null;
          const url = d?.image?.sizes?.[0]?.asset.url;
          if (url) {
            // no-store: an <img> may have cached this file without CORS headers.
            const blob = await (await fetch(assetSrc(url), { cache: "no-store" })).blob();
            img = new File([blob], `${existingId}.webp`, { type: blob.type || "image/webp" });
            setWallpaperScene(undefined);
          } else if (d?.scene?.engine) {
            // Scene wallpapers have no image: sample the drawn thumbnail, and the theme reuses the scene.
            const canvas = document.querySelector<HTMLCanvasElement>(`[data-wallpaper-id="${existingId}"] canvas`);
            const blob = canvas && (await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/png")));
            if (!blob) throw new Error("Could not read this scene's colours. Try again in a moment.");
            img = new File([blob], `${existingId}.png`, { type: "image/png" });
            setWallpaperScene(d.scene);
          } else {
            throw new Error("That wallpaper has no image or scene to derive a palette from");
          }
        }
        setWallpaperId(wid);
        setImage(img);
        // Palette and accents are derived silently from the wallpaper's colours.
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
    if (!chosen || !wallpaperId || !fontId || !iconPackId) return;
    const ai = aiPick?.id === wallpaperId ? aiPick.suggestion : undefined;
    const aiName = ai?.names?.[0];
    const data = {
      ...chosen.data,
      ...(aiName && { name: { en: aiName.en, ...(aiName.my && { my: aiName.my }) } }),
      ...(ai?.tags?.length && { tags: ai.tags }),
      ...(ai?.subtitle?.en && { subtitle: { en: ai.subtitle.en } }),
      festivalId: festivalId ?? "",
      wallpaperIds: [wallpaperId],
      iconPackId,
      fonts: { ...chosen.data.fonts, display: fontId },
      scene: engine ? { ...(wallpaperScene ?? chosen.data.scene), engine } : (wallpaperScene ?? chosen.data.scene),
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
    if (e.key === "Escape") {
      if (!busy) back();
    }
    else if (e.key === "Enter" && (e.target === document.body || (e.target as HTMLElement).tagName === "DIV")) {
      if (step === 5) void create();
      else if (busy) return;
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
          <p className="text-xs text-muted-foreground">Describe it or pick a wallpaper; icon pack and font to a draft theme. Colours are derived automatically.</p>
        </div>
      </div>

      <Card className="p-2 shadow-2xs">
        <Stepper currentStep={step} steps={STEPS} />
      </Card>

      <Card className="space-y-5 p-6">
        {step === 1 && (
          <>
            <RelationSelect kind="festivals" label="Festival" optional noneLabel="None (all year)" value={festivalId} onChange={(v) => setFestivalId(v || undefined)} />
            <WallpaperGrid
              value={existingId}
              onChange={(v) => {
                setExistingId(v);
                setFile(null);
              }}
            />
            <p className="text-center text-xs text-muted-foreground">or</p>
            <DescribePanel
              festivalId={festivalId}
              pick={aiPick}
              onError={setError}
              onPick={(p) => {
                setAiPick(p);
                setExistingId(p.id);
                setFile(null);
              }}
            />
            <p className="text-center text-xs text-muted-foreground">or</p>
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
          </>
        )}

        {step === 2 && (
          <RelationSelect kind="iconPacks" label="Icon pack" value={iconPackId} onChange={setIconPackId} />
        )}

        {step === 3 && <FontPicker value={fontId} onChange={setFontId} />}

        {step === 4 && (
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

        {step === 5 && chosen && (
          <div className="space-y-3 text-sm">
            <dl className="grid grid-cols-[8rem_1fr] gap-y-1">
              <dt className="text-muted-foreground">Festival</dt>
              <dd>{festivalId || "None"}</dd>
              <dt className="text-muted-foreground">Wallpaper</dt>
              <dd>{wallpaperId}</dd>
              <dt className="text-muted-foreground">Scene</dt>
              <dd>{engine ?? chosen.data.scene?.engine}</dd>
              <dt className="text-muted-foreground">Icon pack</dt>
              <dd>{iconPackId}</dd>
              <dt className="text-muted-foreground">Font</dt>
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
