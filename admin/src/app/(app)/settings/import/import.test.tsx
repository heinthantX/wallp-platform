import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import SettingsImportPage from "./page";
import { client } from "@/lib/api/client";
import { useAuthStore } from "@/lib/auth/store";

describe("SettingsImportPage", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    // Configure admin user in auth store
    useAuthStore.getState().setUser({
      id: "admin-1",
      email: "admin@example.com",
      name: "Admin User",
      role: "admin",
      createdAt: "2026-10-18T00:00:00Z",
      disabled: false,
      totpEnabled: false,
    });
  });

  it("renders result table from a mocked response", async () => {
    const mockImportResponse = {
      festivals: 3,
      themes: 7,
      wallpapers: 4,
      fonts: 6,
      iconPacks: 2,
      banners: 1,
      counts: {
        festivals: 3,
        themes: 7,
        wallpapers: 4,
        fonts: 6,
        iconPacks: 2,
        banners: 1,
      },
    };

    const postSpy = vi.spyOn(client, "POST").mockImplementation(async (path: string) => {
      if (path === "/admin/v1/import") {
        return {
          data: mockImportResponse,
        } as unknown as Awaited<ReturnType<typeof client.POST>>;
      }
      return { data: {} } as unknown as Awaited<ReturnType<typeof client.POST>>;
    });

    render(
      <QueryClientProvider client={queryClient}>
        <SettingsImportPage />
      </QueryClientProvider>
    );

    // Initial heading is visible
    expect(screen.getByText("Catalog Import & Export")).toBeInTheDocument();

    // Stage a catalog.json file using the hidden file input
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(fileInput).not.toBeNull();

    const catalogFile = new File(['{"festivals":[]}'], "catalog.json", {
      type: "application/json",
    });

    fireEvent.change(fileInput, { target: { files: [catalogFile] } });

    // The file should now be staged
    await waitFor(() => {
      expect(screen.getByText("Staged Files for Import")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /start import/i })).toBeInTheDocument();
    });

    // Click "Start Import"
    fireEvent.click(screen.getByRole("button", { name: /start import/i }));

    // Result table should be rendered with summary counts
    await waitFor(() => {
      expect(screen.getByText("Import Summary")).toBeInTheDocument();
      expect(screen.getByText("Festivals")).toBeInTheDocument();
      expect(screen.getByText("3")).toBeInTheDocument();
      expect(screen.getByText("Themes")).toBeInTheDocument();
      expect(screen.getByText("7")).toBeInTheDocument();
      expect(screen.getByText("Wallpapers")).toBeInTheDocument();
      expect(screen.getByText("4")).toBeInTheDocument();
      expect(screen.getByText("Fonts")).toBeInTheDocument();
      expect(screen.getByText("6")).toBeInTheDocument();
      expect(screen.getByText("Icon Packs")).toBeInTheDocument();
      expect(screen.getByText("2")).toBeInTheDocument();
      expect(screen.getByText("Banners")).toBeInTheDocument();
      expect(screen.getByText("1")).toBeInTheDocument();
    });

    expect(postSpy).toHaveBeenCalledWith(
      "/admin/v1/import",
      expect.objectContaining({
        body: expect.any(FormData),
      })
    );
  });
});
