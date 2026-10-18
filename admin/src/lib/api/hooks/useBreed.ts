import { useMutation } from "@tanstack/react-query";
import { client } from "@/lib/api/client";
import type { operations, components } from "@/lib/api/schema";

export type BreedInput =
  operations["breed-themes"]["requestBody"]["content"]["application/json"];

export type BreedOutput =
  operations["breed-themes"]["responses"][200]["content"]["application/json"];

export type ThemeDetail = components["schemas"]["ThemeDetail"];

export function useBreed() {
  return useMutation({
    mutationFn: async (input: BreedInput): Promise<BreedOutput> => {
      const res = await client.POST("/admin/v1/themes/generate/breed", {
        body: input,
      });
      return res.data as BreedOutput;
    },
  });
}
