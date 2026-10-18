import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { renderHook, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useReorderFestivals } from "./useFestivals";
import { queryKeys } from "@/lib/api/keys";
import { client } from "@/lib/api/client";
import type { PageItemView, ItemView } from "@/lib/api/types";

describe("useReorderFestivals optimistic update", () => {
  let queryClient: QueryClient;

  const itemA: ItemView = {
    id: "fest-a",
    status: "published",
    festivalId: null,
    sort: 0,
    data: "{}",
    rev: 1,
    firstPublishedAt: null,
    scheduledAt: null,
    createdBy: "admin",
    updatedBy: "admin",
    createdAt: "2026-10-18T00:00:00Z",
    updatedAt: "2026-10-18T00:00:00Z",
    hasUnpublishedChanges: false,
    validation: null,
  };

  const itemB: ItemView = {
    ...itemA,
    id: "fest-b",
    sort: 10,
  };

  const initialPage: PageItemView = {
    items: [itemA, itemB],
    page: 1,
    perPage: 20,
    total: 2,
  };

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    queryClient.setQueryData(queryKeys.allFestivals, initialPage);
  });

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  it("optimistically reorders festivals in the cache", async () => {
    let resolvePut: (val: unknown) => void;
    const putPromise = new Promise((resolve) => {
      resolvePut = resolve;
    });

    vi.spyOn(client, "PUT").mockImplementation(async () => {
      await putPromise;
      return { data: { ok: true } } as unknown as Awaited<ReturnType<typeof client.PUT>>;
    });

    const { result } = renderHook(() => useReorderFestivals(), { wrapper });

    // Mutate with reversed order: ["fest-b", "fest-a"]
    act(() => {
      result.current.mutate(["fest-b", "fest-a"]);
    });
    await act(async () => {
      await Promise.resolve();
    });

    // Check optimistic update in queryClient cache immediately
    const cached = queryClient.getQueryData<PageItemView>(queryKeys.allFestivals);
    expect(cached?.items).toBeDefined();
    expect(cached?.items?.[0].id).toBe("fest-b");
    expect(cached?.items?.[0].sort).toBe(0);
    expect(cached?.items?.[1].id).toBe("fest-a");
    expect(cached?.items?.[1].sort).toBe(10);

    // Resolve PUT
    await act(async () => {
      resolvePut!({ ok: true });
    });
  });

  it("rolls back to original order if the server returns an error", async () => {
    vi.spyOn(client, "PUT").mockRejectedValue(new Error("Network failure"));

    const { result } = renderHook(() => useReorderFestivals(), { wrapper });

    await act(async () => {
      try {
        await result.current.mutateAsync(["fest-b", "fest-a"]);
      } catch {
        // Expected failure
      }
    });

    // Cache should be rolled back to original order
    const cached = queryClient.getQueryData<PageItemView>(queryKeys.allFestivals);
    expect(cached?.items?.[0].id).toBe("fest-a");
    expect(cached?.items?.[1].id).toBe("fest-b");
  });
});
