import {
  oklch as culoriOklch,
  formatHex,
  wcagLuminance,
  wcagContrast,
} from "culori";

export interface OklchColor {
  l: number;
  c: number;
  h?: number;
  alpha?: number;
}

export interface ContrastBadgeResult {
  ratio: number;
  min: number;
  pass: boolean;
  formatted: string;
  label: string;
  variant: "success" | "destructive" | "warning";
}

/**
 * Converts a hex string (e.g. "#22E4FF", "#fff") to OKLCH.
 * Returns null if the hex color is invalid.
 */
export function hexToOklch(hex: string): OklchColor | null {
  try {
    const trimmed = hex.trim();
    if (!trimmed) return null;
    const parsed = culoriOklch(trimmed);
    if (!parsed || typeof parsed.l !== "number" || isNaN(parsed.l)) {
      return null;
    }
    const l = Math.max(0, Math.min(1, parsed.l));
    return {
      l: Math.round(l * 1000000) / 1000000,
      c: parsed.c ?? 0,
      h: parsed.h,
      alpha: parsed.alpha,
    };
  } catch {
    return null;
  }
}

/**
 * Converts an OKLCH color object to a standard 6-digit or 8-digit hex string.
 */
export function oklchToHex(color: OklchColor): string {
  try {
    const hex = formatHex({
      mode: "oklch",
      l: color.l,
      c: color.c,
      h: color.h,
      alpha: color.alpha,
    });
    return hex ?? "#000000";
  } catch {
    return "#000000";
  }
}

/**
 * Calculates WCAG 2.1 relative luminance (0 for darkest black, 1 for brightest white).
 */
export function relativeLuminance(color: string): number {
  try {
    const lum = wcagLuminance(color.trim());
    if (typeof lum !== "number" || isNaN(lum)) return 0;
    return lum;
  } catch {
    return 0;
  }
}

/**
 * Calculates WCAG 2.1 contrast ratio between two colors (ranging from 1 to 21).
 */
export function contrastRatio(colorA: string, colorB: string): number {
  try {
    const contrast = wcagContrast(colorA.trim(), colorB.trim());
    if (typeof contrast !== "number" || isNaN(contrast)) return 1;
    return contrast;
  } catch {
    return 1;
  }
}

/**
 * Generates badge information for a given contrast ratio and minimum threshold.
 * Default minimum is 4.5 (normal text WCAG AA). For large text or icons, 3.0 is standard.
 */
export function contrastBadge(ratio: number, min = 4.5): ContrastBadgeResult {
  const safeRatio = typeof ratio === "number" && !isNaN(ratio) && ratio >= 1 ? ratio : 1;
  const pass = safeRatio >= min;
  const formatted = `${safeRatio.toFixed(2)}:1`;
  const label = pass ? `Pass (${formatted} ≥ ${min}:1)` : `Fail (${formatted} < ${min}:1)`;
  const variant: "success" | "destructive" | "warning" = pass
    ? "success"
    : safeRatio >= 3.0
    ? "warning"
    : "destructive";

  return {
    ratio: safeRatio,
    min,
    pass,
    formatted,
    label,
    variant,
  };
}

export { ContrastBadge } from "./badge";
