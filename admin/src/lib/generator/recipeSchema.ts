import * as z from "zod";

export const kebabRegex = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export const hueTupleSchema = z.tuple([
  z.number().min(0, "Hue value must be between 0 and 360").max(360, "Hue value must be between 0 and 360"),
  z.number().min(0, "Hue value must be between 0 and 360").max(360, "Hue value must be between 0 and 360"),
]);

export const chromaSchema = z
  .object({
    min: z.number().min(0, "Chroma min must be >= 0"),
    max: z.number().min(0, "Chroma max must be >= 0"),
  })
  .refine((data) => data.max >= data.min, {
    message: "Chroma max must be greater than or equal to min",
    path: ["max"],
  });

export const motifSpecSchema = z.object({
  shape: z.enum(["circle", "ellipse", "polygon"]),
  preset: z
    .enum(["moon", "sun", "tree", "pagoda", "star", "heart", "lantern", "hill"])
    .optional()
    .or(z.literal("")),
  points: z.array(z.array(z.number())).optional(),
  widthRange: z.tuple([z.number(), z.number()]).optional(),
  yRange: z.tuple([z.number(), z.number()]).optional(),
  glow: z.boolean().optional(),
  motion: z.string().optional(),
});

export const particleSpecSchema = z.object({
  effect: z.string().min(1, "Effect is required"),
  countRange: z.tuple([z.number().int(), z.number().int()]).optional(),
  speedRange: z.tuple([z.number(), z.number()]).optional(),
  sizeRange: z.tuple([z.number(), z.number()]).optional(),
  opacityRange: z.tuple([z.number(), z.number()]).optional(),
});

export const fontTagsSpecSchema = z.object({
  display: z.array(z.string()).default([]),
  body: z.array(z.string()).default([]),
  labels: z.array(z.string()).default([]),
});

export const localizedWordsSchema = z.object({
  en: z.array(z.string()).default([]),
  my: z.array(z.string()).default([]),
});

export const recipeKeywordsSchema = z.object({
  en: z.array(z.string()).default([]),
  my: z.array(z.string()).default([]),
});

export const recipeSchema = z.object({
  id: z
    .string()
    .min(1, "Recipe ID is required")
    .regex(kebabRegex, "Recipe ID must be kebab-case (e.g. cozy-autumn)"),
  name: z.string().min(1, "Recipe name is required"),
  festivalIds: z.array(z.string()).default([]),
  tags: z.array(z.string()).default([]),
  moods: z.array(z.string()).default(["classic", "cozy", "minimal", "cute"]),
  hueRanges: z.array(hueTupleSchema).default([]),
  chroma: chromaSchema.optional().default({ min: 0.05, max: 0.2 }),
  accentHues: z
    .enum(["complementary", "analogous", "triad", "recipe"])
    .optional()
    .or(z.literal("")),
  accentHueRanges: z.array(hueTupleSchema).default([]),
  motifs: z.array(motifSpecSchema).default([]),
  particles: z.array(particleSpecSchema).default([]),
  layerTemplates: z.array(z.unknown()).optional(),
  fontTags: fontTagsSpecSchema.default({ display: [], body: [], labels: [] }),
  eventIcon: z.string().optional(),
  nameWords: localizedWordsSchema.default({ en: [], my: [] }),
  keywords: recipeKeywordsSchema.default({ en: [], my: [] }),
  costBudget: z
    .number()
    .min(1, "costBudget must be > 0")
    .default(200),
});

export type RecipeFormData = z.infer<typeof recipeSchema>;

export const defaultRecipeFormData: RecipeFormData = {
  id: "",
  name: "",
  festivalIds: [],
  tags: [],
  moods: ["classic", "cozy", "minimal", "cute"],
  hueRanges: [[20, 50]],
  chroma: { min: 0.05, max: 0.2 },
  accentHues: "complementary",
  accentHueRanges: [],
  motifs: [{ shape: "circle", preset: "moon", glow: true }],
  particles: [{ effect: "sparkles", countRange: [20, 60] }],
  fontTags: { display: [], body: [], labels: [] },
  eventIcon: "nightlight_round",
  nameWords: { en: [], my: [] },
  keywords: { en: [], my: [] },
  costBudget: 200,
};
