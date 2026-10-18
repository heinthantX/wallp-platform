"use client";

import * as React from "react";
import { Plus, Trash2, Upload } from "lucide-react";
import type { Layer, Palette, Accent, Asset } from "@/lib/catalog/types";
import { ColorField } from "@/components/fields";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { resolveColor } from "@/components/preview/LayersCanvas";
import { useAssets, useUploadImageAsset, assetSrc } from "@/lib/api/hooks/useAssets";
import { cn } from "@/lib/utils";
import { TOKENS } from "./schema";

export type Patch = (p: Record<string, unknown>) => void;
export interface FormCtx {
  allowTokens: boolean;
  palette: Palette;
  accent?: Accent;
  err: (field: string) => string | undefined;
}

const selectCls =
  "h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

function Num({
  label,
  value,
  onChange,
  error,
  step = 0.05,
  placeholder,
}: {
  label: string;
  value: number | undefined;
  onChange: (v: number | undefined) => void;
  error?: string;
  step?: number;
  placeholder?: string;
}) {
  return (
    <Field label={label} error={error}>
      <Input
        type="number"
        step={step}
        aria-label={label}
        aria-invalid={!!error}
        value={value ?? ""}
        placeholder={placeholder}
        className={cn(error && "border-destructive focus-visible:ring-destructive")}
        onChange={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value))}
      />
    </Field>
  );
}

function Pick<T extends string>({
  label,
  value,
  options,
  onChange,
  error,
}: {
  label: string;
  value: T | undefined;
  options: readonly T[];
  onChange: (v: T) => void;
  error?: string;
}) {
  return (
    <Field label={label} error={error}>
      <select aria-label={label} className={selectCls} value={value} onChange={(e) => onChange(e.target.value as T)}>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </Field>
  );
}

