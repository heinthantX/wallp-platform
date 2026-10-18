"use client";

import * as React from "react";
import type {
  Scene,
  Palette,
  Accent,
  Layer,
  GradientLayer,
  ShapeLayer,
  ImageLayer,
  ParticlesLayer,
  LayersSceneParams,
} from "@/lib/catalog/types";
import { cn } from "@/lib/utils";

export interface LayersCanvasProps {
  scene: Scene;
  palette: Palette;
  accent?: Accent;
  animate?: boolean;
  width?: number;
  height?: number;
  className?: string;
}

/**
 * Resolves @token references against palette and active accent.
 */
export function resolveColor(
  colorStr: string,
  palette: Palette,
  accent?: Accent
): string {
  if (!colorStr) return palette.text || "#FFFFFF";
  const trimmed = colorStr.trim();

  const accentColor = accent?.colors?.[0] || palette.motif || palette.text || "#FF3EA5";

  switch (trimmed) {
    case "@background":
      return palette.background || "#120326";
    case "@deep":
      return palette.deep || "#07010F";
    case "@surface":
      return palette.surface || "#3A0B5C";
    case "@text":
      return palette.text || "#F8F0FF";
    case "@textMuted":
      return palette.textMuted || "#B3A9BE";
    case "@motif":
      return palette.motif || palette.text || "#FF3EA5";
    case "@accent":
      return accentColor;
    default:
      return trimmed;
  }
}

// Simple seeded pseudo-random number generator (Mulberry32)
function createRng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function LayersCanvas({
  scene,
  palette,
  accent,
  animate = false,
  width = 390,
  height = 844,
  className,
}: LayersCanvasProps) {
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const animFrameRef = React.useRef<number | null>(null);
  const startTimeRef = React.useRef<number>(0);

  // Check prefers-reduced-motion
  const [prefersReducedMotion, setPrefersReducedMotion] = React.useState(false);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setPrefersReducedMotion(mq.matches);
    const handler = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const shouldAnimate = animate && !prefersReducedMotion;

  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let isRunning = true;

    const render = (time: number) => {
      if (!startTimeRef.current) startTimeRef.current = time;
      const elapsed = shouldAnimate ? time - startTimeRef.current : 0;

      // Clear canvas
      ctx.clearRect(0, 0, width, height);

      // Render based on engine
      const engine = scene?.engine || "layers";

      if (engine === "halloween" || engine === "christmas" || engine === "thingyan") {
        renderBuiltInEngine(ctx, engine, palette, accent, elapsed, width, height);
      } else {
        renderLayersEngine(ctx, scene, palette, accent, elapsed, width, height);
      }

      if (shouldAnimate && isRunning) {
        animFrameRef.current = requestAnimationFrame(render);
      }
    };

    if (shouldAnimate) {
      animFrameRef.current = requestAnimationFrame(render);
    } else {
      render(0);
    }

    return () => {
      isRunning = false;
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, [scene, palette, accent, shouldAnimate, width, height]);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      className={cn("block w-full h-full object-cover", className)}
      style={{ aspectRatio: `${width}/${height}` }}
    />
  );
}

function renderBuiltInEngine(
  ctx: CanvasRenderingContext2D,
  engine: string,
  palette: Palette,
  accent: Accent | undefined,
  time: number,
  width: number,
  height: number
) {
  ctx.save();

  // Sky gradient from deep to background / surface
  const grad = ctx.createLinearGradient(0, 0, 0, height);
  const colorTop = resolveColor("@deep", palette, accent);
  const colorMid = resolveColor("@background", palette, accent);
  const colorBot = resolveColor("@surface", palette, accent);

  grad.addColorStop(0, colorTop);
  grad.addColorStop(0.5, colorMid);
  grad.addColorStop(1, colorBot);

  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);

  // Engine-specific motif circle
  const motifColor = resolveColor("@motif", palette, accent);
  const accentColor = resolveColor("@accent", palette, accent);

  const cx = width * 0.5;
  let cy = height * 0.28;
  const radius = width * 0.2;

  // Gentle motion for built-in engines
  if (time > 0) {
    cy += Math.sin(time * 0.0015) * 6;
  }

  // Draw motif circle (moon / star / sun)
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fillStyle = motifColor;
  ctx.shadowColor = motifColor;
  ctx.shadowBlur = 30;
  ctx.fill();

  // Inner engine details
  if (engine === "halloween") {
    // Spooky glow + silhouettes
    ctx.shadowBlur = 0;
    ctx.fillStyle = colorTop;
    // Simple ground hills
    ctx.beginPath();
    ctx.ellipse(width * 0.5, height, width * 0.7, height * 0.2, 0, 0, Math.PI * 2);
    ctx.fill();
  } else if (engine === "christmas") {
    // Snow ground
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#FFFFFF";
    ctx.globalAlpha = 0.85;
    ctx.beginPath();
    ctx.ellipse(width * 0.5, height, width * 0.65, height * 0.15, 0, 0, Math.PI * 2);
    ctx.fill();
  } else if (engine === "thingyan") {
    // Water ripples
    ctx.shadowBlur = 15;
    ctx.strokeStyle = accentColor;
    ctx.lineWidth = 3;
    ctx.globalAlpha = 0.6;
    for (let r = 1; r <= 3; r++) {
      ctx.beginPath();
      ctx.ellipse(
        width * 0.5,
        height * 0.7,
        width * 0.25 * r,
        height * 0.05 * r,
        0,
        0,
        Math.PI * 2
      );
      ctx.stroke();
    }
  }

  ctx.restore();
}

