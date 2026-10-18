import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { client } from "@/lib/api/client";
import { IconPackEditor } from "./IconPackEditor";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  useSearchParams: () => new URLSearchParams("id=web-slinger"),
  usePathname: () => "/icon-packs/edit",
}));

// B9 (loop-2 P1): the audit panel asked for itemType "icon-pack"; the API records "icon_pack".
describe("IconPackEditor audit", () => {
  it("queries audit with the API's item type", async () => {
    const get = vi.spyOn(client, "GET").mockImplementation((async (path: string) => {
      if (path === "/admin/v1/icon-packs/{id}") {
        return { data: { id: "web-slinger", status: "draft", data: JSON.stringify({ id: "web-slinger", name: { en: "W" } }), updatedAt: "2026-10-19T00:00:00Z" } };
      }
      return { data: { items: [], total: 0 } };
    }) as never);
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <IconPackEditor />
      </QueryClientProvider>
    );
    await waitFor(() => {
      const call = get.mock.calls.find((c) => c[0] === "/admin/v1/audit");
      expect((call?.[1] as unknown as { params: { query: { itemType: string } } })?.params.query.itemType).toBe("icon_pack");
    });
  });
});