function ColorInput({
  label,
  value,
  onChange,
  ctx,
  error,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  ctx: FormCtx;
  error?: string;
}) {
  return (
    <div className="space-y-1">
      <ColorField
        label={label}
        value={resolveColor(value, ctx.palette, ctx.accent)}
        onChange={onChange}
        error={error}
      />
      {ctx.allowTokens && (
        <div className="flex flex-wrap gap-1">
          {TOKENS.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => onChange(t)}
              aria-pressed={value === t}
              className={cn(
                "rounded-full border px-2 py-0.5 font-mono text-[10px] transition-colors hover:bg-accent",
                value === t && "border-primary bg-primary/10 text-primary"
              )}
            >
              {t}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function PolygonEditor({
  points,
  onChange,
  error,
}: {
  points: [number, number][];
  onChange: (p: [number, number][]) => void;
  error?: string;
}) {
  const svg = React.useRef<SVGSVGElement>(null);
  const drag = React.useRef<number | null>(null);
  const S = 160;
  const clamp = (n: number) => Math.min(1, Math.max(0, Math.round(n * 100) / 100));
  const at = (e: React.PointerEvent | React.MouseEvent): [number, number] => {
    const r = svg.current!.getBoundingClientRect();
    return [clamp((e.clientX - r.left) / (r.width || S)), clamp((e.clientY - r.top) / (r.height || S))];
  };
  const set = (i: number, k: 0 | 1, v: number | undefined) =>
    onChange(points.map((p, j) => (j === i ? (k ? [p[0], clamp(v ?? 0)] : [clamp(v ?? 0), p[1]]) : p)) as [number, number][]);

  return (
    <Field label="Polygon points (click to add, alt-click a point to remove)" error={error}>
      <svg
        ref={svg}
        viewBox={`0 0 ${S} ${S}`}
        width={S}
        height={S}
        data-testid="polygon-canvas"
        className={cn("touch-none rounded-md border bg-muted/40", error && "border-destructive")}
        onClick={(e) => {
          if (e.target === svg.current) onChange([...points, at(e)]);
        }}
        onPointerMove={(e) => {
          if (drag.current !== null) onChange(points.map((p, j) => (j === drag.current ? at(e) : p)));
        }}
        onPointerUp={() => (drag.current = null)}
        onPointerLeave={() => (drag.current = null)}
      >
        <polygon
          points={points.map(([x, y]) => `${x * S},${y * S}`).join(" ")}
          className="fill-primary/20 stroke-primary"
          pointerEvents="none"
        />
        {points.map(([x, y], i) => (
          <circle
            key={i}
            data-testid={`polygon-point-${i}`}
            cx={x * S}
            cy={y * S}
            r={6}
            className="cursor-grab fill-background stroke-primary"
            strokeWidth={2}
            onPointerDown={(e) => {
              e.stopPropagation();
              if (e.altKey) onChange(points.filter((_, j) => j !== i));
              else drag.current = i;
            }}
            onClick={(e) => e.stopPropagation()}
          />
        ))}
      </svg>
      <div className="grid grid-cols-2 gap-1.5 pt-1">
        {points.map((p, i) => (
          <div key={i} className="flex items-center gap-1">
            <Input type="number" step={0.05} aria-label={`Point ${i + 1} x`} value={p[0]} className="h-7 px-1.5 text-xs" onChange={(e) => set(i, 0, Number(e.target.value))} />
            <Input type="number" step={0.05} aria-label={`Point ${i + 1} y`} value={p[1]} className="h-7 px-1.5 text-xs" onChange={(e) => set(i, 1, Number(e.target.value))} />
          </div>
        ))}
      </div>
    </Field>
  );
}

function AssetPicker({ value, onChange, error }: { value?: Asset; onChange: (a: Asset) => void; error?: string }) {
  const [open, setOpen] = React.useState(false);
  const { data, isLoading } = useAssets({ perPage: 40 });
  const upload = useUploadImageAsset();
  const pick = (a: Asset) => {
    onChange({ url: a.url, sha256: a.sha256, bytes: a.bytes, format: a.format as Asset["format"] });
    setOpen(false);
  };
  return (
    <Field label="Image asset" error={error}>
      <div className="flex items-center gap-2">
        {value?.url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={assetSrc(value.url)} alt="" className="h-12 w-12 rounded border object-cover" />
        )}
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button type="button" variant="outline" size="sm">
              {value ? "Change" : "Pick from library"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-72" align="start">
            {isLoading ? (
              <p className="text-xs text-muted-foreground">Loading assets...</p>
            ) : !data?.items?.length ? (
              <p className="text-xs text-muted-foreground">No assets yet. Upload one.</p>
            ) : (
              <div className="grid max-h-60 grid-cols-4 gap-1.5 overflow-auto">
                {data.items.map((a) => (
                  <button key={a.sha256} type="button" title={a.sha256.slice(0, 8)} onClick={() => pick(a as unknown as Asset)} className="aspect-square overflow-hidden rounded border hover:ring-2 hover:ring-primary">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={assetSrc(a.url)} alt="" className="h-full w-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </PopoverContent>
        </Popover>
        <label className="inline-flex h-8 cursor-pointer items-center gap-1 rounded-md border px-3 text-xs hover:bg-accent">
          <Upload className="h-3.5 w-3.5" />
          {upload.isPending ? "Uploading..." : "Upload"}
          <input
            type="file"
            accept="image/*"
            className="sr-only"
            data-testid="layer-image-upload"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              const r = await upload.mutateAsync({ file });
              if (r) pick(r as unknown as Asset);
            }}
          />
        </label>
      </div>
    </Field>
  );
}

export function LayerForm({ layer, patch, ctx }: { layer: Layer; patch: Patch; ctx: FormCtx }) {
  const { err } = ctx;
  const opacity = (
    <Num label="Opacity" value={layer.opacity ?? 1} onChange={(v) => patch({ opacity: v })} error={err("opacity")} />
  );

  if (layer.type === "gradient")
    return (
      <div className="space-y-3">
        {layer.colors.map((c, i) => (
          <div key={i} className="flex items-start gap-2">
            <div className="flex-1">
              <ColorInput
                label={`Colour ${i + 1}`}
                value={c}
                ctx={ctx}
                onChange={(v) => patch({ colors: layer.colors.map((x, j) => (j === i ? v : x)) })}
                error={err(`colors.${i}`)}
              />
            </div>
            <Button type="button" variant="ghost" size="icon" aria-label={`Remove colour ${i + 1}`} onClick={() => patch({ colors: layer.colors.filter((_, j) => j !== i) })}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
        {err("colors") && <p className="text-xs text-destructive">{err("colors")}</p>}
        <Button type="button" variant="outline" size="sm" onClick={() => patch({ colors: [...layer.colors, layer.colors.at(-1) ?? "#000000"] })}>
          <Plus className="mr-1 h-3.5 w-3.5" /> Add colour
        </Button>
        <div className="grid grid-cols-2 gap-3">
          <Num label="Angle" step={5} value={layer.angle ?? 180} onChange={(v) => patch({ angle: v })} error={err("angle")} />
          {opacity}
        </div>
      </div>
    );

  if (layer.type === "shape")
    return (
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Pick
            label="Shape"
            value={layer.shape}
            options={["circle", "ellipse", "rect", "polygon"] as const}
            onChange={(shape) =>
              patch({ shape, points: shape === "polygon" ? layer.points ?? [[0.5, 0], [1, 1], [0, 1]] : undefined })
            }
          />
          <Pick label="Motion" value={layer.motion ?? "none"} options={["none", "float", "pulse", "sway"] as const} onChange={(motion) => patch({ motion })} />
          <Num label="X" value={layer.x} onChange={(v) => patch({ x: v })} error={err("x")} />
          <Num label="Y" value={layer.y} onChange={(v) => patch({ y: v })} error={err("y")} />
          <Num label="Width" value={layer.width} onChange={(v) => patch({ width: v })} error={err("width")} />
          <Num label="Aspect" value={layer.aspect ?? 1} onChange={(v) => patch({ aspect: v })} error={err("aspect")} />
          {opacity}
          <div className="flex items-end gap-2 pb-2">
            <Switch checked={!!layer.glow} onCheckedChange={(glow) => patch({ glow })} aria-label="Glow" />
            <Label className="text-xs">Glow</Label>
          </div>
        </div>
        <ColorInput label="Colour" value={layer.color} ctx={ctx} onChange={(color) => patch({ color })} error={err("color")} />
        {layer.shape === "polygon" && (
          <PolygonEditor points={layer.points ?? []} onChange={(points) => patch({ points })} error={err("points")} />
        )}
      </div>
    );

  if (layer.type === "image")
    return (
      <div className="space-y-3">
        <AssetPicker value={layer.image} onChange={(image) => patch({ image })} error={err("image")} />
        <div className="grid grid-cols-2 gap-3">
          <Pick label="Fit" value={layer.fit ?? "width"} options={["width", "cover", "contain"] as const} onChange={(fit) => patch({ fit })} />
          <Pick label="Anchor" value={layer.anchor ?? "bottom"} options={["top", "center", "bottom"] as const} onChange={(anchor) => patch({ anchor })} />
          {opacity}
        </div>
      </div>
    );

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <Pick
          label="Effect"
          value={layer.effect}
          options={["snow", "rain", "drops", "bats", "lanterns", "petals", "sparkles", "stars"] as const}
          onChange={(effect) => patch({ effect })}
        />
        <Num label="Count" step={1} value={layer.count} onChange={(v) => patch({ count: v })} error={err("count")} />
        <Num label="Speed" value={layer.speed ?? 0.5} onChange={(v) => patch({ speed: v })} error={err("speed")} />
        <Num label="Size" value={layer.size ?? 0.5} onChange={(v) => patch({ size: v })} error={err("size")} />
        {opacity}
      </div>
      <ColorInput label="Colour" value={layer.color} ctx={ctx} onChange={(color) => patch({ color })} error={err("color")} />
    </div>
  );
}
