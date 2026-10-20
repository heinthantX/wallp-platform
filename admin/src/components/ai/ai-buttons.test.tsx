import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AiButtons } from "./AiButtons";

const status = vi.fn();
vi.mock("@/lib/api/hooks/useAiStatus", () => ({ useAiStatus: () => status() }));
const mutate = vi.fn();
const suggest = { mutate, isPending: false, isError: false, error: null, data: undefined as unknown };
vi.mock("@/lib/api/hooks/useAiSuggest", () => ({ useAiSuggest: () => suggest }));

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
    expect(screen.getByText("Set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_AI_TOKEN to enable (free OpenRouter keys have no image models)")).toBeVisible();
    expect(screen.getByText("Set OPENROUTER_API_KEY or GEMINI_API_KEY to enable")).toBeVisible();
  });
  it("enables Generate icons when cloudflare is configured", () => {
    status.mockReturnValue(providers(true));
    render(<AiButtons />);
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
});
