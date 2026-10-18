import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { client } from "@/lib/api/client";
import { useAuthStore } from "@/lib/auth/store";
import { WallpaperEditor } from "./_components/WallpaperEditor";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/wallpapers/edit",
}));

// B1 (loop-2 P1): editing an existing draft must not let the ID drift (typed or auto-derived from the
// name), or autosave PATCHes /wallpapers/{newId} and fails with "wallpaper not found".
describe("WallpaperEditor identifier", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useAuthStore.getState().setUser({
      id: "a1",
      email: "a@example.com",
      name: "Admin",
      role: "admin",
      createdAt: "2026-10-18T00:00:00Z",
      disabled: false,
      totpEnabled: false,
    });
  });

  it("locks the ID of an existing, never-published wallpaper", async () => {
    const data = { id: "loop-test", name: { en: "Loop Test" }, kind: "image", tags: [] };
    vi.spyOn(client, "GET").mockImplementation((async (path: string) => {
      if (path === "/admin/v1/wallpapers/{id}") {
        return {
          data: {
            id: "loop-test",
            status: "draft",
            data: JSON.stringify(data),
            firstPublishedAt: null,
            updatedAt: "2026-10-19T00:00:00Z",
          },
        };
      }
      return { data: { items: [], total: 0 } };
    }) as never);

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <WallpaperEditor id="loop-test" />
      </QueryClientProvider>
    );

    const input = await screen.findByDisplayValue("loop-test");
    await waitFor(() => expect(input).toBeDisabled());
  });
});
