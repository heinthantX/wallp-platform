import * as z from "zod";
import type { Layer } from "@/lib/catalog/types";

export const TOKENS = ["@background", "@deep", "@surface", "@text", "@motif", "@accent"] as const;
export const PARTICLE_BUDGET = 200;

const HEX = /^#[0-9A-Fa-f]{6}$/;

/** Layer limits per wallp/docs/theme-api.md section 4.9. Tokens only when allowTokens (themes). */
export function layersSchema(allowTokens: boolean) {
  const color = z.string().refine(
    (c) => HEX.test(c) || (allowTokens && (TOKENS as readonly string[]).includes(c)),
    allowTokens ? "Use #RRGGBB or an @token" : "Use #RRGGBB (wallpapers have no @tokens)"
  );
  const opacity = z.number().min(0, "0 to 1").max(1, "0 to 1").optional();
  const unit = z.number().min(0, "0 to 1").max(1, "0 to 1");
  const asset = z.object({
    url: z.string().min(1),
    sha256: z.string().min(1),
    bytes: z.number(),
    format: z.string(),
  });
  return z.array(
    z.discriminatedUnion("type", [
      z.object({
        type: z.literal("gradient"),
        colors: z.array(color).min(2, "At least 2 colours"),
        angle: z.number().optional(),
        opacity,
      }),
      z.object({
          type: z.literal("shape"),
          shape: z.enum(["circle", "ellipse", "rect", "polygon"]),
          x: z.number().min(-0.5, "-0.5 to 1.5").max(1.5, "-0.5 to 1.5"),
          y: z.number().min(-0.5, "-0.5 to 1.5").max(1.5, "-0.5 to 1.5"),
          width: z.number().gt(0, "Above 0").max(3, "Up to 3"),
          aspect: z.number().gt(0, "Above 0").max(10, "Up to 10").optional(),
          color,
          points: z.array(z.tuple([unit, unit])).min(3, "At least 3 points").optional(),
          glow: z.boolean().optional(),
          motion: z.enum(["none", "float", "pulse", "sway"]).optional(),
          opacity,
        }),
      z.object({
        type: z.literal("image"),
        image: asset,
        fit: z.enum(["width", "cover", "contain"]).optional(),
        anchor: z.enum(["top", "center", "bottom"]).optional(),
        opacity,
      }),
      z.object({
        type: z.literal("particles"),
        effect: z.enum(["snow", "rain", "drops", "bats", "lanterns", "petals", "sparkles", "stars"]),
        count: z.number().int("Whole number").min(1, "1 to 150").max(150, "1 to 150"),
        color,
        speed: z.number().min(0, "0 to 1").max(1, "0 to 1").optional(),
        size: z.number().gt(0, "Above 0").max(1, "Up to 1").optional(),
        opacity,
      }),
    ])
  ).superRefine((layers, ctx) =>
    layers.forEach((l, i) => {
      if (l.type === "shape" && l.shape === "polygon" && (l.points?.length ?? 0) < 3)
        ctx.addIssue({ code: "custom", path: [i, "points"], message: "Polygon needs at least 3 points" });
    })
  );
}

/** Field errors keyed "<index>.<path>". */
export function layerErrors(layers: unknown[], allowTokens: boolean): Record<string, string> {
  const out: Record<string, string> = {};
  const r = layersSchema(allowTokens).safeParse(layers);
  if (!r.success) for (const i of r.error.issues) out[i.path.join(".")] ??= i.message;
  return out;
}

/** Live = a moving shape, or particles with speed above 0 (default 0.5). */
export function isLive(layers: Layer[]): boolean {
  return layers.some(
    (l) =>
      (l.type === "shape" && !!l.motion && l.motion !== "none") ||
      (l.type === "particles" && (l.speed ?? 0.5) > 0)
  );
}

/** Particle cost: sum of counts + 20 per glow + 5 per layer. */
export function sceneCost(layers: Layer[]): number {
  return layers.reduce(
    (n, l) =>
      n + 5 + (l.type === "particles" ? l.count || 0 : 0) + (l.type === "shape" && l.glow ? 20 : 0),
    0
  );
}
