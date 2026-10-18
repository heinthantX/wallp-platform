import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Layer, Palette } from "@/lib/catalog/types";
import { LayersEditor } from "./LayersEditor";
import { layersSchema, isLive } from "./schema";

const palette: Palette = { background: "#000000", deep: "#000000", surface: "#111111", text: "#ffffff", textMuted: "#999999" };
const grad: Layer = { type: "gradient", colors: ["#111111", "#222222"] };
const particles = (o: Partial<Layer> = {}) => ({ type: "particles", effect: "snow", count: 10, color: "#FFFFFF", ...o }) as Layer;
const shape = (o: Partial<Layer> = {}) => ({ type: "shape", shape: "circle", x: 0.5, y: 0.5, width: 0.5, color: "#FF0000", ...o }) as Layer;

function setup(initial: Layer[], allowTokens = false) {
  const onChange = vi.fn();
  const qc = new QueryClient();
  const ui = (v: Layer[]) => (
    <QueryClientProvider client={qc}>
      <LayersEditor value={v} onChange={onChange} allowTokens={allowTokens} palette={palette} />
    </QueryClientProvider>
  );
  const r = render(ui(initial));
  return { onChange, rerender: (v: Layer[]) => r.rerender(ui(v)) };
}

describe("layers schema", () => {
  const ok = (l: unknown, t = true) => layersSchema(t).safeParse([l]).success;
  it("rejects out-of-limit values", () => {
    expect(ok(particles({ count: 151 } as never))).toBe(false);
    expect(ok(particles({ count: 150 } as never))).toBe(true);
    expect(ok(shape({ width: 3.1 } as never))).toBe(false);
    expect(ok(shape({ shape: "polygon", points: [[0, 0], [1, 1.2], [0, 1]] } as never))).toBe(false);
    expect(ok(shape({ shape: "polygon", points: [[0, 0], [1, 1], [0, 1]] } as never))).toBe(true);
    expect(ok(shape({ shape: "polygon" } as never))).toBe(false);
  });
  it("rejects tokens in wallpaper mode only", () => {
    const t = shape({ color: "@motif" } as never);
    expect(ok(t, false)).toBe(false);
    expect(ok(t, true)).toBe(true);
  });
});

describe("isLive", () => {
  it("is true for moving shapes and particles with speed", () => {
    expect(isLive([grad])).toBe(false);
    expect(isLive([shape()])).toBe(false);
    expect(isLive([shape({ motion: "none" } as never)])).toBe(false);
    expect(isLive([shape({ motion: "pulse" } as never)])).toBe(true);
    expect(isLive([particles({ speed: 0 } as never)])).toBe(false);
    expect(isLive([particles()])).toBe(true);
  });
  it("shows the badge", () => {
    setup([particles()]);
    expect(screen.getByTestId("live-badge")).toBeInTheDocument();
  });
});

describe("LayersEditor", () => {
  it("adds a layer", () => {
    const { onChange } = setup([grad]);
    fireEvent.click(screen.getByText("Add layer"));
    fireEvent.click(screen.getByRole("menuitem", { name: /particles/i }));
    expect(onChange.mock.calls[0][0]).toHaveLength(2);
    expect(onChange.mock.calls[0][0][1].type).toBe("particles");
  });

  it("alt+arrow reorders and Delete removes", () => {
    const { onChange } = setup([grad, shape()]);
    fireEvent.click(screen.getByText("gradient"));
    const root = screen.getByTestId("layers-editor");
    fireEvent.keyDown(root, { key: "ArrowDown", altKey: true });
    expect(onChange.mock.calls[0][0].map((l: Layer) => l.type)).toEqual(["shape", "gradient"]);
    fireEvent.keyDown(root, { key: "Delete" });
    expect(onChange.mock.calls[1][0].map((l: Layer) => l.type)).toEqual(["shape"]);
  });

  it("Cmd+D duplicates the selected layer", () => {
    const { onChange } = setup([grad, shape()]);
    fireEvent.click(screen.getByText("shape"));
    fireEvent.keyDown(screen.getByTestId("layers-editor"), { key: "d", metaKey: true });
    expect(onChange.mock.calls[0][0].map((l: Layer) => l.type)).toEqual(["gradient", "shape", "shape"]);
  });

  it("shows inline limit errors", () => {
    setup([particles({ count: 151 } as never)]);
    fireEvent.click(screen.getByText("particles"));
    expect(screen.getByLabelText("Count")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText("1 to 150")).toBeInTheDocument();
  });
});
