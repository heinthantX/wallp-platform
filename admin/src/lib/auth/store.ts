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

// apiUrl holds only a user-chosen override; "" means "use the build's NEXT_PUBLIC_API_URL".
const DEFAULT_API_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

/** The API origin to call: the saved override, else the build default. No trailing slash. */
export function apiBase(apiUrl: string): string {
  return (apiUrl || DEFAULT_API_URL).replace(/\/+$/, "");
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      apiUrl: "",
      accessToken: null,
      refreshToken: null,
      expiresAt: null,
      user: null,
      hasHydrated: false,

      setApiUrl: (apiUrl: string) =>
        set({ apiUrl: apiUrl.replace(/\/+$/, "") === DEFAULT_API_URL.replace(/\/+$/, "") ? "" : apiUrl }),

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
      // v1: older builds saved the build default as apiUrl, which pinned deployed
      // dashboards to localhost; drop it so the build's API URL applies.
      version: 1,
      migrate: (persisted) => ({ ...(persisted as object), apiUrl: "" }) as AuthState,
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
