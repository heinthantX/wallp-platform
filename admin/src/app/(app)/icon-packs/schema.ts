import * as z from "zod";
import type { AssetFormat } from "@/lib/catalog/types";

export const TILE_SHAPES = ["squircle", "circle", "square", "leaf"] as const;
const hex = z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Must be #RRGGBB");
const optHex = z.union([z.literal(""), hex]).optional();

const asset = z.object({ url: z.string(), sha256: z.string(), bytes: z.number(), format: z.custom<AssetFormat>((v) => typeof v === "string") });

export const iconPackSchema = z.object({
  id: z
    .string()
    .min(1, "ID is required")
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Must be lowercase kebab-case"),
  festivalId: z.string().optional(),
  name: z.object({ en: z.string().min(1, "English name is required") }).catchall(z.string()),
  style: z.record(z.string()).optional(),
  kind: z.literal("images"),
  shape: z.enum(TILE_SHAPES),
  tile: optHex,
  glyph: optHex,
  ring: optHex,
  // Optional: "no background" packs are transparent (no background image, no tile colour).
  background: z
    .object({
      url: z.string(),
      sha256: z.string(),
      bytes: z.number(),
      format: z.enum(["png", "webp"]),
    })
    .nullable()
    .optional(),
  apps: z.record(asset).optional(),
  appsFallbackStyle: z.string().optional(),
});

export type IconPackForm = z.infer<typeof iconPackSchema>;

export const defaultIconPack = {
  id: "",
  name: { en: "" },
  style: {},
  kind: "images",
  shape: "squircle",
  tile: "#1b1b2f",
  glyph: "#ffffff",
  ring: "#ffffff",
} as IconPackForm;
