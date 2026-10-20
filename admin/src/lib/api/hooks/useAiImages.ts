import { useMutation } from "@tanstack/react-query";
import { client } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";

export type AiImage = components["schemas"]["AIImagesResult"];
export type AiScene = components["schemas"]["AISceneResult"];

export function useAiImage() {
  return useMutation({
    mutationFn: async (body: { prompt: string; purpose: "icon" | "wallpaper" | "art"; steps?: number; seed?: number }) => {
      const res = await client.POST("/admin/v1/ai/images", { body: { steps: 4, ...body } });
      if (!res.data) throw new Error("No image came back");
      return res.data as AiImage;
    },
  });
}

export function useAiScene() {
  return useMutation({
    mutationFn: async (body: { description: string; palette?: string[]; withArt?: boolean }) => {
      const res = await client.POST("/admin/v1/ai/scene", { body: { withArt: true, ...body } });
      if (!res.data) throw new Error("No scene came back");
      return res.data as AiScene;
    },
  });
}
