import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { client } from "@/lib/api/client";
import { queryKeys } from "@/lib/api/keys";
import { useAuthStore } from "@/lib/auth/store";
import type { UpdateMeInputBody, AdminUserView } from "@/lib/api/types";

export function useMe() {
  const setUser = useAuthStore((s) => s.setUser);
  const accessToken = useAuthStore((s) => s.accessToken);

  return useQuery({
    queryKey: queryKeys.me,
    queryFn: async () => {
      const res = await client.GET("/admin/v1/auth/me");
      if (res.data) {
        setUser(res.data);
      }
      return res.data;
    },
    enabled: !!accessToken,
  });
}

export function useUpdateMe() {
  const queryClient = useQueryClient();
  const setUser = useAuthStore((s) => s.setUser);

  return useMutation({
    mutationFn: async (body: UpdateMeInputBody) => {
      const res = await client.PATCH("/admin/v1/auth/me", {
        body,
      });
      return res.data as AdminUserView;
    },
    onSuccess: (data) => {
      if (data) {
        setUser(data);
        queryClient.setQueryData(queryKeys.me, data);
      }
      queryClient.invalidateQueries({ queryKey: queryKeys.me });
    },
  });
}
