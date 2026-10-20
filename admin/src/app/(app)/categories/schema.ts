import * as z from "zod";

export const categorySchema = z.object({
  id: z
    .string()
    .min(1, "ID is required")
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Must be lowercase kebab-case"),
  name: z.object({ en: z.string().min(1, "English name is required") }).catchall(z.string()),
  sort: z.coerce.number().int().optional(),
  tags: z.array(z.string()).optional(),
  festivalIds: z.array(z.string()).optional(),
});

export type CategoryForm = z.infer<typeof categorySchema>;

export const defaultCategory: CategoryForm = { id: "", name: { en: "" }, sort: 0, tags: [], festivalIds: [] };
