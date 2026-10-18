import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { client } from "@/lib/api/client";
import { queryKeys } from "@/lib/api/keys";
import type {
  PageItemView,
  ItemView,
  ListWallpapersQuery,
  ReviewInputBody,
  ScheduleInputBody,
} from "@/lib/api/types";

export type WallpapersQueryParams = ListWallpapersQuery;

export function useWallpapers(params: WallpapersQueryParams = {}) {
  return useQuery({
    queryKey: queryKeys.wallpapers(params as Record<string, unknown>),
    queryFn: async () => {
      const res = await client.GET("/admin/v1/wallpapers", {
        params: {
          query: {
            page: params.page,
            perPage: params.perPage,
            sort: params.sort,
            q: params.q,
            festival: params.festival || undefined,
            status: params.status || undefined,
            kind: params.kind || undefined,
          },
        },
      });
      return res.data as PageItemView;
    },
  });
}

export function useWallpaper(id: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.wallpaper(id || ""),
    queryFn: async () => {
      if (!id) return null;
      const res = await client.GET("/admin/v1/wallpapers/{id}", {
        params: {
          path: { id },
        },
      });
      return res.data as ItemView;
    },
    enabled: Boolean(id),
  });
}

export interface SaveWallpaperInput {
  id: string;
  data: unknown;
  updatedAt?: string;
  isNew?: boolean;
  generatedFrom?: unknown;
}

export function useSaveWallpaper() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, data, updatedAt, isNew, generatedFrom }: SaveWallpaperInput) => {
      const payloadString = JSON.stringify(
        updatedAt || generatedFrom
          ? {
              data,
              ...(updatedAt ? { updatedAt } : {}),
              ...(generatedFrom ? { generatedFrom } : {}),
            }
          : data
      );

      if (isNew) {
        const res = await client.POST("/admin/v1/wallpapers", {
          body: payloadString,
        });
        return res.data as ItemView;
      } else {
        const res = await client.PATCH("/admin/v1/wallpapers/{id}", {
          params: {
            path: { id },
          },
          body: payloadString,
        });
        return res.data as ItemView;
      }
    },
    onSuccess: (saved) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.allWallpapers });
      if (saved?.id) {
        queryClient.invalidateQueries({ queryKey: queryKeys.wallpaper(saved.id) });
        queryClient.setQueryData(queryKeys.wallpaper(saved.id), saved);
      }
    },
  });
}

export type WallpaperActionPayload =
  | { type: "review"; action: ReviewInputBody["action"]; note?: string }
  | { type: "schedule"; at: ScheduleInputBody["at"] }
  | { type: "duplicate" }
  | { type: "export" }
  | { type: "archive" }
  | { type: "restore" };

export function useWallpaperAction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      action,
    }: {
      id: string;
      action: WallpaperActionPayload;
    }) => {
      switch (action.type) {
        case "review": {
          const res = await client.POST("/admin/v1/wallpapers/{id}/review", {
            params: { path: { id } },
            body: {
              action: action.action,
              note: action.note,
            },
          });
          return res.data as ItemView;
        }
        case "schedule": {
          const res = await client.POST("/admin/v1/wallpapers/{id}/schedule", {
            params: { path: { id } },
            body: {
              at: action.at,
            },
          });
          return res.data as ItemView;
        }
        case "duplicate": {
          const res = await client.POST("/admin/v1/wallpapers/{id}/duplicate", {
            params: { path: { id } },
          });
          return res.data as ItemView;
        }
        case "export": {
          const res = await client.GET("/admin/v1/wallpapers/{id}/export", {
            params: { path: { id } },
          });
          return res.data;
        }
        case "archive": {
          const res = await client.POST("/admin/v1/wallpapers/{id}/archive", {
            params: { path: { id } },
          });
          return res.data as ItemView;
        }
        case "restore": {
          const res = await client.POST("/admin/v1/wallpapers/{id}/restore", {
            params: { path: { id } },
          });
          return res.data as ItemView;
        }
      }
    },
    onSuccess: (result, vars) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.allWallpapers });
      if (vars.id) {
        queryClient.invalidateQueries({ queryKey: queryKeys.wallpaper(vars.id) });
      }
      if (result && typeof result === "object" && "id" in result) {
        const item = result as ItemView;
        queryClient.setQueryData(queryKeys.wallpaper(item.id), item);
      }
    },
  });
}
