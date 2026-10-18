import { describe, it, expect } from "vitest";
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { IconPackPreview, type TileShape } from "./IconPackPreview";

function Harness() {
  const [shape, setShape] = React.useState<TileShape>("squircle");
  return <IconPackPreview shape={shape} onShapeChange={setShape} tile="#111111" glyph="#ffffff" ring="#ffffff" />;
}

describe("icon shape switcher", () => {
  it("changes the tile shape", () => {
    render(<Harness />);
    const preview = screen.getByTestId("icon-preview");
    expect(preview).toHaveAttribute("data-shape", "squircle");
    const before = screen.getAllByTestId("icon-tile")[0].style.borderRadius;
    fireEvent.click(screen.getByRole("radio", { name: "circle" }));
    expect(preview).toHaveAttribute("data-shape", "circle");
    expect(screen.getAllByTestId("icon-tile")[0].style.borderRadius).not.toBe(before);
    fireEvent.click(screen.getByRole("radio", { name: "leaf" }));
    expect(preview).toHaveAttribute("data-shape", "leaf");
  });
});
