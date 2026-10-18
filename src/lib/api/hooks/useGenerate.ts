import { useMutation } from "@tanstack/react-query";
import { client } from "@/lib/api/client";
import type { operations, components } from "@/lib/api/schema";

export type GenerateThemeInput =
  operations["generate-themes"]["requestBody"]["content"]["application/json"];

export type GenerateThemeOutput =
  operations["generate-themes"]["responses"][200]["content"]["application/json"];

export type GeneratedOption = components["schemas"]["GeneratedOption"];

export function useGenerate() {
  return useMutation({
    mutationFn: async (input: GenerateThemeInput) => {
      const res = await client.POST("/admin/v1/themes/generate", {
        body: input,
      });
      return res.data as GenerateThemeOutput;
    },
  });
}

export const useGenerateTheme = useGenerate;
