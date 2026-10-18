import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as z from "zod";
import { client } from "@/lib/api/client";
import { useAuthStore } from "@/lib/auth/store";
import { ItemEditorShell } from "./ItemEditorShell";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn(), back: vi.fn() }),
  useSearchParams: () => new URLSearchParams("id=inter"),
  usePathname: () => "/fonts/edit",
}));

// B6 (loop-2 P1): fonts, banners and icon packs (all on ItemEditorShell) showed review buttons with no
// handlers, so those items could never be sent to review, approved or duplicated from the dashboard.
describe("ItemEditorShell review actions", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    push.mockReset();
    useAuthStore.getState().setUser({
      id: "d1",
      email: "d@example.com",
      name: "Designer",
      role: "designer",
      createdAt: "2026-10-18T00:00:00Z",
      disabled: false,
      totpEnabled: false,
    });
  });

  function renderShell() {
    const item = { id: "inter", status: "draft", data: JSON.stringify({ id: "inter" }), updatedAt: "2026-10-19T00:00:00Z" };
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
      <QueryClientProvider client={qc}>
        <ItemEditorShell<{ id: string }>
          label="Font"
          basePath="/fonts"
          auditType="font"
          schema={z.object({ id: z.string() })}
          defaults={{ id: "" }}
          useItem={() => ({ data: item as never, isLoading: false, isError: false, error: null, refetch: vi.fn() })}
          save={vi.fn()}
          action={vi.fn()}
          titleOf={(v) => v.id}
        >
          {() => null}
        </ItemEditorShell>
      </QueryClientProvider>
    );
  }

  it("requests review through the item's review endpoint", async () => {
    vi.spyOn(client, "GET").mockResolvedValue({ data: { items: [], total: 0 } } as never);
    const post = vi.spyOn(client, "POST").mockResolvedValue({ data: { id: "inter", status: "in_review" } } as never);
    renderShell();
    fireEvent.click(screen.getByRole("button", { name: /request review/i }));
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith("/admin/v1/fonts/{id}/review", {
        params: { path: { id: "inter" } },
        body: { action: "request" },
      })
    );
  });

  it("duplicates and opens the copy", async () => {
    vi.spyOn(client, "GET").mockResolvedValue({ data: { items: [], total: 0 } } as never);
    const post = vi.spyOn(client, "POST").mockResolvedValue({ data: { id: "inter-copy", status: "draft" } } as never);
    renderShell();
    fireEvent.click(screen.getByRole("button", { name: /duplicate/i }));
    await waitFor(() => expect(post).toHaveBeenCalledWith("/admin/v1/fonts/{id}/duplicate", { params: { path: { id: "inter" } } }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/fonts/edit?id=inter-copy"));
  });

  it("a new, unsaved item shows no review or duplicate actions", () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <ItemEditorShell<{ id: string }>
          label="Font"
          basePath="/fonts"
          auditType="font"
          schema={z.object({ id: z.string() })}
          defaults={{ id: "" }}
          isNew
          useItem={() => ({ data: null, isLoading: false, isError: false, error: null, refetch: vi.fn() })}
          save={vi.fn()}
          action={vi.fn()}
          titleOf={(v) => v.id}
        >
          {() => null}
        </ItemEditorShell>
      </QueryClientProvider>
    );
    expect(screen.queryByRole("button", { name: /request review/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /duplicate/i })).toBeNull();
  });
});