function renderLayersEngine(
  ctx: CanvasRenderingContext2D,
  scene: Scene,
  palette: Palette,
  accent: Accent | undefined,
  time: number,
  width: number,
  height: number
) {
  const params = scene.params as LayersSceneParams | undefined;
  const layers: Layer[] = params?.layers || [];

  for (let i = 0; i < layers.length; i++) {
    const layer = layers[i];
    ctx.save();
    ctx.globalAlpha = layer.opacity ?? 1;

    switch (layer.type) {
      case "gradient":
        renderGradientLayer(ctx, layer, palette, accent, width, height);
        break;
      case "shape":
        renderShapeLayer(ctx, layer, palette, accent, time, width, height);
        break;
      case "particles":
        renderParticlesLayer(ctx, layer, palette, accent, time, i, width, height);
        break;
      case "image":
        renderImageLayer(ctx, layer, width, height);
        break;
    }

    ctx.restore();
  }
}

function renderGradientLayer(
  ctx: CanvasRenderingContext2D,
  layer: GradientLayer,
  palette: Palette,
  accent: Accent | undefined,
  width: number,
  height: number
) {
  const rawColors = layer.colors || ["@background", "@surface"];
  const colors = rawColors.map((c) => resolveColor(c, palette, accent));
  const angleDeg = layer.angle ?? 180; // Default 180 = top to bottom

  // Convert CSS angle to canvas coordinates
  const theta = ((angleDeg - 90) * Math.PI) / 180;
  const cx = width / 2;
  const cy = height / 2;
  const L = Math.abs(width * Math.cos(theta)) + Math.abs(height * Math.sin(theta));

  const x0 = cx - (L / 2) * Math.cos(theta);
  const y0 = cy - (L / 2) * Math.sin(theta);
  const x1 = cx + (L / 2) * Math.cos(theta);
  const y1 = cy + (L / 2) * Math.sin(theta);

  const grad = ctx.createLinearGradient(x0, y0, x1, y1);
  const step = colors.length > 1 ? 1 / (colors.length - 1) : 1;
  colors.forEach((col, idx) => {
    grad.addColorStop(Math.min(1, Math.max(0, idx * step)), col);
  });

  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);
}

function renderShapeLayer(
  ctx: CanvasRenderingContext2D,
  layer: ShapeLayer,
  palette: Palette,
  accent: Accent | undefined,
  time: number,
  width: number,
  height: number
) {
  let cx = layer.x * width;
  let cy = layer.y * height;
  let sw = Math.max(1, layer.width * width);
  let sh = Math.max(1, sw * (layer.aspect ?? 1));

  // Motion effects
  if (time > 0 && layer.motion && layer.motion !== "none") {
    if (layer.motion === "float") {
      cy += Math.sin(time * 0.002) * (height * 0.02);
    } else if (layer.motion === "sway") {
      cx += Math.sin(time * 0.002) * (width * 0.02);
    } else if (layer.motion === "pulse") {
      const scale = 1 + 0.04 * Math.sin(time * 0.003);
      sw *= scale;
      sh *= scale;
    }
  }

  const color = resolveColor(layer.color, palette, accent);
  ctx.fillStyle = color;

  if (layer.glow) {
    ctx.shadowColor = color;
    ctx.shadowBlur = Math.min(sw, sh) * 0.35;
  }

  const shape = layer.shape || "circle";

  if (shape === "circle") {
    ctx.beginPath();
    ctx.arc(cx, cy, sw / 2, 0, Math.PI * 2);
    ctx.fill();
  } else if (shape === "ellipse") {
    ctx.beginPath();
    ctx.ellipse(cx, cy, sw / 2, sh / 2, 0, 0, Math.PI * 2);
    ctx.fill();
  } else if (shape === "rect") {
    ctx.fillRect(cx - sw / 2, cy - sh / 2, sw, sh);
  } else if (shape === "polygon" && layer.points && layer.points.length >= 3) {
    const bx = cx - sw / 2;
    const by = cy - sh / 2;
    ctx.beginPath();
    const [p0x, p0y] = layer.points[0];
    ctx.moveTo(bx + p0x * sw, by + p0y * sh);
    for (let p = 1; p < layer.points.length; p++) {
      const [px, py] = layer.points[p];
      ctx.lineTo(bx + px * sw, by + py * sh);
    }
    ctx.closePath();
    ctx.fill();
  }
}

