import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { client } from "@/lib/api/client";
import { useAuthStore } from "@/lib/auth/store";
import { UploadZone } from "./_components/UploadZone";
import { wallpaperSchema } from "./_components/wallpaperSchema";

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

describe("wallpaper upload", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
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

  it("sends FormData with variants=wallpaper and shows warnings", async () => {
    const asset = (w: number) => ({
      url: `/assets/${w}.webp`,
      sha256: `sha${w}`.padEnd(64, "0"),
      bytes: 1000 * w,
      format: "webp",
      height: w * 2,
      createdAt: "2026-10-18T00:00:00Z",
    });
    const post = vi.spyOn(client, "POST").mockImplementation((async (path: string) => {
      if (path === "/admin/v1/assets") {
        return {
          data: {
            url: "/assets/orig.png",
            sha256: "a".repeat(64),
            bytes: 5000,
            format: "png",
            deduped: false,
            warnings: ["too_small", "clock_contrast"],
            variants: { "1080": asset(1080), "1440": asset(1440) },
          },
        };
      }
      return { data: { id: "x", status: "draft", updatedAt: "now" } };
    }) as never);

    wrap(<UploadZone />);
    const file = new File([new Uint8Array([1, 2, 3])], "night sky.png", { type: "image/png" });
    fireEvent.change(screen.getByTestId("wallpaper-file-input"), { target: { files: [file] } });

    await waitFor(() => expect(screen.getByText("Draft created")).toBeInTheDocument());

    const uploadCall = post.mock.calls.find((c) => c[0] === "/admin/v1/assets")!;
    const opts = uploadCall[1] as unknown as {
      params: { query: { variants: string } };
      body: FormData;
    };
    expect(opts.params.query.variants).toBe("wallpaper");
    expect(opts.body).toBeInstanceOf(FormData);
    expect((opts.body.get("file") as File).name).toBe("night sky.png");

    expect(screen.getByText(/too_small/)).toBeInTheDocument();
    expect(screen.getByText(/clock_contrast/)).toBeInTheDocument();
    expect(screen.getByText(/1080w/)).toBeInTheDocument();
    // a draft wallpaper is created from the upload
    expect(post.mock.calls.some((c) => c[0] === "/admin/v1/wallpapers")).toBe(true);
  });
});

describe("wallpaperSchema", () => {
  const base = { id: "night-sky", name: { en: "Night sky" } };

  it("requires an image for image wallpapers", () => {
    const r = wallpaperSchema.safeParse({ ...base, kind: "image" });
    expect(r.success).toBe(false);
  });

  it("rejects bad ids and empty names", () => {
    expect(wallpaperSchema.safeParse({ id: "Bad Id", name: { en: "" }, kind: "scene" }).success).toBe(false);
  });

  it("scene wallpapers accept hex colours but reject @tokens", () => {
    const ok = {
      ...base,
      kind: "scene",
      scene: { engine: "layers", params: { layers: [{ type: "gradient", colors: ["#000000", "#ffffff"] }] } },
    };
    expect(wallpaperSchema.safeParse(ok).success).toBe(true);
    const bad = {
      ...ok,
      scene: { engine: "layers", params: { layers: [{ type: "gradient", colors: ["@background", "#fff"] }] } },
    };
    const r = wallpaperSchema.safeParse(bad);
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].message).toMatch(/hex colours only/);
  });
});
