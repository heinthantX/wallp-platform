import type { ThemeDetail, Accent } from "@/lib/catalog/types";

export interface Check {
  name: string;
  field: string;
  ratio: number;
  min: number;
  pass: boolean;
  level?: string;
}

// Local GeneratorOption type; will be swapped for generated API types once schema.d.ts includes generator endpoints.
export interface GeneratorOption {
  data: ThemeDetail;
  checks: Check[];
  seed: number;
}

export const PALETTE_ROLES = [
  "background",
  "deep",
  "surface",
  "text",
  "textMuted",
  "motif",
  "accents",
] as const;

export type PaletteRole = (typeof PALETTE_ROLES)[number];

export type PaletteLocks = Record<PaletteRole, boolean>;

export interface LockedPalette {
  background?: string;
  deep?: string;
  surface?: string;
  text?: string;
  textMuted?: string;
  motif?: string;
  accents?: Accent[] | string[];
}
