import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { OptionCard } from "./OptionCard";
import type { GeneratorOption } from "@/lib/generator/types";
import type { ThemeDetail } from "@/lib/catalog/types";

const mockTheme: ThemeDetail = {
  id: "cozy-ember-1",
  rev: 0,
  festivalId: "christmas",
  name: { en: "Cozy Hearth" },
  style: "cozy",
  scene: { engine: "layers", params: {} },
  palette: {
    background: "#180a0a",
    deep: "#0f0505",
    surface: "#2b1212",
    text: "#fff5f5",
    textMuted: "#d4b8b8",
    motif: "#ff6b6b",
  },
  accents: [
    {
      id: "ember-gold",
      name: { en: "Ember Gold" },
      type: "solid",
      colors: ["#ffaa00"],
    },
  ],
  fonts: { display: "sans-serif" },
};

const mockOption: GeneratorOption = {
  data: mockTheme,
  seed: 1234,
  checks: [
    { name: "contrast_text_bg", field: "text vs background", ratio: 14.2, min: 4.5, pass: true },
    { name: "contrast_accent_bg", field: "accent vs background", ratio: 6.8, min: 3.0, pass: true },
    { name: "similar_to", field: "halloween-night", ratio: 0.06, min: 0.08, pass: true },
    { name: "cvd_accents_close", field: "accents", ratio: 0.04, min: 0.06, pass: true },
    { name: "scene_cost", field: "budget", ratio: 145, min: 200, pass: true },
  ],
};

describe("OptionCard", () => {
  it("renders skeleton placeholder when loading", () => {
    const { container } = render(
      <OptionCard slotIndex={0} isLoading={true} />
    );
    expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0);
  });

  it("renders option header, name, style, and shortcut number", () => {
    render(
      <OptionCard option={mockOption} slotIndex={0} shortcutKey={1} />
    );
    expect(screen.getAllByText("Cozy Hearth").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("cozy").length).toBeGreaterThan(0);
    expect(screen.getByText("1")).toBeInTheDocument();
  });

  it("renders warning badges for similar_to, cvd_accents_close, and scene_cost", () => {
    render(
      <OptionCard option={mockOption} slotIndex={0} />
    );
    expect(screen.getByText("Similar: halloween-night")).toBeInTheDocument();
    expect(screen.getByText("CVD Close")).toBeInTheDocument();
    expect(screen.getByText("Cost: 145/200")).toBeInTheDocument();
  });

  it("calls action buttons: Shuffle, More like this, Undo, Use this", () => {
    const onShuffle = vi.fn();
    const onMoreLikeThis = vi.fn();
    const onUndo = vi.fn();
    const onUseThis = vi.fn();

    render(
      <OptionCard
        option={mockOption}
        slotIndex={0}
        canUndo={true}
        onShuffle={onShuffle}
        onMoreLikeThis={onMoreLikeThis}
        onUndo={onUndo}
        onUseThis={onUseThis}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /shuffle/i }));
    expect(onShuffle).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: /more like this/i }));
    expect(onMoreLikeThis).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: /undo/i }));
    expect(onUndo).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: /use this/i }));
    expect(onUseThis).toHaveBeenCalledTimes(1);
  });

  it("toggles lock for palette roles on swatch click", () => {
    const onToggleLock = vi.fn();
    render(
      <OptionCard
        option={mockOption}
        slotIndex={0}
        locks={{ background: true }}
        onToggleLock={onToggleLock}
      />
    );

    const bgSwatch = screen.getByLabelText(/palette role background/i);
    expect(bgSwatch).toBeInTheDocument();
    fireEvent.click(bgSwatch);
    expect(onToggleLock).toHaveBeenCalledWith("background");
  });

  it("toggles breed selection", () => {
    const onToggleSelect = vi.fn();
    render(
      <OptionCard
        option={mockOption}
        slotIndex={0}
        isSelected={false}
        onToggleSelect={onToggleSelect}
      />
    );

    const checkbox = screen.getByRole("checkbox");
    fireEvent.click(checkbox);
    expect(onToggleSelect).toHaveBeenCalledWith(true);
  });
});
