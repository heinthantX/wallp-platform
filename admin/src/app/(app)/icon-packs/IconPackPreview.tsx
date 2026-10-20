"use client";

import * as React from "react";
import { Camera, Mail, MessageCircle, Landmark, Music, Map as MapIcon, Phone, Image as ImageIcon } from "lucide-react";
import { useAuthStore, apiBase } from "@/lib/auth/store";
import { assetSrc } from "@/lib/api/hooks/useAssets";
import { cn } from "@/lib/utils";
import { TILE_SHAPES } from "./schema";

export type TileShape = (typeof TILE_SHAPES)[number];

export function shapeStyle(shape: TileShape): React.CSSProperties {
  switch (shape) {
    case "circle":
      return { borderRadius: "50%" };
    case "square":
      return { borderRadius: "6px" };
    case "leaf":
      return { borderRadius: "50% 6px 50% 6px" };
    default:
      return { borderRadius: "32%" }; // squircle approximation
  }
}

// lucide icons stand in for real app logos (WhatsApp, Gmail, a bank app...)
const SAMPLES = [MessageCircle, Mail, Landmark, Camera, Music, MapIcon, Phone, ImageIcon];
const LOGO_COLORS = ["#25d366", "#ea4335", "#1d4ed8", "#f59e0b", "#ec4899", "#10b981", "#ffffff", "#111827"];

// Transparent packs: faint checkerboard so the empty tile stays visible on the dark backdrop.
const CHECKER = "repeating-conic-gradient(rgba(255,255,255,0.10) 0% 25%, rgba(255,255,255,0.03) 0% 50%)";

export function IconPackPreview({
  shape,
  onShapeChange,
  tile,
  glyph,
  ring,
  background,
  apps,
}: {
  shape: TileShape;
  onShapeChange?: (s: TileShape) => void;
  tile?: string;
  glyph?: string;
  ring?: string;
  background?: { sha256: string; format: string } | null;
  /** Per-app icons (sprite sheet / uploads): shown first, each as the whole tile. */
  apps?: Record<string, { url: string }> | null;
}) {
  const appIcons = Object.values(apps ?? {}).slice(0, SAMPLES.length);
  const apiUrl = apiBase(useAuthStore((s) => s.apiUrl));
  const none = !background && !tile;
  const bg = background ? `url(${apiUrl}/assets/${background.sha256}.${background.format})` : undefined;
  return (
    <div className="space-y-3">
      <div role="radiogroup" aria-label="Tile shape" className="flex gap-1">
        {TILE_SHAPES.map((s) => (
          <button
            key={s}
            type="button"
            role="radio"
            aria-checked={s === shape}
            aria-label={s}
            onClick={() => onShapeChange?.(s)}
            className={cn("rounded-md border px-2.5 py-1 text-xs capitalize transition-colors", s === shape ? "bg-primary text-primary-foreground" : "hover:bg-muted")}
          >
            {s}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-4 gap-4 rounded-xl bg-gradient-to-br from-slate-700 to-slate-900 p-4" data-testid="icon-preview" data-shape={shape} data-background={background ? "image" : tile ? "color" : "none"}>
        {appIcons.map((a, i) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={`app-${i}`} src={assetSrc(a.url)} alt="" data-testid="app-icon" style={{ ...shapeStyle(shape), transition: "border-radius 200ms" }} className="aspect-square w-full object-cover" />
        ))}
        {SAMPLES.slice(appIcons.length).map((Icon, i) => (
          <div
            key={i}
            data-testid="icon-tile"
            data-bg={background ? "image" : tile ? "color" : "none"}
            style={{
              ...shapeStyle(shape),
              backgroundColor: tile || undefined,
              backgroundImage: bg ?? (none ? CHECKER : undefined),
              backgroundSize: bg ? "cover" : none ? "12px 12px" : undefined,
              border: `2px solid ${ring || "transparent"}`,
              transition: "border-radius 200ms",
            }}
            className="flex aspect-square items-center justify-center"
          >
            <Icon className="h-1/2 w-1/2" style={{ color: i + appIcons.length < 6 ? LOGO_COLORS[i + appIcons.length] : glyph }} />
          </div>
        ))}
      </div>
    </div>
  );
}
