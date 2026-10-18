import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { client } from "@/lib/api/client";
import type { paths } from "@/lib/api/schema";
import type {
  PageItemView,
  ItemView,
} from "@/lib/api/types";

export type IconPacksQueryParams = NonNullable<paths["/admin/v1/icon-packs"]["get"]["parameters"]["query"]>;

const keys = {
  all: ["iconPacks"] as const,
  list: (p: Record<string, unknown>) => ["iconPacks", p] as const,
  detail: (id: string) => ["iconPacks", "detail", id] as const,
};

export function useIconPacks(params: IconPacksQueryParams = {}) {
  return useQuery({
    queryKey: keys.list(params as Record<string, unknown>),
    queryFn: async () => {
      const res = await client.GET("/admin/v1/icon-packs", {
        params: {
          query: {
            page: params.page,
            perPage: params.perPage,
            sort: params.sort,
            q: params.q,
            status: params.status || undefined,
          },
        },
      });
      return res.data as PageItemView;
    },
  });
}

export function useIconPack(id: string | null | undefined) {
  return useQuery({
    queryKey: keys.detail(id || ""),
    queryFn: async () => {
      if (!id) return null;
      const res = await client.GET("/admin/v1/icon-packs/{id}", {
        params: {
          path: { id },
        },
      });
      return res.data as ItemView;
    },
    enabled: Boolean(id),
  });
}

export interface SaveIconPackInput {
  id: string;
  data: unknown;
  updatedAt?: string;
  isNew?: boolean;
}

export function useSaveIconPack() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, data, updatedAt, isNew }: SaveIconPackInput) => {
      const payloadString = JSON.stringify(
        updatedAt ? { data, updatedAt } : data
      );

      if (isNew) {
        const res = await client.POST("/admin/v1/icon-packs", {
          body: payloadString,
        });
        return res.data as ItemView;
      } else {
        const res = await client.PATCH("/admin/v1/icon-packs/{id}", {
          params: {
            path: { id },
          },
          body: payloadString,
        });
        return res.data as ItemView;
      }
    },
    onSuccess: (saved) => {
      queryClient.invalidateQueries({ queryKey: keys.all });
      if (saved?.id) {
        queryClient.invalidateQueries({ queryKey: keys.detail(saved.id) });
        queryClient.setQueryData(keys.detail(saved.id), saved);
      }
    },
  });
}

export function useIconPackAction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      action,
    }: {
      id: string;
      action: "archive" | "restore";
    }) => {
      if (action === "archive") {
        const res = await client.DELETE("/admin/v1/icon-packs/{id}", {
          params: { path: { id } },
        });
        return res.data as ItemView;
      } else {
        const res = await client.POST("/admin/v1/icon-packs/{id}/restore", {
          params: { path: { id } },
        });
        return res.data as ItemView;
      }
    },
    onSuccess: (saved) => {
      queryClient.invalidateQueries({ queryKey: keys.all });
      if (saved?.id) {
        queryClient.invalidateQueries({ queryKey: keys.detail(saved.id) });
        queryClient.setQueryData(keys.detail(saved.id), saved);
      }
    },
  });
}
