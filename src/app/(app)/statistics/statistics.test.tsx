import { describe, it, expect, vi, afterEach } from "vitest";
import React from "react";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { client } from "@/lib/api/client";
import { useAuthStore } from "@/lib/auth/store";
import OverviewPage from "../page";
import StatisticsPage from "./page";
import { statsToCsv } from "./csv";

const replace = vi.fn();
let search = "";
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(search),
}));

afterEach(() => vi.restoreAllMocks());

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

describe("overview", () => {
  it("renders countdown and warning chip", async () => {
    useAuthStore.setState({ user: { role: "admin" } } as never);
    vi.spyOn(client, "GET").mockImplementation(((url: string) =>
      Promise.resolve({
        data: url === "/admin/v1/overview"
          ? {
              nextFestivals: [{ id: "f1", name: "Halloween", nextDate: "2026-10-31", nightsUntil: 16, publishedThemes: 4, warning: "only 1 theme" }],
              reviewQueue: [], topThemesWeek: [], lastRelease: {},
            }
          : { items: [] },
      })) as never);
    wrap(<OverviewPage />);
    expect(await screen.findByText("Halloween in 16 nights · 4 themes")).toBeInTheDocument();
    expect(screen.getByText("only 1 theme")).toBeInTheDocument();
  });
});

describe("statistics", () => {
  it("refetches with new range on preset change", async () => {
    const get = vi.spyOn(client, "GET").mockResolvedValue({ data: { items: [] } } as never);
    search = "";
    wrap(<StatisticsPage />);
    await waitFor(() => expect(get).toHaveBeenCalled());
    const span = (call: unknown[]) => {
      const q = (call[1] as { params: { query: { from: string; to: string } } }).params.query;
      return (Date.parse(q.to) - Date.parse(q.from)) / 86400000;
    };
    expect(span(get.mock.calls[0])).toBe(29);
    fireEvent.click(screen.getByRole("button", { name: "7d" }));
    expect(replace).toHaveBeenCalledWith("/statistics?range=7");
  });

  it("refetches when the range query changes", async () => {
    const get = vi.spyOn(client, "GET").mockResolvedValue({ data: { items: [] } } as never);
    search = "range=7";
    wrap(<StatisticsPage />);
    await waitFor(() => expect(get).toHaveBeenCalled());
    const q = (get.mock.calls[0][1] as { params: { query: { from: string; to: string } } }).params.query;
    expect((Date.parse(q.to) - Date.parse(q.from)) / 86400000).toBe(6);
  });

  it("builds CSV for 2 rows", () => {
    expect(
      statsToCsv([
        { themeId: "a", applies: 3, favourites: 1, popularity: 0.5 },
        { themeId: "b", applies: 2, favourites: 0, popularity: 0.25 },
      ])
    ).toBe('themeId,applies,favourites,popularity\n"a",3,1,0.5\n"b",2,0,0.25');
  });
});
