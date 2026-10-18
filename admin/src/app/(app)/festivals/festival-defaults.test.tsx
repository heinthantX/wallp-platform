import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { client } from "@/lib/api/client";
import { useAuthStore } from "@/lib/auth/store";
import FestivalEditPage from "./edit/page";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/festivals/edit",
}));

// B14 (loop-2 P1): a new festival's default display font must be a font id, or the
// first save already shows "displayFont must be lowercase kebab-case".
describe("New festival defaults", () => {
  it("saves a font id as the default display font", async () => {
    useAuthStore.getState().setUser({
      id: "a1", email: "a@example.com", name: "Admin", role: "admin",
      createdAt: "2026-10-18T00:00:00Z", disabled: false, totpEnabled: false,
    });
    vi.spyOn(client, "GET").mockResolvedValue({ data: { items: [], total: 0 } } as never);
    const sent: string[] = [];
    const capture = (async (_path: string, init: { body?: unknown }) => {
      sent.push(typeof init?.body === "string" ? init.body : JSON.stringify(init?.body));
      return { data: { id: "x", status: "draft", data: "{}", updatedAt: "2026-10-19T00:00:00Z" } };
    }) as never;
    vi.spyOn(client, "POST").mockImplementation(capture);
    vi.spyOn(client, "PUT").mockImplementation(capture);

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <FestivalEditPage />
      </QueryClientProvider>
    );
    const name = (await screen.findAllByPlaceholderText(/english text/i))[0];
    fireEvent.change(name, { target: { value: "Loop Fest" } });
    fireEvent.click(await screen.findByRole("button", { name: /save draft/i }));

    await waitFor(() => expect(sent.length).toBeGreaterThan(0));
    expect(sent.join("")).toMatch(/displayFont\\?":\s*\\?"[a-z0-9]+(-[a-z0-9]+)*\\?"/);
  });
});
