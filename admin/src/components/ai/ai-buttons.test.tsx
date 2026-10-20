import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ApiError } from "@/lib/api/error";
import { AiButtons } from "./AiButtons";

const status = vi.fn();
vi.mock("@/lib/api/hooks/useAiStatus", () => ({ useAiStatus: () => status() }));
const mutate = vi.fn();
const suggest = { mutate, isPending: false, isError: false, error: null, data: undefined as unknown };
vi.mock("@/lib/api/hooks/useAiSuggest", () => ({ useAiSuggest: () => suggest }));

const mutateAsync = vi.fn();
vi.mock("@/lib/api/hooks/useAiImages", () => ({ useAiImage: () => ({ mutateAsync }) }));
const res = (n: string) => ({ asset: { url: `/u/${n}.png`, sha256: n, bytes: 1, format: "png" }, model: "m", prompt: "p" });
const apps = [{ pkg: "a.phone", label: "Phone", subject: "a telephone handset" }, { pkg: "a.cam", label: "Camera", subject: "a camera" }, { pkg: "a.map", label: "Maps", subject: "a folded map" }];

const providers = (cf: boolean, or = false) => ({
  data: {
    anyConfigured: cf || or,
    providers: [
      { id: "openrouter", kind: "text", configured: or, envKeys: ["OPENROUTER_API_KEY"] },
      { id: "gemini", kind: "text", configured: false, envKeys: ["GEMINI_API_KEY"] },
      { id: "cloudflare", kind: "image", configured: cf, envKeys: ["CLOUDFLARE_ACCOUNT_ID", "CLOUDFLARE_AI_TOKEN"] },
    ],
  },
  isLoading: false,
  isError: false,
});

describe("AiButtons", () => {
  beforeEach(() => {
    status.mockReset();
    mutate.mockReset();
    suggest.data = undefined;
  });
  it("disables both with visible reasons when unconfigured", () => {
    status.mockReturnValue(providers(false));
    render(<AiButtons />);
    expect(screen.getByRole("button", { name: "Suggest names" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Generate icons" })).toBeDisabled();
    expect(screen.getByText("Set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_AI_TOKEN to enable")).toBeVisible();
    expect(screen.getByText("Set OPENROUTER_API_KEY or GEMINI_API_KEY to enable")).toBeVisible();
  });
  it("enables Generate icons when cloudflare is configured", () => {
    status.mockReturnValue(providers(true));
    render(<AiButtons onIcons={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Generate icons" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Suggest names" })).toBeDisabled();
  });
  it("suggests names with OpenRouter and applies the picked one", () => {
    status.mockReturnValue(providers(false, true));
    suggest.data = { names: [{ en: "Night Glyphs", my: "ညအိုင်ကွန်" }], tags: ["minimal"], moodWords: [], subtitle: { en: "" }, model: "x" };
    const pick = vi.fn();
    render(<AiButtons kind="iconPack" defaultDescription="white glyphs" onPickName={pick} />);
    fireEvent.click(screen.getByRole("button", { name: "Suggest names" }));
    expect(screen.getByLabelText("Describe it")).toHaveValue("white glyphs");
    fireEvent.click(screen.getByRole("button", { name: "Suggest" }));
    expect(mutate).toHaveBeenCalledWith({ description: "white glyphs", kind: "iconPack" });
    fireEvent.click(screen.getByRole("button", { name: /Night Glyphs/ }));
    expect(pick).toHaveBeenCalledWith({ en: "Night Glyphs", my: "ညအိုင်ကွန်" });
  });
  it("generates icons sequentially and reports each via onIcons", async () => {
    status.mockReturnValue(providers(true));
    mutateAsync.mockReset().mockResolvedValueOnce(res("1")).mockResolvedValueOnce(res("2"));
    const onIcons = vi.fn();
    render(<AiButtons missingApps={apps.slice(0, 2)} styleHint="neon" onIcons={onIcons} />);
    fireEvent.click(screen.getByRole("button", { name: "Generate icons" }));
    expect(screen.getByText(/100 icons\/day/)).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Generate" }));
    await waitFor(() => expect(onIcons).toHaveBeenCalledTimes(2));
    expect(mutateAsync).toHaveBeenNthCalledWith(1, { prompt: "a telephone handset, neon", purpose: "icon" });
    expect(Object.keys(onIcons.mock.calls[0][0])).toEqual(["a.phone"]);
    expect(Object.keys(onIcons.mock.calls[1][0])).toEqual(["a.cam"]);
  });
  it("stops the loop on a 429 and keeps earlier icons", async () => {
    status.mockReturnValue(providers(true));
    mutateAsync.mockReset().mockResolvedValueOnce(res("1")).mockRejectedValueOnce(new ApiError(429, "ai_rate_limited", "Daily limit reached"));
    const onIcons = vi.fn();
    render(<AiButtons missingApps={apps} styleHint="neon" onIcons={onIcons} />);
    fireEvent.click(screen.getByRole("button", { name: "Generate icons" }));
    fireEvent.click(screen.getByRole("button", { name: "Generate" }));
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getByRole("button", { name: "Generate" })).toBeEnabled());
    expect(mutateAsync).toHaveBeenCalledTimes(2);
    expect(onIcons).toHaveBeenCalledTimes(1);
  });
});
