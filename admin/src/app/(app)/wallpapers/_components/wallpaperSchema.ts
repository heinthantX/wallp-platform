import * as z from "zod";
import type { Wallpaper } from "@/lib/catalog/types";

const assetSchema = z.object({
  url: z.string(),
  sha256: z.string(),
  bytes: z.number(),
  format: z.string(),
});

export const wallpaperSchema = z
  .object({
    id: z
      .string()
      .min(1, "ID is required")
      .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Must be lowercase kebab-case (e.g. night-sky)"),
    name: z.object({ en: z.string().min(1, "English name is required") }).catchall(z.string()),
    festivalId: z.string().optional(),
    kind: z.enum(["image", "scene"]),
    tags: z.array(z.string()).optional(),
    image: z
      .object({
        sizes: z.array(
          z.object({ width: z.number(), height: z.number(), asset: assetSchema })
        ),
        blurhash: z.string().optional(),
        dominant: z.string().optional(),
      })
      .optional(),
    scene: z.object({ engine: z.string(), params: z.record(z.unknown()) }).optional(),
  })
  .superRefine((v, ctx) => {
    if (v.kind === "image" && !v.image?.sizes?.length) {
      ctx.addIssue({ code: "custom", path: ["image"], message: "Upload an image first" });
    }
    if (v.kind === "scene") {
      const layers = (v.scene?.params as { layers?: unknown } | undefined)?.layers;
      if (!Array.isArray(layers) || layers.length === 0) {
        ctx.addIssue({ code: "custom", path: ["scene"], message: "Scene needs at least one layer" });
      } else if (/"@[a-zA-Z]/.test(JSON.stringify(v.scene))) {
        ctx.addIssue({
          code: "custom",
          path: ["scene"],
          message: "Scene wallpapers use hex colours only (no @tokens)",
        });
      }
    }
  });

export type WallpaperFormData = z.infer<typeof wallpaperSchema>;

export const defaultScene: NonNullable<Wallpaper["scene"]> = {
  engine: "layers",
  params: {
    layers: [{ type: "gradient", colors: ["#1b1035", "#05020d"], angle: 180 }],
  },
};

export const defaultWallpaper: WallpaperFormData = {
  id: "",
  name: { en: "" },
  kind: "image",
  tags: [],
};
