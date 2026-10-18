import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import GeneratorRecipesPage from "./page";
import RecipeEditPage from "./edit/page";
import { client } from "@/lib/api/client";
import { useAuthStore } from "@/lib/auth/store";
import type { RecipeView } from "@/lib/api/types";

const mockPush = vi.fn();
let mockSearchParams = new URLSearchParams();

global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
    replace: vi.fn(),
    back: vi.fn(),
  }),
  useSearchParams: () => mockSearchParams,
  usePathname: () => "/generator/recipes",
}));

const mockRecipeView: RecipeView = {
  id: "spooky-halloween",
  name: "Spooky Halloween",
  festivalId: "halloween",
  enabled: true,
  createdAt: "2026-10-18T10:00:00Z",
  createdBy: "admin",
  updatedAt: "2026-10-18T12:00:00Z",
  updatedBy: "admin",
  data: JSON.stringify({
    id: "spooky-halloween",
    name: "Spooky Halloween",
    festivalIds: ["halloween"],
    tags: ["spooky", "dark"],
    moods: ["cozy", "classic"],
    hueRanges: [[20, 50], [270, 310]],
    chroma: { min: 0.05, max: 0.2 },
    costBudget: 180,
  }),
};

describe("Generator Recipes Pages", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchParams = new URLSearchParams();
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    useAuthStore.setState({
      user: {
        id: "admin-1",
        email: "admin@wallp.app",
        name: "Admin User",
        role: "admin",
        createdAt: "2026-10-18T00:00:00Z",
        disabled: false,
        totpEnabled: false,
      },
    });
  });

  describe("Recipes List Page", () => {
    it("renders recipe list table and action buttons", async () => {
      vi.spyOn(client, "GET").mockImplementation(async (path: string) => {
        if (path === "/admin/v1/generator/recipes") {
          return {
            data: {
              items: [mockRecipeView],
              page: 1,
              perPage: 100,
              total: 1,
            },
          } as unknown as Awaited<ReturnType<typeof client.GET>>;
        }
        if (path === "/admin/v1/festivals") {
          return {
            data: {
              items: [
                {
                  id: "halloween",
                  data: JSON.stringify({ name: { en: "Halloween" } }),
                },
              ],
            },
          } as unknown as Awaited<ReturnType<typeof client.GET>>;
        }
        return { data: {} } as unknown as Awaited<ReturnType<typeof client.GET>>;
      });

      render(
        <QueryClientProvider client={queryClient}>
          <GeneratorRecipesPage />
        </QueryClientProvider>
      );

      await waitFor(() => {
        expect(screen.getByText("Spooky Halloween")).toBeInTheDocument();
        expect(screen.getByText("spooky-halloween")).toBeInTheDocument();
        expect(screen.getByText("Halloween")).toBeInTheDocument();
      });

      // New Recipe button is present
      expect(screen.getByRole("link", { name: /new recipe/i })).toBeInTheDocument();

      // Delete button is present for admin
      const deleteButtons = screen.getAllByTitle("Delete recipe");
      expect(deleteButtons.length).toBe(1);

      // Clicking delete opens AlertDialog
      fireEvent.click(deleteButtons[0]);
      await waitFor(() => {
        expect(screen.getByText("Delete Generator Recipe")).toBeInTheDocument();
      });
    });

    it("hides delete button for non-admin users", async () => {
      useAuthStore.setState({
        user: {
          id: "designer-1",
          email: "designer@wallp.app",
          name: "Designer User",
          role: "designer",
          createdAt: "2026-10-18T00:00:00Z",
          disabled: false,
          totpEnabled: false,
        },
      });

      vi.spyOn(client, "GET").mockImplementation(async (path: string) => {
        if (path === "/admin/v1/generator/recipes") {
          return {
            data: {
              items: [mockRecipeView],
              page: 1,
              perPage: 100,
              total: 1,
            },
          } as unknown as Awaited<ReturnType<typeof client.GET>>;
        }
        return { data: {} } as unknown as Awaited<ReturnType<typeof client.GET>>;
      });

      render(
        <QueryClientProvider client={queryClient}>
          <GeneratorRecipesPage />
        </QueryClientProvider>
      );

      await waitFor(() => {
        expect(screen.getByText("Spooky Halloween")).toBeInTheDocument();
      });

      expect(screen.queryByTitle("Delete recipe")).not.toBeInTheDocument();
    });
  });

  describe("Recipe Edit Page", () => {
    it("renders edit page with tabs and form controls", async () => {
      mockSearchParams = new URLSearchParams("id=spooky-halloween");

      vi.spyOn(client, "GET").mockImplementation(async (path: string) => {
        if (path === "/admin/v1/generator/recipes/{id}") {
          return {
            data: mockRecipeView,
          } as unknown as Awaited<ReturnType<typeof client.GET>>;
        }
        if (path === "/admin/v1/festivals") {
          return {
            data: { items: [] },
          } as unknown as Awaited<ReturnType<typeof client.GET>>;
        }
        return { data: {} } as unknown as Awaited<ReturnType<typeof client.GET>>;
      });

      render(
        <QueryClientProvider client={queryClient}>
          <RecipeEditPage />
        </QueryClientProvider>
      );

      await waitFor(() => {
        expect(screen.getByDisplayValue("Spooky Halloween")).toBeInTheDocument();
        expect(screen.getByDisplayValue("spooky-halloween")).toBeInTheDocument();
      });

      // Tabs exist
      expect(screen.getByRole("tab", { name: /form editor/i })).toBeInTheDocument();
      expect(screen.getByRole("tab", { name: /json/i })).toBeInTheDocument();

      // Switch to JSON tab
      const jsonTab = screen.getByRole("tab", { name: /json/i });
      fireEvent.click(jsonTab);
      await waitFor(() => {
        expect(screen.getByText("Raw Recipe JSON")).toBeInTheDocument();
      });
    });
  });
});
