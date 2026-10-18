import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { client } from "@/lib/api/client";
import { queryKeys } from "@/lib/api/keys";
import { useAuthStore } from "@/lib/auth/store";
import type {
  SetupStatusBody,
  SetupInputBody,
  LoginInputBody,
  LoginOutputBody,
  MFAInputBody,
  AdminSession,
} from "@/lib/api/types";

export function useSetupStatus() {
  return useQuery({
    queryKey: queryKeys.setupStatus,
    queryFn: async () => {
      const res = await client.GET("/admin/v1/auth/setup");
      return res.data as SetupStatusBody;
    },
    staleTime: 1000 * 60, // 1 minute
  });
}

export function useSetupFirstAdmin() {
  const queryClient = useQueryClient();
  const setSession = useAuthStore((s) => s.setSession);

  return useMutation({
    mutationFn: async (body: SetupInputBody) => {
      const res = await client.POST("/admin/v1/auth/setup", {
        body,
      });
      return res.data as AdminSession;
    },
    onSuccess: (session) => {
      if (session) {
        setSession(session);
        queryClient.invalidateQueries({ queryKey: queryKeys.setupStatus });
      }
    },
  });
}

export function useLogin() {
  const setSession = useAuthStore((s) => s.setSession);

  return useMutation({
    mutationFn: async (body: LoginInputBody) => {
      const res = await client.POST("/admin/v1/auth/login", {
        body,
      });
      return res.data as LoginOutputBody;
    },
    onSuccess: (data) => {
      if (!data.mfaRequired && data.session) {
        setSession(data.session);
      }
    },
  });
}

export function useMfaVerify() {
  const setSession = useAuthStore((s) => s.setSession);

  return useMutation({
    mutationFn: async (body: MFAInputBody) => {
      const res = await client.POST("/admin/v1/auth/mfa", {
        body,
      });
      return res.data as AdminSession;
    },
    onSuccess: (session) => {
      if (session) {
        setSession(session);
      }
    },
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  const clear = useAuthStore((s) => s.clear);
  const refreshToken = useAuthStore((s) => s.refreshToken);

  return useMutation({
    mutationFn: async () => {
      if (refreshToken) {
        try {
          await client.POST("/admin/v1/auth/logout", {
            body: { refreshToken },
          });
        } catch {
          // Ignore logout API failures, still clear client state
        }
      }
      clear();
    },
    onSettled: () => {
      clear();
      queryClient.clear();
    },
  });
}
