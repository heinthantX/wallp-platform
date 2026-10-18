import * as z from "zod";

export const FONT_LICENSES = ["OFL-1.1", "Apache-2.0"] as const;
export const FONT_CATEGORIES = ["display", "handwritten", "clean", "myanmar"] as const;

export const fontSchema = z.object({
  id: z
    .string()
    .min(1, "ID is required")
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Must be lowercase kebab-case"),
  family: z.string().min(1, "Family is required"),
  category: z.enum(FONT_CATEGORIES),
  scripts: z.array(z.string()).min(1, "At least one script is required"),
  tags: z.array(z.string()).optional(),
  license: z.enum(FONT_LICENSES, {
    errorMap: () => ({ message: "License is required (OFL-1.1 or Apache-2.0)" }),
  }),
  files: z
    .array(
      z.object({
        weight: z.coerce.number().min(100).max(900).optional(),
        style: z.enum(["normal", "italic"]).optional(),
        asset: z.object({
          url: z.string(),
          sha256: z.string(),
          bytes: z.number(),
          format: z.enum(["ttf", "otf"], { errorMap: () => ({ message: "The app can only load TTF or OTF" }) }),
        }),
      })
    )
    .min(1, "Upload at least one TTF or OTF file"),
  fallbackFor: z.record(z.string()).optional(),
  sampleText: z.record(z.string()).optional(),
  listed: z.boolean().optional(),
});

export type FontForm = z.infer<typeof fontSchema>;

export const defaultFont = {
  id: "",
  family: "",
  category: "clean",
  scripts: ["latin"],
  tags: [],
  license: "" as unknown as FontForm["license"],
  files: [],
  fallbackFor: {},
  sampleText: {},
  listed: true,
} as FontForm;
