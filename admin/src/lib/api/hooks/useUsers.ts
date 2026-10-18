import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { client } from "@/lib/api/client";
import { queryKeys } from "@/lib/api/keys";
import type {
  PageAdminUserView,
  CreateUserInputBody,
  UpdateUserInputBody,
  AdminUserView,
} from "@/lib/api/types";

export interface UsersQueryParams {
  page?: number;
  perPage?: number;
  sort?: string;
  q?: string;
  role?: "admin" | "designer" | "reviewer" | "viewer" | "";
}

export function useUsers(params: UsersQueryParams = {}) {
  return useQuery({
    queryKey: queryKeys.users(params as Record<string, unknown>),
    queryFn: async () => {
      const res = await client.GET("/admin/v1/users", {
        params: {
          query: {
            page: params.page,
            perPage: params.perPage,
            sort: params.sort,
            q: params.q,
            role: params.role || undefined,
          },
        },
      });
      return res.data as PageAdminUserView;
    },
  });
}

export function useCreateUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (body: CreateUserInputBody) => {
      const res = await client.POST("/admin/v1/users", {
        body,
      });
      return res.data as AdminUserView;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.allUsers });
    },
  });
}

export function useUpdateUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      body,
    }: {
      id: string;
      body: UpdateUserInputBody;
    }) => {
      const res = await client.PATCH("/admin/v1/users/{id}", {
        params: {
          path: { id },
        },
        body,
      });
      return res.data as AdminUserView;
    },
    onMutate: async ({ id, body }) => {
      // Cancel outgoing queries for users so they don't overwrite optimistic update
      await queryClient.cancelQueries({ queryKey: queryKeys.allUsers });

      // Snapshot previous queries matching users
      const previousQueries = queryClient.getQueriesData<PageAdminUserView>({
        queryKey: queryKeys.allUsers,
      });

      // Optimistically update all matching cached queries
      queryClient.setQueriesData<PageAdminUserView>(
        { queryKey: queryKeys.allUsers },
        (old) => {
          if (!old || !old.items) return old;
          return {
            ...old,
            items: old.items.map((user) => {
              if (user.id !== id) return user;
              return {
                ...user,
                ...(body.disabled !== undefined ? { disabled: body.disabled } : {}),
                ...(body.role ? { role: body.role } : {}),
                ...(body.name ? { name: body.name } : {}),
                ...(body.resetTotp ? { totpEnabled: false } : {}),
              };
            }),
          };
        }
      );

      return { previousQueries };
    },
    onError: (_err, _variables, context) => {
      // Rollback to previous state
      if (context?.previousQueries) {
        for (const [key, data] of context.previousQueries) {
          queryClient.setQueryData(key, data);
        }
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.allUsers });
    },
  });
}
