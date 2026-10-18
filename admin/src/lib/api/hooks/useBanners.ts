import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { client } from "@/lib/api/client";
import type { paths } from "@/lib/api/schema";
import type {
  PageItemView,
  ItemView,
  SimpleOKOutputBody,
} from "@/lib/api/types";

export type BannersQueryParams = NonNullable<paths["/admin/v1/banners"]["get"]["parameters"]["query"]>;

const keys = {
  all: ["banners"] as const,
  list: (p: Record<string, unknown>) => ["banners", p] as const,
  detail: (id: string) => ["banners", "detail", id] as const,
};

export function useBanners(params: BannersQueryParams = {}) {
  return useQuery({
    queryKey: keys.list(params as Record<string, unknown>),
    queryFn: async () => {
      const res = await client.GET("/admin/v1/banners", {
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

export function useBanner(id: string | null | undefined) {
  return useQuery({
    queryKey: keys.detail(id || ""),
    queryFn: async () => {
      if (!id) return null;
      const res = await client.GET("/admin/v1/banners/{id}", {
        params: {
          path: { id },
        },
      });
      return res.data as ItemView;
    },
    enabled: Boolean(id),
  });
}

export interface SaveBannerInput {
  id: string;
  data: unknown;
  updatedAt?: string;
  isNew?: boolean;
}

export function useSaveBanner() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, data, updatedAt, isNew }: SaveBannerInput) => {
      const payloadString = JSON.stringify(
        updatedAt ? { data, updatedAt } : data
      );

      if (isNew) {
        const res = await client.POST("/admin/v1/banners", {
          body: payloadString,
        });
        return res.data as ItemView;
      } else {
        const res = await client.PATCH("/admin/v1/banners/{id}", {
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

export function useReorderBanners() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (ids: string[]) => {
      const res = await client.PUT("/admin/v1/banners/order", {
        body: { ids },
      });
      return res.data as SimpleOKOutputBody;
    },
    onMutate: async (newIds: string[]) => {
      await queryClient.cancelQueries({ queryKey: keys.all });

      const previousQueries = queryClient.getQueriesData<PageItemView>({
        queryKey: keys.all,
      });

      queryClient.setQueriesData<PageItemView>(
        { queryKey: keys.all },
        (old) => {
          if (!old || !old.items) return old;
          const map = new Map(old.items.map((item) => [item.id, item]));
          const reordered: ItemView[] = [];
          for (let i = 0; i < newIds.length; i++) {
            const item = map.get(newIds[i]);
            if (item) {
              reordered.push({
                ...item,
                sort: i * 10,
              });
              map.delete(newIds[i]);
            }
          }
          // Append any remaining items that were not in newIds
          for (const remainingItem of map.values()) {
            reordered.push(remainingItem);
          }

          return {
            ...old,
            items: reordered,
          };
        }
      );

      return { previousQueries };
    },
    onError: (_err, _newIds, context) => {
      if (context?.previousQueries) {
        for (const [key, data] of context.previousQueries) {
          queryClient.setQueryData(key, data);
        }
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: keys.all });
    },
  });
}

export function useBannerAction() {
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
        const res = await client.DELETE("/admin/v1/banners/{id}", {
          params: { path: { id } },
        });
        return res.data as ItemView;
      } else {
        const res = await client.POST("/admin/v1/banners/{id}/restore", {
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
