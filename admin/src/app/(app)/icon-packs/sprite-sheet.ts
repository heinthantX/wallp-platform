// Slices a "white glyphs on a dark solid background" sprite sheet into 192 px transparent PNGs.
// Pure pixel functions are separate from the canvas wrapper so they can be unit-tested without a canvas.
import { COMMON_APPS } from "./common-apps";

export interface PixelData {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}
export type RGB = [number, number, number];
export interface Rect { x: number; y: number; w: number; h: number }
export interface Grid { xs: number[]; ys: number[] }

export const OUT_SIZE = 192;
export const PADDING = 0.12;
export const DEFAULT_COLUMNS = 8;
const INK_THRESHOLD = 0.15;

export const rowsFor = (count: number, cols: number) => Math.ceil(count / Math.max(1, cols));

/** Background colour: per-channel median of the four corner pixels. */
export function sampleBackground(img: PixelData): RGB {
  const { width: w, height: h, data } = img;
  const at = (x: number, y: number) => (y * w + x) * 4;
  const idx = [at(0, 0), at(w - 1, 0), at(0, h - 1), at(w - 1, h - 1)];
  const med = (c: number) => {
    const v = idx.map((i) => data[i + c]).sort((a, b) => a - b);
    return Math.round((v[1] + v[2]) / 2);
  };
  return [med(0), med(1), med(2)];
}

/** How far a pixel is from the background, 0..1, relative to the farthest reachable extreme (white on dark, black on light). */
export function alphaOf(r: number, g: number, b: number, bg: RGB): number {
  const lum = 0.299 * bg[0] + 0.587 * bg[1] + 0.114 * bg[2];
  const ref = lum < 128 ? 255 : 0;
  const d = Math.hypot(r - bg[0], g - bg[1], b - bg[2]);
  const max = Math.hypot(ref - bg[0], ref - bg[1], ref - bg[2]) || 1;
  return Math.min(1, d / max);
}

export function alphaMap(img: PixelData, bg: RGB): Float32Array {
  const out = new Float32Array(img.width * img.height);
  for (let i = 0; i < out.length; i++) out[i] = alphaOf(img.data[i * 4], img.data[i * 4 + 1], img.data[i * 4 + 2], bg);
  return out;
}

const uniform = (len: number, n: number) => Array.from({ length: n + 1 }, (_, i) => Math.round((i * len) / n));

/** Evenly divided grid: columns given, rows from the app count. */
export function fixedGrid(width: number, height: number, cols: number, count: number): Grid {
  return { xs: uniform(width, cols), ys: uniform(height, rowsFor(count, cols)) };
}

/** Runs of "inked" indices in a 1-D profile, bridging gaps shorter than minGap. */
function runs(ink: boolean[], minGap: number): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  let start = -1;
  for (let i = 0; i <= ink.length; i++) {
    if (i < ink.length && ink[i]) {
      if (start < 0) start = i;
    } else if (start >= 0) {
      const last = out[out.length - 1];
      if (last && start - last[1] < minGap) last[1] = i;
      else out.push([start, i]);
      start = -1;
    }
  }
  return out;
}

const boundaries = (rs: Array<[number, number]>, len: number): number[] => [
  0,
  ...rs.slice(1).map((r, i) => Math.round((rs[i][1] + r[0]) / 2)),
  len,
];

/** Find rows/cols from empty gutters. Returns null when the result does not fit `count` cells. */
export function detectGrid(img: PixelData, bg: RGB, count: number): Grid | null {
  const { width: w, height: h } = img;
  const a = alphaMap(img, bg);
  const col = new Array<boolean>(w).fill(false);
  const row = new Array<boolean>(h).fill(false);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (a[y * w + x] > INK_THRESHOLD) { col[x] = true; row[y] = true; }
    }
  }
  const cr = runs(col, Math.max(2, Math.round(w * 0.01)));
  const rr = runs(row, Math.max(2, Math.round(h * 0.01)));
  const cols = cr.length;
  const rows = rr.length;
  if (!cols || !rows || cols * rows < count || (rows - 1) * cols >= count) return null;
  return { xs: boundaries(cr, w), ys: boundaries(rr, h) };
}

/** Cells row-major; stops after `count`. */
export function gridRects(g: Grid, count: number): Rect[] {
  const cols = g.xs.length - 1;
  const out: Rect[] = [];
  for (let i = 0; i < count; i++) {
    const c = i % cols;
    const r = Math.floor(i / cols);
    if (r >= g.ys.length - 1) break;
    out.push({ x: g.xs[c], y: g.ys[r], w: g.xs[c + 1] - g.xs[c], h: g.ys[r + 1] - g.ys[r] });
  }
  return out;
}

