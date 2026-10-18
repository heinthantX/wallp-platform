import { describe, it, expect, vi } from "vitest";
import React from "react";
import { renderHook, act, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { client } from "@/lib/api/client";
import { useReorderBanners } from "@/lib/api/hooks/useBanners";
import { bannerSchema, defaultBanner, activeOn } from "./schema";

const base = {
  ...defaultBanner,
  id: "spring",
  tag: { en: "New" },
  title: { en: "Spring" },
  subtitle: { en: "Sub" },
  cta: { en: "Go" },
};

describe("banner reorder", () => {
  it("sends the new order", async () => {
    const put = vi.spyOn(client, "PUT").mockResolvedValue({ data: { ok: true } } as never);
    const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    const { result } = renderHook(() => useReorderBanners(), {
      wrapper: ({ children }: { children: React.ReactNode }) => (
        <QueryClientProvider client={qc}>{children}</QueryClientProvider>
      ),
    });
    act(() => result.current.mutate(["b", "a"]));
    await waitFor(() => expect(put).toHaveBeenCalledWith("/admin/v1/banners/order", { body: { ids: ["b", "a"] } }));
  });
});

describe("banner schema", () => {
  it("requires an https link for url actions", () => {
    const bad = bannerSchema.safeParse({ ...base, action: { type: "url", url: "http://x.com" } });
    expect(bad.success).toBe(false);
    expect(bannerSchema.safeParse({ ...base, action: { type: "url" } }).success).toBe(false);
    expect(bannerSchema.safeParse({ ...base, action: { type: "url", url: "https://x.com" } }).success).toBe(true);
  });
  it("filters by start/end", () => {
    const list = [
      { id: "a", startsAt: "2026-12-01T00:00:00Z", endsAt: "2026-12-31T00:00:00Z" },
      { id: "b" },
    ];
    expect(activeOn(list, new Date("2026-12-20T12:00:00Z")).map((b) => b.id)).toEqual(["a", "b"]);
    expect(activeOn(list, new Date("2027-01-05T12:00:00Z")).map((b) => b.id)).toEqual(["b"]);
  });
});
