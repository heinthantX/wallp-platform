import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { AdminUserView, AdminSession } from "@/lib/api/types";

export interface AuthState {
  apiUrl: string;
  accessToken: string | null;
  refreshToken: string | null;
  expiresAt: string | null;
  user: AdminUserView | null;
  hasHydrated: boolean;

  setApiUrl: (apiUrl: string) => void;
  setSession: (session: AdminSession) => void;
  setUser: (user: AdminUserView) => void;
  clear: () => void;
  setHasHydrated: (state: boolean) => void;
}

const DEFAULT_API_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      apiUrl: DEFAULT_API_URL,
      accessToken: null,
      refreshToken: null,
      expiresAt: null,
      user: null,
      hasHydrated: false,

      setApiUrl: (apiUrl: string) => set({ apiUrl }),

      setSession: (session: AdminSession) =>
        set({
          accessToken: session.accessToken,
          refreshToken: session.refreshToken,
          expiresAt: session.expiresAt,
          user: session.user,
        }),

      setUser: (user: AdminUserView) => set({ user }),

      clear: () =>
        set({
          accessToken: null,
          refreshToken: null,
          expiresAt: null,
          user: null,
        }),

      setHasHydrated: (hasHydrated: boolean) => set({ hasHydrated }),
    }),
    {
      name: "wallp_admin_auth",
      storage: createJSONStorage(() => {
        if (typeof window !== "undefined") {
          return window.localStorage;
        }
        return {
          getItem: () => null,
          setItem: () => {},
          removeItem: () => {},
        };
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    }
  )
);
