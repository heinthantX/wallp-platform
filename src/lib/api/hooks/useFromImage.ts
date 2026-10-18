import { useMutation } from "@tanstack/react-query";
import { client } from "@/lib/api/client";
import type { operations, components } from "@/lib/api/schema";

export type FromImageOutput =
  operations["generate-themes-from-image"]["responses"][200]["content"]["application/json"];

export type Swatch = components["schemas"]["Swatch"];

export interface FromImageInput {
  image: File;
  festivalId?: string;
  mood?: string;
  engine?: string;
  recipeId?: string;
  seed?: number;
  learnBias?: boolean;
}

export function useFromImage() {
  return useMutation({
    mutationFn: async (input: FromImageInput): Promise<FromImageOutput> => {
      const formData = new FormData();
      formData.append("image", input.image, input.image.name);
      if (input.festivalId) formData.append("festivalId", input.festivalId);
      if (input.mood) formData.append("mood", input.mood);
      if (input.engine) formData.append("engine", input.engine);
      if (input.recipeId) formData.append("recipeId", input.recipeId);
      if (input.seed !== undefined) formData.append("seed", String(input.seed));
      if (input.learnBias !== undefined)
        formData.append("learnBias", String(input.learnBias));

      const res = await client.POST("/admin/v1/themes/generate/from-image", {
        body: formData as unknown as string,
      });
      return res.data as FromImageOutput;
    },
  });
}
