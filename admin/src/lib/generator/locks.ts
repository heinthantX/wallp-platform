import type { Palette, Accent, ThemeDetail } from "@/lib/catalog/types";
import {
  PALETTE_ROLES,
  type PaletteRole,
  type PaletteLocks,
  type LockedPalette,
  type GeneratorOption,
} from "./types";

export { PALETTE_ROLES, type PaletteRole, type PaletteLocks, type LockedPalette };

/**
 * Creates initial lock state with all palette roles unlocked.
 */
export function createInitialLocks(): PaletteLocks {
  return {
    background: false,
    deep: false,
    surface: false,
    text: false,
    textMuted: false,
    motif: false,
    accents: false,
  };
}

/**
 * Toggles the lock state for a given palette role.
 */
export function toggleLock(
  locks: Partial<PaletteLocks>,
  role: PaletteRole
): PaletteLocks {
  const current = createInitialLocks();
  Object.assign(current, locks);
  return {
    ...current,
    [role]: !current[role],
  };
}

/**
 * Sets explicit lock status for a role.
 */
export function setLock(
  locks: Partial<PaletteLocks>,
  role: PaletteRole,
  locked: boolean
): PaletteLocks {
  const current = createInitialLocks();
  Object.assign(current, locks);
  return {
    ...current,
    [role]: locked,
  };
}

/**
 * Resets all locks to false.
 */
export function resetLocks(): PaletteLocks {
  return createInitialLocks();
}

/**
 * Returns true if at least one role is currently locked.
 */
export function hasAnyLocked(locks?: Partial<PaletteLocks> | null): boolean {
  if (!locks) return false;
  return Object.values(locks).some(Boolean);
}

/**
 * Returns the list of currently locked roles.
 */
export function getLockedRoles(locks?: Partial<PaletteLocks> | null): PaletteRole[] {
  if (!locks) return [];
  return PALETTE_ROLES.filter((role) => Boolean(locks[role]));
}

/**
 * Builds the `locked` object for the generate request from a chosen option or palette.
 * Only properties whose role is set to true in `locks` are included.
 */
export function buildLocked(
  locks: Partial<PaletteLocks>,
  source:
    | GeneratorOption
    | ThemeDetail
    | { palette: Palette; accents?: Accent[] | string[] }
    | Palette,
  explicitAccents?: Accent[] | string[]
): LockedPalette {
  const result: LockedPalette = {};
  if (!locks || !source) return result;

  let palette: Palette | undefined;
  let accents: Accent[] | string[] | undefined = explicitAccents;

  if ("data" in source && source.data?.palette) {
    // GeneratorOption
    palette = source.data.palette;
    accents = accents ?? source.data.accents;
  } else if ("palette" in source && source.palette) {
    // ThemeDetail or { palette, accents }
    palette = source.palette;
    accents = accents ?? (source as { accents?: Accent[] | string[] }).accents;
  } else if ("background" in source) {
    // Plain Palette object
    palette = source;
  }

  if (!palette) return result;

  if (locks.background && palette.background) {
    result.background = palette.background;
  }
  if (locks.deep && palette.deep) {
    result.deep = palette.deep;
  }
  if (locks.surface && palette.surface) {
    result.surface = palette.surface;
  }
  if (locks.text && palette.text) {
    result.text = palette.text;
  }
  if (locks.textMuted && palette.textMuted) {
    result.textMuted = palette.textMuted;
  }
  if (locks.motif && palette.motif) {
    result.motif = palette.motif;
  }
  if (locks.accents && accents && accents.length > 0) {
    result.accents = accents;
  }

  return result;
}
