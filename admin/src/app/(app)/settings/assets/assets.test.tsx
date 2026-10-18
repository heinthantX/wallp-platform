import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import AssetsPage from "./page";
import { client } from "@/lib/api/client";
import { ApiError } from "@/lib/api/error";
import { useAuthStore } from "@/lib/auth/store";

const sha = "b".repeat(64);

function setRole(role: "admin" | "designer") {
  useAuthStore.getState().setUser({
    id: "u1",
    email: "u@example.com",
    name: "U",
    role,
    createdAt: "2026-10-18T00:00:00Z",
    disabled: false,
    totpEnabled: false,
  });
}

function renderPage() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <AssetsPage />
    </QueryClientProvider>
  );
}

describe("AssetsPage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(client, "GET").mockResolvedValue({
      data: {
        items: [
          { sha256: sha, url: `/assets/${sha}.png`, bytes: 2048, format: "png", width: 1440, height: 3120, createdAt: "2026-10-18T00:00:00Z" },
        ],
        page: 1,
        perPage: 100,
        total: 1,
      },
    } as never);
  });

  it("shows the 409 asset_in_use message when delete is refused", async () => {
    setRole("admin");
    vi.spyOn(client, "DELETE").mockRejectedValue(
      new ApiError(409, "asset_in_use", "Used by wallpaper night-sky")
    );
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: /Delete bbbbbbbbbbbb/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Delete", exact: true } as never));
    const alert = await screen.findByRole("alert");
    await waitFor(() => expect(alert).toHaveTextContent("Used by wallpaper night-sky"));
    expect(alert).toHaveTextContent("asset_in_use");
  });

  it("is admin only", () => {
    setRole("designer");
    renderPage();
    expect(screen.getByText("Admins only")).toBeInTheDocument();
  });
});
