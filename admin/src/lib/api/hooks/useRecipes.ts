import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { client } from "@/lib/api/client";
import { queryKeys } from "@/lib/api/keys";
import type {
  RecipeView,
  PageRecipeView,
  PreviewRecipeBody,
  PreviewRecipeOutputBody,
  ListRecipesQuery,
  SimpleOKOutputBody,
} from "@/lib/api/types";

export type RecipesQueryParams = ListRecipesQuery;

export function useRecipes(params: RecipesQueryParams = {}) {
  return useQuery({
    queryKey: queryKeys.recipes(params as Record<string, unknown>),
    queryFn: async () => {
      const res = await client.GET("/admin/v1/generator/recipes", {
        params: {
          query: {
            page: params.page,
            perPage: params.perPage,
            sort: params.sort,
            q: params.q,
            festivalId: params.festivalId || undefined,
            enabled: params.enabled,
          },
        },
      });
      return res.data as PageRecipeView;
    },
  });
}

export function useRecipe(id: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.recipe(id || ""),
    queryFn: async () => {
      if (!id) return null;
      const res = await client.GET("/admin/v1/generator/recipes/{id}", {
        params: {
          path: { id },
        },
      });
      return res.data as RecipeView;
    },
    enabled: Boolean(id),
  });
}

export interface SaveRecipeInput {
  id: string;
  data: unknown;
  updatedAt?: string;
  enabled?: boolean;
  isNew?: boolean;
}

export function useCreateRecipe() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: unknown) => {
      const payloadString =
        typeof payload === "string" ? payload : JSON.stringify(payload);
      const res = await client.POST("/admin/v1/generator/recipes", {
        body: payloadString,
      });
      return res.data as RecipeView;
    },
    onSuccess: (saved) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.allRecipes });
      if (saved?.id) {
        queryClient.invalidateQueries({ queryKey: queryKeys.recipe(saved.id) });
        queryClient.setQueryData(queryKeys.recipe(saved.id), saved);
      }
    },
  });
}

export function useUpdateRecipe() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      payload,
    }: {
      id: string;
      payload: unknown;
    }) => {
      const payloadString =
        typeof payload === "string" ? payload : JSON.stringify(payload);
      const res = await client.PATCH("/admin/v1/generator/recipes/{id}", {
        params: {
          path: { id },
        },
        body: payloadString,
      });
      return res.data as RecipeView;
    },
    onSuccess: (saved) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.allRecipes });
      if (saved?.id) {
        queryClient.invalidateQueries({ queryKey: queryKeys.recipe(saved.id) });
        queryClient.setQueryData(queryKeys.recipe(saved.id), saved);
      }
    },
  });
}

export function useSaveRecipe() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, data, updatedAt, enabled, isNew }: SaveRecipeInput) => {
      const payloadObj =
        typeof data === "object" && data !== null
          ? {
              ...(data as Record<string, unknown>),
              ...(updatedAt !== undefined ? { updatedAt } : {}),
              ...(enabled !== undefined ? { enabled } : {}),
            }
          : data;
      const payloadString = JSON.stringify(payloadObj);

      if (isNew) {
        const res = await client.POST("/admin/v1/generator/recipes", {
          body: payloadString,
        });
        return res.data as RecipeView;
      } else {
        const res = await client.PATCH("/admin/v1/generator/recipes/{id}", {
          params: {
            path: { id },
          },
          body: payloadString,
        });
        return res.data as RecipeView;
      }
    },
    onSuccess: (saved) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.allRecipes });
      if (saved?.id) {
        queryClient.invalidateQueries({ queryKey: queryKeys.recipe(saved.id) });
        queryClient.setQueryData(queryKeys.recipe(saved.id), saved);
      }
    },
  });
}

export function useDeleteRecipe() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const res = await client.DELETE("/admin/v1/generator/recipes/{id}", {
        params: {
          path: { id },
        },
      });
      return res.data as SimpleOKOutputBody;
    },
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.allRecipes });
      queryClient.removeQueries({ queryKey: queryKeys.recipe(id) });
    },
  });
}

export function usePreviewRecipe() {
  return useMutation({
    mutationFn: async ({
      id,
      body = {},
    }: {
      id: string;
      body?: PreviewRecipeBody;
    }) => {
      const res = await client.POST("/admin/v1/generator/recipes/{id}/preview", {
        params: {
          path: { id },
        },
        body,
      });
      return res.data as PreviewRecipeOutputBody;
    },
  });
}

export function useRecipePreview(
  id: string | null | undefined,
  body?: PreviewRecipeBody,
  options?: { enabled?: boolean }
) {
  return useQuery({
    queryKey: queryKeys.recipePreview(id || "", body as Record<string, unknown>),
    queryFn: async () => {
      if (!id) return null;
      const res = await client.POST("/admin/v1/generator/recipes/{id}/preview", {
        params: {
          path: { id },
        },
        body: body ?? {},
      });
      return res.data as PreviewRecipeOutputBody;
    },
    enabled: Boolean(id) && (options?.enabled ?? true),
  });
}
