import { describe, it, expect, vi, afterEach } from "vitest";
import React from "react";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { client } from "@/lib/api/client";
import { fontSchema, defaultFont } from "./schema";
import { GoogleFontDialog } from "./GoogleFontDialog";

afterEach(() => vi.restoreAllMocks());

const validFont = {
  ...defaultFont,
  id: "padauk",
  family: "Padauk",
  license: "OFL-1.1",
  files: [{ weight: 400, style: "normal", asset: { url: "/assets/a.ttf", sha256: "a".repeat(64), bytes: 10, format: "ttf" } }],
};

describe("font form", () => {
  it("requires a license", () => {
    const r = fontSchema.safeParse({ ...validFont, license: "" });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues.some((i) => i.path[0] === "license")).toBe(true);
  });
  it("accepts OFL-1.1 and rejects other licenses", () => {
    expect(fontSchema.safeParse(validFont).success).toBe(true);
    expect(fontSchema.safeParse({ ...validFont, license: "MIT" }).success).toBe(false);
  });
});

describe("GoogleFontDialog", () => {
  it("searches (debounced) and imports", async () => {
    const get = vi.spyOn(client, "GET").mockResolvedValue({
      data: [{ family: "Padauk", category: "SANS_SERIF", subsets: ["myanmar"], variants: ["regular", "700"] }],
    } as never);
    const post = vi.spyOn(client, "POST").mockResolvedValue({ data: { id: "padauk" } } as never);
    const onImported = vi.fn();
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <GoogleFontDialog open onOpenChange={() => {}} onImported={onImported} />
      </QueryClientProvider>
    );
    fireEvent.change(screen.getByLabelText("Search Google Fonts"), { target: { value: "Pad" } });
    await waitFor(() =>
      expect(get).toHaveBeenCalledWith("/admin/v1/fonts/google", { params: { query: { q: "Pad" } } })
    );
    fireEvent.click(await screen.findByRole("button", { name: "Import" }));
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith("/admin/v1/fonts/google/import", {
        body: { family: "Padauk", variants: ["regular", "700"] },
      })
    );
    await waitFor(() => expect(onImported).toHaveBeenCalledWith("padauk"));
  });
});