/** Bounding box of ink inside the cell, or null for an empty cell. */
export function inkBounds(alpha: Float32Array, stride: number, cell: Rect): Rect | null {
  let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
  for (let y = cell.y; y < cell.y + cell.h; y++) {
    for (let x = cell.x; x < cell.x + cell.w; x++) {
      if (alpha[y * stride + x] > INK_THRESHOLD) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

/** Render one cell to a square RGBA buffer: white RGB, alpha from distance to the background; null when the cell is empty. */
export function renderCell(alpha: Float32Array, stride: number, cell: Rect, size = OUT_SIZE, pad = PADDING): PixelData | null {
  const b = inkBounds(alpha, stride, cell);
  if (!b) return null;
  const side = Math.max(b.w, b.h) / (1 - 2 * pad);
  const ox = b.x + b.w / 2 - side / 2;
  const oy = b.y + b.h / 2 - side / 2;
  const height = alpha.length / stride;
  const at = (x: number, y: number) =>
    x < cell.x || y < cell.y || x >= cell.x + cell.w || y >= cell.y + cell.h || x >= stride || y >= height ? 0 : alpha[y * stride + x];
  const data = new Uint8ClampedArray(size * size * 4);
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      // bilinear sample at the source position of this output pixel centre
      const sx = ox + ((px + 0.5) * side) / size - 0.5;
      const sy = oy + ((py + 0.5) * side) / size - 0.5;
      const x0 = Math.floor(sx), y0 = Math.floor(sy);
      const fx = sx - x0, fy = sy - y0;
      const v = at(x0, y0) * (1 - fx) * (1 - fy) + at(x0 + 1, y0) * fx * (1 - fy) + at(x0, y0 + 1) * (1 - fx) * fy + at(x0 + 1, y0 + 1) * fx * fy;
      const i = (py * size + px) * 4;
      data[i] = data[i + 1] = data[i + 2] = 255;
      data[i + 3] = Math.round(v * 255);
    }
  }
  return { width: size, height: size, data };
}

export interface Slice {
  pkg: string;
  label: string;
  blob: Blob;
  url: string; // object URL for the preview; revoke when done
}

export interface SliceOptions { columns: number; auto: boolean }

/** Pure part of slicing: pixel data in, per-app square buffers out (empty cells skipped). */
export function sliceSheet(img: PixelData, opts: SliceOptions, apps = COMMON_APPS): Array<{ pkg: string; label: string; pixels: PixelData }> {
  const bg = sampleBackground(img);
  const grid = (opts.auto ? detectGrid(img, bg, apps.length) : null) ?? fixedGrid(img.width, img.height, opts.columns, apps.length);
  const alpha = alphaMap(img, bg);
  const out: Array<{ pkg: string; label: string; pixels: PixelData }> = [];
  gridRects(grid, apps.length).forEach((cell, i) => {
    const pixels = renderCell(alpha, img.width, cell);
    if (pixels) out.push({ pkg: apps[i].pkg, label: apps[i].label, pixels });
  });
  return out;
}

/** Browser wrapper: decode the file, slice, encode each cell as PNG. */
export async function sliceSheetFile(file: File, opts: SliceOptions): Promise<Slice[]> {
  const bmp = await createImageBitmap(file);
  const c = document.createElement("canvas");
  c.width = bmp.width;
  c.height = bmp.height;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas is not available in this browser");
  ctx.drawImage(bmp, 0, 0);
  bmp.close?.();
  const img = ctx.getImageData(0, 0, c.width, c.height);
  const parts = sliceSheet(img, opts);
  const out = document.createElement("canvas");
  out.width = out.height = OUT_SIZE;
  const octx = out.getContext("2d");
  if (!octx) throw new Error("Canvas is not available in this browser");
  const slices: Slice[] = [];
  for (const p of parts) {
    octx.putImageData(new ImageData(new Uint8ClampedArray(p.pixels.data), OUT_SIZE, OUT_SIZE), 0, 0);
    const blob = await new Promise<Blob | null>((res) => out.toBlob(res, "image/png"));
    if (!blob) throw new Error("PNG encoding failed");
    slices.push({ pkg: p.pkg, label: p.label, blob, url: URL.createObjectURL(blob) });
  }
  return slices;
}
