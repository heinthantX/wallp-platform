import * as z from "zod";

export const TILE_SHAPES = ["squircle", "circle", "square", "leaf"] as const;
const hex = z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Must be #RRGGBB");
const optHex = z.union([z.literal(""), hex]).optional();

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
  background: z.object(
    {
      url: z.string(),
      sha256: z.string(),
      bytes: z.number(),
      format: z.enum(["png", "webp"]),
    },
    { required_error: "Upload the background tile", invalid_type_error: "Upload the background tile" }
  ),
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
