import { useMutation, useQueryClient } from "@tanstack/react-query";
import { client } from "@/lib/api/client";
import { queryKeys } from "@/lib/api/keys";
import { useAuthStore } from "@/lib/auth/store";
import type {
  TOTPSetupOutputBody,
  AdminUserView,
  CodeInputBody,
  PasswordInputBody,
} from "@/lib/api/types";

export function useTotpSetup() {
  return useMutation({
    mutationFn: async () => {
      const res = await client.POST("/admin/v1/auth/totp/setup");
      return res.data as TOTPSetupOutputBody;
    },
  });
}

export function useTotpEnable() {
  const queryClient = useQueryClient();
  const setUser = useAuthStore((s) => s.setUser);

  return useMutation({
    mutationFn: async (body: CodeInputBody) => {
      const res = await client.POST("/admin/v1/auth/totp/enable", {
        body,
      });
      return res.data as AdminUserView;
    },
    onSuccess: (user) => {
      if (user) {
        setUser(user);
        queryClient.setQueryData(queryKeys.me, user);
      }
      queryClient.invalidateQueries({ queryKey: queryKeys.me });
    },
  });
}

export function useTotpDisable() {
  const queryClient = useQueryClient();
  const setUser = useAuthStore((s) => s.setUser);

  return useMutation({
    mutationFn: async (body: PasswordInputBody) => {
      const res = await client.POST("/admin/v1/auth/totp/disable", {
        body,
      });
      return res.data as AdminUserView;
    },
    onSuccess: (user) => {
      if (user) {
        setUser(user);
        queryClient.setQueryData(queryKeys.me, user);
      }
      queryClient.invalidateQueries({ queryKey: queryKeys.me });
    },
  });
}
