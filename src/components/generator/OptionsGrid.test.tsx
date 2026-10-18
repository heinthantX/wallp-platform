import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { OptionsGrid } from "./OptionsGrid";
import type { GeneratorOption } from "@/lib/generator/types";
import type { ThemeDetail } from "@/lib/catalog/types";

const mockTheme: ThemeDetail = {
  id: "test-theme",
  rev: 0,
  festivalId: "test",
  name: { en: "Test Theme" },
  scene: { engine: "layers", params: {} },
  palette: {
    background: "#000",
    deep: "#111",
    surface: "#222",
    text: "#fff",
    textMuted: "#ccc",
    motif: "#f00",
  },
  accents: [{ id: "acc1", name: { en: "Acc1" }, type: "solid", colors: ["#0f0"] }],
  fonts: { display: "sans-serif" },
};

const mockOptions: GeneratorOption[] = Array.from({ length: 6 }).map((_, i) => ({
  data: {
    ...mockTheme,
    id: `theme-${i + 1}`,
    name: { en: `Theme #${i + 1}` },
  },
  checks: [],
  seed: i * 100,
}));

describe("OptionsGrid", () => {
  it("renders 6 option cards", () => {
    render(<OptionsGrid options={mockOptions} />);
    expect(screen.getAllByText("Theme #1").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Theme #6").length).toBeGreaterThanOrEqual(1);
  });

  it("handles keyboard shortcuts 1-6 for card selection", () => {
    const onSelectSlot = vi.fn();
    render(<OptionsGrid options={mockOptions} onSelectSlot={onSelectSlot} />);

    fireEvent.keyDown(window, { key: "2" });
    expect(onSelectSlot).toHaveBeenCalledWith(1); // 0-indexed

    fireEvent.keyDown(window, { key: "6" });
    expect(onSelectSlot).toHaveBeenCalledWith(5);
  });

  it("handles keyboard shortcut R for reshuffle all", () => {
    const onReshuffleAll = vi.fn();
    render(<OptionsGrid options={mockOptions} onReshuffleAll={onReshuffleAll} />);

    fireEvent.keyDown(window, { key: "r" });
    expect(onReshuffleAll).toHaveBeenCalledTimes(1);
  });

  it("handles keyboard shortcut B when two options are selected for breed", () => {
    const onBreed = vi.fn();
    render(
      <OptionsGrid
        options={mockOptions}
        selectedBreedSlots={[0, 3]}
        onBreed={onBreed}
      />
    );

    fireEvent.keyDown(window, { key: "b" });
    expect(onBreed).toHaveBeenCalledWith([0, 3]);
  });
});
