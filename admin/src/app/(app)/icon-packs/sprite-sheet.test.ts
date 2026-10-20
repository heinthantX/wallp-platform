import { describe, it, expect } from "vitest";
import { sampleBackground, alphaOf, alphaMap, isColourful, fixedGrid, gridRects, detectGrid, sliceSheet, rowsFor, type PixelData } from "./sprite-sheet";

const BG: [number, number, number] = [20, 20, 30];

// cols x rows cells of `cell` px; glyph = filled square in the listed cells.
function sheet(cols: number, rows: number, cell: number, filled: number[], gutter = 0, ink: [number, number, number] = [255, 255, 255]): PixelData {
  const width = cols * cell, height = rows * cell;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) { data[i * 4] = BG[0]; data[i * 4 + 1] = BG[1]; data[i * 4 + 2] = BG[2]; data[i * 4 + 3] = 255; }
  for (const n of filled) {
    const cx = (n % cols) * cell, cy = Math.floor(n / cols) * cell;
    for (let y = cy + gutter + 4; y < cy + cell - gutter - 4; y++)
      for (let x = cx + gutter + 4; x < cx + cell - gutter - 4; x++) { const i = (y * width + x) * 4; data[i] = ink[0]; data[i + 1] = ink[1]; data[i + 2] = ink[2]; }
  }
  return { width, height, data };
}

describe("sprite-sheet grid math", () => {
  it("computes rows and rects row-major, last row partial", () => {
    expect(rowsFor(51, 8)).toBe(7);
    const g = fixedGrid(1536, 1024, 8, 51);
    expect(g.xs).toHaveLength(9);
    expect(g.ys).toHaveLength(8);
    const r = gridRects(g, 51);
    expect(r).toHaveLength(51);
    expect(r[0]).toEqual({ x: 0, y: 0, w: 192, h: Math.round(1024 / 7) });
    expect(r[8].x).toBe(0);
    expect(r[8].y).toBe(g.ys[1]);
    expect(r[50].x).toBe(g.xs[2]);
  });
});

describe("background to alpha", () => {
  it("samples the corner colour", () => {
    expect(sampleBackground(sheet(2, 2, 16, [0]))).toEqual(BG);
  });
  it("maps background to 0, white to 1, in-between smoothly", () => {
    expect(alphaOf(...BG, BG)).toBe(0);
    expect(alphaOf(255, 255, 255, BG)).toBe(1);
    const mid = alphaOf(137, 137, 142, BG);
    expect(mid).toBeGreaterThan(0.3);
    expect(mid).toBeLessThan(0.7);
  });
});

describe("sliceSheet", () => {
  const apps = Array.from({ length: 5 }, (_, i) => ({ pkg: `p${i}`, label: `A${i}`, subject: "", aliases: [], tier: 1 as const }));
  it("skips empty cells and outputs 192 px white-on-alpha squares", () => {
    const img = sheet(3, 2, 40, [0, 1, 3, 4]); // cell 2 empty
    const out = sliceSheet(img, { columns: 3, auto: false }, apps);
    expect(out.map((o) => o.pkg)).toEqual(["p0", "p1", "p3", "p4"]);
    const px = out[0].pixels;
    expect(px.width).toBe(192);
    expect(px.data[3]).toBe(0); // padded corner is transparent
    const c = (96 * 192 + 96) * 4;
    expect([px.data[c], px.data[c + 3]]).toEqual([255, 255]); // centre opaque white
  });
  it("auto-detects a grid with gutters and falls back when it does not fit", () => {
    const img = sheet(3, 2, 40, [0, 1, 2, 3, 4], 2);
    const g = detectGrid(img, BG, 5);
    expect(g?.xs).toHaveLength(4);
    expect(g?.ys).toHaveLength(3);
    expect(detectGrid(sheet(3, 2, 40, [0]), BG, 5)).toBeNull();
    expect(sliceSheet(sheet(3, 2, 40, [0]), { columns: 3, auto: true }, apps).map((o) => o.pkg)).toEqual(["p0"]);
  });
});

describe("keep original colours", () => {
  const GREEN: [number, number, number] = [37, 211, 102];
  const apps = [{ pkg: "a", label: "A", subject: "", aliases: [], tier: 1 as const }];
  const centre = (p: PixelData) => Array.from(p.data.slice(((p.height / 2) * p.width + p.width / 2) * 4, ((p.height / 2) * p.width + p.width / 2) * 4 + 4));

  it("detects coloured sheets and not white ones", () => {
    const green = sheet(1, 1, 64, [0], 0, GREEN), white = sheet(1, 1, 64, [0]);
    expect(isColourful(green, BG, alphaMap(green, BG))).toBe(true);
    expect(isColourful(white, BG, alphaMap(white, BG))).toBe(false);
  });

  it("keeps the ink colour fully opaque, or makes a white mask", () => {
    const img = sheet(1, 1, 64, [0], 0, GREEN);
    const [kept] = sliceSheet(img, { columns: 1, auto: false, keepColours: true }, apps);
    expect(centre(kept.pixels)).toEqual([...GREEN, 255]);
    const [mask] = sliceSheet(img, { columns: 1, auto: false, keepColours: false }, apps);
    const [r, g, b, a] = centre(mask.pixels);
    expect([r, g, b]).toEqual([255, 255, 255]);
    expect(a).toBeLessThan(255); // green is nearer the dark background than white is
  });
});
