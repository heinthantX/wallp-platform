import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { AiButtons } from "./AiButtons";

const status = vi.fn();
vi.mock("@/lib/api/hooks/useAiStatus", () => ({ useAiStatus: () => status() }));

const providers = (cf: boolean) => ({
  data: {
    anyConfigured: cf,
    providers: [
      { id: "openrouter", kind: "text", configured: false, envKeys: ["OPENROUTER_API_KEY"] },
      { id: "gemini", kind: "text", configured: false, envKeys: ["GEMINI_API_KEY"] },
      { id: "cloudflare", kind: "image", configured: cf, envKeys: ["CLOUDFLARE_ACCOUNT_ID", "CLOUDFLARE_AI_TOKEN"] },
    ],
  },
  isLoading: false,
  isError: false,
});

describe("AiButtons", () => {
  beforeEach(() => status.mockReset());
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
    render(<AiButtons />);
    expect(screen.getByRole("button", { name: "Generate icons" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Suggest names" })).toBeDisabled();
  });
});