function renderParticlesLayer(
  ctx: CanvasRenderingContext2D,
  layer: ParticlesLayer,
  palette: Palette,
  accent: Accent | undefined,
  time: number,
  layerIndex: number,
  width: number,
  height: number
) {
  const count = Math.min(150, Math.max(1, layer.count ?? 50));
  const color = resolveColor(layer.color, palette, accent);
  const speed = layer.speed ?? 0.5;
  const baseSize = Math.max(1.5, (layer.size ?? 0.5) * 6);

  ctx.fillStyle = color;
  ctx.strokeStyle = color;

  // Use Mulberry32 seeded by layer index for consistent initial positions
  const rng = createRng(1000 + layerIndex * 1337);

  const effect = layer.effect || "stars";

  for (let i = 0; i < count; i++) {
    const initX = rng() * width;
    const initY = rng() * height;
    const scale = 0.5 + rng() * 0.5;
    const pSize = baseSize * scale;

    let x = initX;
    let y = initY;

    if (time > 0 && speed > 0) {
      if (effect === "snow" || effect === "rain" || effect === "drops" || effect === "petals") {
        // Falling down
        const dist = (time * 0.05 * speed * 2 + initY) % height;
        y = dist;
        if (effect === "petals" || effect === "snow") {
          x = (initX + Math.sin((time * 0.002) + i) * 15) % width;
        }
      } else if (effect === "lanterns") {
        // Floating upwards
        const dist = (initY - (time * 0.03 * speed * 2) % height + height) % height;
        y = dist;
        x = (initX + Math.sin((time * 0.001) + i) * 10) % width;
      } else if (effect === "bats") {
        // Floating across
        x = (initX + (time * 0.04 * speed * 2) % width) % width;
        y = (initY + Math.sin((time * 0.003) + i) * 20) % height;
      }
    }

    // Render individual particle based on effect
    if (effect === "rain") {
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x, y + pSize * 3);
      ctx.stroke();
    } else if (effect === "stars" || effect === "sparkles") {
      // Small 4-point twinkling star
      const twinkle = time > 0 ? (Math.sin(time * 0.005 + i) + 1) * 0.5 : 1;
      const s = pSize * twinkle;
      ctx.beginPath();
      ctx.moveTo(x, y - s);
      ctx.lineTo(x + s * 0.3, y);
      ctx.lineTo(x, y + s);
      ctx.lineTo(x - s * 0.3, y);
      ctx.closePath();
      ctx.fill();
    } else if (effect === "lanterns") {
      ctx.shadowColor = color;
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.roundRect(x - pSize * 0.6, y - pSize, pSize * 1.2, pSize * 2, 3);
      ctx.fill();
      ctx.shadowBlur = 0;
    } else {
      // Default: circles for snow, drops, etc.
      ctx.beginPath();
      ctx.arc(x, y, pSize / 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function renderImageLayer(
  ctx: CanvasRenderingContext2D,
  layer: ImageLayer,
  width: number,
  height: number
) {
  // If image asset url is given, we draw a subtle placeholder frame if no HTMLImageElement is cached
  ctx.fillStyle = "rgba(255, 255, 255, 0.05)";
  const anchor = layer.anchor || "bottom";

  const imgH = height * 0.4;
  let top = height - imgH;
  if (anchor === "top") top = 0;
  if (anchor === "center") top = (height - imgH) / 2;

  ctx.fillRect(0, top, width, imgH);
}
