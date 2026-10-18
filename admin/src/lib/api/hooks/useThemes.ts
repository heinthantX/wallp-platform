import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { client } from "@/lib/api/client";
import { queryKeys } from "@/lib/api/keys";
import type {
  PageItemView,
  ItemView,
  ListThemesQuery,
  ReviewInputBody,
  ScheduleInputBody,
} from "@/lib/api/types";

export type ThemesQueryParams = ListThemesQuery;

export function useThemes(params: ThemesQueryParams = {}) {
  return useQuery({
    queryKey: queryKeys.themes(params as Record<string, unknown>),
    queryFn: async () => {
      const res = await client.GET("/admin/v1/themes", {
        params: {
          query: {
            page: params.page,
            perPage: params.perPage,
            sort: params.sort,
            q: params.q,
            festival: params.festival || undefined,
            status: params.status || undefined,
            style: params.style || undefined,
            engine: params.engine || undefined,
          },
        },
      });
      return res.data as PageItemView;
    },
  });
}

export function useTheme(id: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.theme(id || ""),
    queryFn: async () => {
      if (!id) return null;
      const res = await client.GET("/admin/v1/themes/{id}", {
        params: {
          path: { id },
        },
      });
      return res.data as ItemView;
    },
    enabled: Boolean(id),
  });
}

export interface SaveThemeInput {
  id: string;
  data: unknown;
  updatedAt?: string;
  isNew?: boolean;
  generatedFrom?: unknown;
}

export function useSaveTheme() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, data, updatedAt, isNew, generatedFrom }: SaveThemeInput) => {
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
        const res = await client.POST("/admin/v1/themes", {
          body: payloadString,
        });
        return res.data as ItemView;
      } else {
        const res = await client.PATCH("/admin/v1/themes/{id}", {
          params: {
            path: { id },
          },
          body: payloadString,
        });
        return res.data as ItemView;
      }
    },
    onSuccess: (saved) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.allThemes });
      if (saved?.id) {
        queryClient.invalidateQueries({ queryKey: queryKeys.theme(saved.id) });
        queryClient.setQueryData(queryKeys.theme(saved.id), saved);
      }
    },
  });
}

export type ThemeActionPayload =
  | { type: "review"; action: ReviewInputBody["action"]; note?: string }
  | { type: "schedule"; at: ScheduleInputBody["at"] }
  | { type: "duplicate" }
  | { type: "export" }
  | { type: "archive" }
  | { type: "restore" };

export function useThemeAction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      action,
    }: {
      id: string;
      action: ThemeActionPayload;
    }) => {
      switch (action.type) {
        case "review": {
          const res = await client.POST("/admin/v1/themes/{id}/review", {
            params: { path: { id } },
            body: {
              action: action.action,
              note: action.note,
            },
          });
          return res.data as ItemView;
        }
        case "schedule": {
          const res = await client.POST("/admin/v1/themes/{id}/schedule", {
            params: { path: { id } },
            body: {
              at: action.at,
            },
          });
          return res.data as ItemView;
        }
        case "duplicate": {
          const res = await client.POST("/admin/v1/themes/{id}/duplicate", {
            params: { path: { id } },
          });
          return res.data as ItemView;
        }
        case "export": {
          const res = await client.GET("/admin/v1/themes/{id}/export", {
            params: { path: { id } },
          });
          return res.data;
        }
        case "archive": {
          const res = await client.POST("/admin/v1/themes/{id}/archive", {
            params: { path: { id } },
          });
          return res.data as ItemView;
        }
        case "restore": {
          const res = await client.POST("/admin/v1/themes/{id}/restore", {
            params: { path: { id } },
          });
          return res.data as ItemView;
        }
      }
    },
    onSuccess: (result, vars) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.allThemes });
      if (vars.id) {
        queryClient.invalidateQueries({ queryKey: queryKeys.theme(vars.id) });
      }
      if (result && typeof result === "object" && "id" in result) {
        const item = result as ItemView;
        queryClient.setQueryData(queryKeys.theme(item.id), item);
      }
    },
  });
}
