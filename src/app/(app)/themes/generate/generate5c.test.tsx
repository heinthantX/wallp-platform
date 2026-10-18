import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import ThemeGeneratePage from "./page";
import { client } from "@/lib/api/client";
import { queryKeys } from "@/lib/api/keys";
import type { ThemeDetail } from "@/lib/catalog/types";

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
  usePathname: () => "/themes/generate",
}));

function createMockTheme(id: string, name: string): ThemeDetail {
  return {
    id,
    rev: 1,
    festivalId: "christmas",
    name: { en: name },
    style: "cozy",
    palette: {
      background: "#0c0a1a",
      deep: "#05040a",
      surface: "#18142c",
      text: "#ffffff",
      textMuted: "#9b92c4",
      motif: "#ff7700",
    },
    accents: [
      {
        id: "accent-1",
        name: { en: "Warm Gold" },
        type: "solid",
        colors: ["#ffd700"],
      },
    ],
    fonts: {
      display: "Inter",
      body: "Inter",
      labels: "Inter",
    },
    clock: {
      useAccent: true,
    },
    labels: {
      color: "#ffffff",
    },
    scene: {
      engine: "layers",
      params: {},
    },
  };
}

type PostRet = Awaited<ReturnType<typeof client.POST>>;
const ok = (data: unknown) => ({ data }) as unknown as PostRet;
const mkOptions = (prefix: string, base: number) =>
  Array.from({ length: 6 }).map((_, i) => ({
    seed: base + i,
    data: createMockTheme(`${prefix}-${i}`, `${prefix} ${i}`),
    checks: [],
  }));

describe("ThemeGeneratePage 5c photo / breed / feedback", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.restoreAllMocks();
    global.URL.createObjectURL = vi.fn(() => "blob:mock");
    global.URL.revokeObjectURL = vi.fn();
    vi.clearAllMocks();
    mockSearchParams = new URLSearchParams("festivalId=christmas&mood=cozy");
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    queryClient.setQueryData(queryKeys.festivals({ perPage: 100 }), {
      items: [{ id: "christmas", data: JSON.stringify({ name: { en: "Christmas" } }) }],
      page: 1,
      perPage: 100,
      total: 1,
    });
  });

  const renderPage = () =>
    render(
      <QueryClientProvider client={queryClient}>
        <ThemeGeneratePage />
      </QueryClientProvider>
    );

  it("photo drop sends FormData and renders swatches", async () => {
    const postSpy = vi.spyOn(client, "POST").mockImplementation(async (path: string) => {
      if (path === "/admin/v1/themes/generate/from-image") {
        return ok({
          swatches: [{ hex: "#aa2200", share: 0.6 }, { hex: "#003366", share: 0.4 }],
          seed: 42,
          options: mkOptions("Photo", 100),
        });
      }
      return ok({});
    });
    renderPage();

    const file = new File(["x"], "pic.png", { type: "image/png" });
    fireEvent.drop(screen.getByRole("button", { name: /upload photo/i }), {
      dataTransfer: { files: [file] },
    });

    await waitFor(() => expect(screen.getByText("Pick & Refine Options")).toBeInTheDocument());
    const call = postSpy.mock.calls.find((c) => c[0] === "/admin/v1/themes/generate/from-image");
    const body = (call![1] as { body: FormData }).body;
    expect(body).toBeInstanceOf(FormData);
    expect(body.get("image")).toBeInstanceOf(File);
    expect(body.get("mood")).toBe("cozy");
    expect(screen.getByRole("button", { name: /pick color #aa2200/i })).toBeInTheDocument();
  });

  it("breed sends both themes and pushes history (undo restores)", async () => {
    const initial = mkOptions("Parent", 200);
    const children = mkOptions("Child", 300);
    const postSpy = vi.spyOn(client, "POST").mockImplementation(async (path: string) => {
      if (path === "/admin/v1/themes/generate") return ok({ seed: 1, options: initial });
      if (path === "/admin/v1/themes/generate/breed") return ok({ seed: 2, options: children });
      return ok({});
    });
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /generate themes/i }));
    await waitFor(() => expect(screen.getAllByText("Parent 0").length).toBeGreaterThan(0));

    const boxes = screen.getAllByRole("checkbox", { name: /breed/i });
    fireEvent.click(boxes[0]);
    fireEvent.click(boxes[1]);
    fireEvent.keyDown(window, { key: "b" });

    await waitFor(() => expect(screen.getAllByText("Child 0").length).toBeGreaterThan(0));
    const call = postSpy.mock.calls.find((c) => c[0] === "/admin/v1/themes/generate/breed");
    const sent = (call![1] as { body: { a: { id: string }; b: { id: string } } }).body;
    expect(sent.a.id).toBe("Parent-0");
    expect(sent.b.id).toBe("Parent-1");

    fireEvent.click(screen.getAllByRole("button", { name: /^undo$/i })[0]);
    await waitFor(() => expect(screen.getAllByText("Parent 0").length).toBeGreaterThan(0));
  });

  it("Use this sends accepted feedback", async () => {
    const initial = mkOptions("Pick", 500);
    const postSpy = vi.spyOn(client, "POST").mockImplementation(async (path: string) => {
      if (path === "/admin/v1/themes/generate") return ok({ seed: 1, options: initial });
      return ok({});
    });
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /generate themes/i }));
    await waitFor(() => expect(screen.getAllByText("Pick 0").length).toBeGreaterThan(0));

    fireEvent.click(screen.getAllByRole("button", { name: /^use this$/i })[0]);
    await waitFor(() => expect(screen.getByText("Review & Save Theme")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /use this theme/i }));

    await waitFor(() => {
      const call = postSpy.mock.calls.find((c) => c[0] === "/admin/v1/generator/feedback");
      expect(call).toBeDefined();
      const b = (call![1] as { body: { action: string; seed: number } }).body;
      expect(b.action).toBe("accepted");
      expect(b.seed).toBe(500);
    });
  });
});
