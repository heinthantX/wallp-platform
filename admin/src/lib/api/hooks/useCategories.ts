import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { client } from "@/lib/api/client";
import type { paths } from "@/lib/api/schema";
import type {
  PageItemView,
  ItemView,
} from "@/lib/api/types";

export type CategoriesQueryParams = NonNullable<paths["/admin/v1/categories"]["get"]["parameters"]["query"]>;

const keys = {
  all: ["categories"] as const,
  list: (p: Record<string, unknown>) => ["categories", p] as const,
  detail: (id: string) => ["categories", "detail", id] as const,
};

export function useCategories(params: CategoriesQueryParams = {}) {
  return useQuery({
    queryKey: keys.list(params as Record<string, unknown>),
    queryFn: async () => {
      const res = await client.GET("/admin/v1/categories", {
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

export function useCategory(id: string | null | undefined) {
  return useQuery({
    queryKey: keys.detail(id || ""),
    queryFn: async () => {
      if (!id) return null;
      const res = await client.GET("/admin/v1/categories/{id}", {
        params: {
          path: { id },
        },
      });
      return res.data as ItemView;
    },
    enabled: Boolean(id),
  });
}

export interface SaveCategoryInput {
  id: string;
  data: unknown;
  updatedAt?: string;
  isNew?: boolean;
}

export function useSaveCategory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, data, updatedAt, isNew }: SaveCategoryInput) => {
      const payloadString = JSON.stringify(
        updatedAt ? { data, updatedAt } : data
      );

      if (isNew) {
        const res = await client.POST("/admin/v1/categories", {
          body: payloadString,
        });
        return res.data as ItemView;
      } else {
        const res = await client.PATCH("/admin/v1/categories/{id}", {
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

export function useCategoryAction() {
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
        const res = await client.DELETE("/admin/v1/categories/{id}", {
          params: { path: { id } },
        });
        return res.data as ItemView;
      } else {
        const res = await client.POST("/admin/v1/categories/{id}/restore", {
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
