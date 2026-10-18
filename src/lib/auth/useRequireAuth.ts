"use client";

import { useEffect } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useAuthStore } from "@/lib/auth/store";

export function useRequireAuth() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const user = useAuthStore((s) => s.user);
  const accessToken = useAuthStore((s) => s.accessToken);
  const hasHydrated = useAuthStore((s) => s.hasHydrated);

  useEffect(() => {
    if (!hasHydrated) return;

    if (!accessToken) {
      const fullPath = searchParams?.toString()
        ? `${pathname}?${searchParams.toString()}`
        : pathname;
      const next = encodeURIComponent(fullPath || "/");
      router.replace(`/login?next=${next}`);
    }
  }, [hasHydrated, accessToken, pathname, searchParams, router]);

  return {
    user,
    isAuthenticated: !!accessToken,
    isLoading: !hasHydrated,
  };
}
