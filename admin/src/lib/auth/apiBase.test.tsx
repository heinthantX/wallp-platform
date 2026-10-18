import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { renderHook, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useAuthStore, apiBase } from "./store";
import { useUploadAsset } from "@/lib/api/hooks/useFonts";

// B8 (loop-2 P1): apiUrl "" means "use the build's API URL", but raw readers built "/admin/v1/assets"
// and "/assets/..." against the dashboard's own origin (font upload failed, previews never loaded).
describe("apiBase", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useAuthStore.setState({ apiUrl: "", accessToken: "t" });
  });

  it("falls back to the build API URL when no override is saved", () => {
    expect(apiBase("")).toMatch(/^https?:\/\//);
    expect(apiBase("https://api.example.com/")).toBe("https://api.example.com");
  });

  it("font upload posts to the API, not the dashboard origin", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ sha256: "a", format: "ttf", url: "assets/a.ttf", bytes: 1 }), { status: 201 })
    );
    const qc = new QueryClient();
    const { result } = renderHook(() => useUploadAsset(), {
      wrapper: ({ children }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>,
    });
    await act(async () => {
      await result.current.mutateAsync(new File([new Uint8Array([0, 1, 0, 0])], "f.ttf"));
    });
    expect(String(fetchMock.mock.calls[0][0])).toBe(`${apiBase("")}/admin/v1/assets`);
  });
});
