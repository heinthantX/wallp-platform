import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { client } from "@/lib/api/client";
import { queryKeys } from "@/lib/api/keys";
import { useAuthStore } from "@/lib/auth/store";
import type { SessionView } from "@/lib/api/types";

export function useSessions() {
  const refreshToken = useAuthStore((s) => s.refreshToken);

  return useQuery({
    queryKey: queryKeys.sessions,
    queryFn: async () => {
      const res = await client.GET("/admin/v1/auth/sessions", {
        headers: refreshToken ? { "X-Refresh-Token": refreshToken } : undefined,
      });
      return (res.data?.sessions || []) as SessionView[];
    },
    enabled: !!refreshToken,
  });
}

export function useRevokeSession() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      await client.DELETE("/admin/v1/auth/sessions/{id}", {
        params: {
          path: { id },
        },
      });
      return id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.sessions });
    },
  });
}
