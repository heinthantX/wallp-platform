import { useMutation } from "@tanstack/react-query";
import { client } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";

export type AiSuggestKind = "iconPack" | "theme" | "wallpaper" | "font";
export type AiSuggestion = components["schemas"]["AISuggestResult"];

export function useAiSuggest() {
  return useMutation({
    mutationFn: async (body: { description: string; kind: AiSuggestKind }) => {
      const res = await client.POST("/admin/v1/ai/suggest", { body });
      if (!res.data) throw new Error("No suggestions came back");
      return res.data as AiSuggestion;
    },
  });
}
