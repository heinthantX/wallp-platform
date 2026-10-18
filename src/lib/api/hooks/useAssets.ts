import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/lib/auth/store";
import { client } from "@/lib/api/client";
import { queryKeys } from "@/lib/api/keys";
import type { PageAssetItem, UploadAssetResult } from "@/lib/api/types";

export interface AssetsQueryParams {
  page?: number;
  perPage?: number;
  sort?: string;
  q?: string;
  format?: string;
}

export function useAssets(params: AssetsQueryParams = {}) {
  return useQuery({
    queryKey: queryKeys.assets(params as Record<string, unknown>),
    queryFn: async () => {
      const res = await client.GET("/admin/v1/assets", {
        params: { query: { ...params, format: params.format || undefined } },
      });
      return res.data as PageAssetItem;
    },
  });
}

export interface UploadAssetInput {
  file: File;
  /** "wallpaper" also creates 1080/1440 WebP variants */
  variants?: "wallpaper";
}

export function useUploadImageAsset() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ file, variants }: UploadAssetInput) => {
      const formData = new FormData();
      formData.append("file", file, file.name);
      const res = await client.POST("/admin/v1/assets", {
        params: { query: variants ? { variants } : {} },
        body: formData as unknown as string,
      });
      return res.data as UploadAssetResult;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.allAssets });
    },
  });
}

/** Rejects with ApiError (409 asset_in_use) when an item still references the asset. */
export function useDeleteAsset() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (sha256: string) => {
      await client.DELETE("/admin/v1/assets/{sha256}", {
        params: { path: { sha256 } },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.allAssets });
    },
  });
}

/** Resolve an asset url to something an <img>/FontFace can load (relative urls live on the API host). */
export function assetSrc(url: string): string {
  if (/^(https?:|blob:|data:)/.test(url)) return url;
  const base = (
    useAuthStore.getState().apiUrl ||
    process.env.NEXT_PUBLIC_API_URL ||
    "http://localhost:8080"
  ).replace(/\/+$/, "");
  return base + (url.startsWith("/") ? url : `/${url}`);
}

export const ASSET_WARNING_LABELS: Record<string, string> = {
  too_small: "Smaller than 1440×3120",
  too_large: "Over 1 MB",
  clock_contrast: "Low clock contrast",
};

export function formatBytes(bytes: number): string {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${parseFloat((bytes / 1024 ** i).toFixed(1))} ${units[i]}`;
}
