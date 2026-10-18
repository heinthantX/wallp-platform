import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { client } from "@/lib/api/client";
import { BannerEditor } from "./BannerEditor";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/banners/new",
}));

const asset = { url: "/assets/b.webp", sha256: "b".repeat(64), bytes: 2048, format: "webp" };

function setup() {
  vi.spyOn(client, "GET").mockResolvedValue({ data: { items: [], total: 0 } } as never);
  const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => asset });
  vi.stubGlobal("fetch", fetchMock);
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <BannerEditor isNew />
    </QueryClientProvider>
  );
  return { fetchMock, input: () => screen.findByLabelText("Upload banner image") };
}

describe("banner image picker", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("uploads, shows in preview, and removes", async () => {
    const { fetchMock, input } = setup();
    fireEvent.change(await screen.findByLabelText("Title"), { target: { value: "Spring Sale" } });
    fireEvent.change(await input(), { target: { files: [new File(["x"], "b.webp", { type: "image/webp" })] } });
    await waitFor(() => expect(screen.getByAltText("Banner image")).toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("preview-banner").style.backgroundImage).toContain("b.webp");
    expect(screen.getByTestId("preview-banner")).toHaveTextContent("Spring Sale");
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    await waitFor(() => expect(screen.queryByAltText("Banner image")).toBeNull());
    expect(screen.getByTestId("preview-banner").style.backgroundImage).toBe("");
  });

  it("rejects gif and >10 MB without uploading", async () => {
    const { fetchMock, input } = setup();
    const el = await input();
    fireEvent.change(el, { target: { files: [new File(["x"], "a.gif", { type: "image/gif" })] } });
    const big = new File(["x"], "big.png", { type: "image/png" });
    Object.defineProperty(big, "size", { value: 11 * 1024 * 1024 });
    fireEvent.change(el, { target: { files: [big] } });
    await new Promise((r) => setTimeout(r, 50));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.queryByAltText("Banner image")).toBeNull();
  });
});
