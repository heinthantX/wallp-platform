import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { client } from "@/lib/api/client";
import { useAuthStore } from "@/lib/auth/store";
import QuickThemePage from "./page";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn(), back: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/themes/quick",
}));

const item = (id: string, data: object) => ({ id, status: "published", data: JSON.stringify(data) });
const PALETTE = { background: "#111111", deep: "#000000", surface: "#222222", text: "#ffffff", textMuted: "#999999" };
const option = (n: number) => ({
  seed: n,
  checks: [],
  data: {
    id: `cand-${n}`,
    name: { en: `Candidate ${n}` },
    palette: PALETTE,
    scene: { engine: "layers", params: {} },
    fonts: { display: "x", body: "x", labels: "x" },
    accents: [],
  },
});

async function pick(name: RegExp, option: string) {
  const trigger = await screen.findByRole("combobox", { name });
  await waitFor(() => expect(trigger).not.toBeDisabled());
  fireEvent.click(trigger);
  fireEvent.click(await screen.findByText(option));
}

describe("Quick theme wizard", () => {
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  Element.prototype.scrollIntoView = vi.fn();

  beforeEach(() => {
    vi.restoreAllMocks();
    push.mockClear();
    useAuthStore.getState().setUser({
      id: "a1", email: "a@example.com", name: "Admin", role: "admin",
      createdAt: "2026-10-18T00:00:00Z", disabled: false, totpEnabled: false,
    });
  });

  it("validates each step and saves a draft with wallpaper, icon pack and font", async () => {
    vi.spyOn(client, "GET").mockImplementation((async (path: string) => {
      if (path === "/admin/v1/festivals") return { data: { items: [item("diwali", { name: { en: "Diwali" } })], total: 1 } };
      if (path === "/admin/v1/icon-packs") return { data: { items: [item("pack1", { name: { en: "Pack One" } })], total: 1 } };
      if (path === "/admin/v1/fonts")
        return {
          data: {
            items: [item("creepster", { family: "Creepster" }), item("orbitron", { family: "Orbitron" })],
            total: 2,
          },
        };
      return { data: { items: [], total: 0 } };
    }) as never);
    const posts: Record<string, unknown> = {};
    vi.spyOn(client, "POST").mockImplementation((async (path: string, init: { body: unknown }) => {
      posts[path] = init.body;
      if (path === "/admin/v1/assets")
        return { data: { url: "/a.webp", sha256: "abcdef123456", bytes: 1, format: "webp", width: 10, height: 10, variants: {} } };
      if (path === "/admin/v1/wallpapers") return { data: { id: "shot-abcdef", status: "draft", data: "{}" } };
      if (path === "/admin/v1/themes/generate/from-image")
        return { data: { options: [option(1), option(2), option(3)] } };
      if (path === "/admin/v1/themes") return { data: { id: "cand-2", status: "draft", data: "{}" } };
      return { data: {} };
    }) as never);

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <QuickThemePage />
      </QueryClientProvider>
    );

    const nextBtn = () => screen.getByRole("button", { name: "Next" });
    expect(nextBtn()).toBeDisabled();
    await pick(/^Festival$/, "Diwali");
    expect(nextBtn()).toBeDisabled(); // still no wallpaper
    fireEvent.change(screen.getByTestId("quick-image-input"), {
      target: { files: [new File(["x"], "shot.png", { type: "image/png" })] },
    });
    await waitFor(() => expect(nextBtn()).toBeEnabled());
    fireEvent.click(nextBtn());

    // Step 2: icon pack required; no palette step anywhere
    await screen.findByRole("combobox", { name: /Icon pack/ });
    expect(screen.queryByText("Palette")).toBeNull();
    expect(screen.queryByText("Candidate 1")).toBeNull();
    expect(nextBtn()).toBeDisabled();
    await pick(/Icon pack/, "Pack One");
    fireEvent.click(nextBtn());

    // Step 3: font required, search filters
    const search = await screen.findByLabelText("Search fonts");
    await screen.findByText("Creepster");
    expect(screen.getByText("Orbitron")).toBeTruthy();
    expect(nextBtn()).toBeDisabled();
    fireEvent.change(search, { target: { value: "creep" } });
    expect(screen.queryByText("Orbitron")).toBeNull();
    fireEvent.click(screen.getByText("Creepster"));
    expect(screen.getByTestId("font-preview").textContent).toContain("Creepster");
    fireEvent.click(nextBtn());

    // Step 4: scene optional
    fireEvent.click(nextBtn());
    fireEvent.click(await screen.findByRole("button", { name: /Create draft theme/ }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/themes/edit/?id=cand-2"));
    const saved = JSON.parse(posts["/admin/v1/themes"] as string);
    expect(saved.wallpaperIds).toEqual(["shot-abcdef"]);
    expect(saved.palette).toEqual(PALETTE); // derived from generator top candidate
    expect(saved.iconPackId).toBe("pack1");
    expect(saved.festivalId).toBe("diwali");
    expect(saved.fonts.display).toBe("creepster");
  });

  it("describes a theme with AI: calls suggest + scene, saves a scene wallpaper and selects it", async () => {
    vi.spyOn(client, "GET").mockImplementation((async (path: string) => {
      if (path === "/admin/v1/festivals") return { data: { items: [item("diwali", { name: { en: "Diwali" } })], total: 1 } };
      if (path === "/admin/v1/ai/status")
        return { data: { anyConfigured: true, providers: [{ id: "openrouter", configured: true }, { id: "cloudflare", configured: true }] } };
      return { data: { items: [], total: 0 } };
    }) as never);
    const posts: Record<string, unknown> = {};
    vi.spyOn(client, "POST").mockImplementation((async (path: string, init: { body: unknown }) => {
      posts[path] = init.body;
      if (path === "/admin/v1/ai/scene")
        return { data: { scene: { engine: "layers", params: { layers: [] } }, name: "Lantern", artPrompt: "", artSkipped: true, model: "m" } };
      if (path === "/admin/v1/ai/suggest")
        return { data: { names: [{ en: "Golden Lanterns", my: "x" }], tags: ["diwali"], subtitle: { en: "Warm" }, moodWords: [], model: "m" } };
      return { data: { id: "x", status: "draft", data: "{}" } };
    }) as never);

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <QuickThemePage />
      </QueryClientProvider>
    );
    await pick(/^Festival$/, "Diwali");
    const box = screen.getByLabelText("Describe with AI");
    await waitFor(() => expect(box).not.toBeDisabled());
    fireEvent.change(box, { target: { value: "lantern night" } });
    fireEvent.click(screen.getByRole("button", { name: "Generate" }));

    await waitFor(() => expect(posts["/admin/v1/wallpapers"]).toBeDefined());
    expect(posts["/admin/v1/ai/scene"]).toMatchObject({ description: "lantern night", withArt: true });
    expect(posts["/admin/v1/ai/suggest"]).toMatchObject({ description: "lantern night", kind: "theme" });
    const saved = JSON.parse(posts["/admin/v1/wallpapers"] as string);
    expect(saved.kind).toBe("scene");
    expect(saved.id).toMatch(/^golden-lanterns-[0-9a-f]{6}$/);
    await waitFor(() => expect(document.querySelector(`[data-wallpaper-id="${saved.id}"]`)).not.toBeNull());
  });
});
