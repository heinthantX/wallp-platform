import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { client } from "@/lib/api/client";
import { queryKeys } from "@/lib/api/keys";
import type {
  PageItemView,
  ItemView,
  ListFestivalsQuery,
  SimpleOKOutputBody,
} from "@/lib/api/types";

export type FestivalsQueryParams = ListFestivalsQuery;

export function useFestivals(params: FestivalsQueryParams = {}) {
  return useQuery({
    queryKey: queryKeys.festivals(params as Record<string, unknown>),
    queryFn: async () => {
      const res = await client.GET("/admin/v1/festivals", {
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

export function useFestival(id: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.festival(id || ""),
    queryFn: async () => {
      if (!id) return null;
      const res = await client.GET("/admin/v1/festivals/{id}", {
        params: {
          path: { id },
        },
      });
      return res.data as ItemView;
    },
    enabled: Boolean(id),
  });
}

export interface SaveFestivalInput {
  id: string;
  data: unknown;
  updatedAt?: string;
  isNew?: boolean;
}

export function useSaveFestival() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, data, updatedAt, isNew }: SaveFestivalInput) => {
      const payloadString = JSON.stringify(
        updatedAt ? { data, updatedAt } : data
      );

      if (isNew) {
        const res = await client.POST("/admin/v1/festivals", {
          body: payloadString,
        });
        return res.data as ItemView;
      } else {
        const res = await client.PATCH("/admin/v1/festivals/{id}", {
          params: {
            path: { id },
          },
          body: payloadString,
        });
        return res.data as ItemView;
      }
    },
    onSuccess: (saved) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.allFestivals });
      if (saved?.id) {
        queryClient.invalidateQueries({ queryKey: queryKeys.festival(saved.id) });
        queryClient.setQueryData(queryKeys.festival(saved.id), saved);
      }
    },
  });
}

export function useReorderFestivals() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (ids: string[]) => {
      const res = await client.PUT("/admin/v1/festivals/order", {
        body: { ids },
      });
      return res.data as SimpleOKOutputBody;
    },
    onMutate: async (newIds: string[]) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.allFestivals });

      const previousQueries = queryClient.getQueriesData<PageItemView>({
        queryKey: queryKeys.allFestivals,
      });

      queryClient.setQueriesData<PageItemView>(
        { queryKey: queryKeys.allFestivals },
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
      queryClient.invalidateQueries({ queryKey: queryKeys.allFestivals });
    },
  });
}

export function useFestivalAction() {
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
        const res = await client.DELETE("/admin/v1/festivals/{id}", {
          params: { path: { id } },
        });
        return res.data as ItemView;
      } else {
        const res = await client.POST("/admin/v1/festivals/{id}/restore", {
          params: { path: { id } },
        });
        return res.data as ItemView;
      }
    },
    onSuccess: (saved) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.allFestivals });
      if (saved?.id) {
        queryClient.invalidateQueries({ queryKey: queryKeys.festival(saved.id) });
        queryClient.setQueryData(queryKeys.festival(saved.id), saved);
      }
    },
  });
}
