import { describe, it, expect } from "vitest";
import type { Palette, ThemeDetail } from "@/lib/catalog/types";
import type { GeneratorOption } from "./types";
import {
  createInitialLocks,
  toggleLock,
  setLock,
  resetLocks,
  hasAnyLocked,
  getLockedRoles,
  buildLocked,
} from "./locks";

const mockPalette: Palette = {
  background: "#120326",
  deep: "#07010F",
  surface: "#3A0B5C",
  text: "#F8F0FF",
  textMuted: "#B3A9BE",
  motif: "#FF3EA5",
};

const mockTheme: ThemeDetail = {
  id: "test-theme",
  rev: 0,
  festivalId: "halloween",
  name: { en: "Test Theme" },
  scene: { engine: "layers", params: {} },
  palette: mockPalette,
  accents: [
    {
      id: "accent-1",
      name: { en: "Warm Gold" },
      type: "solid",
      colors: ["#FFAA00"],
    },
  ],
  fonts: { display: "sans-serif" },
};

const mockOption: GeneratorOption = {
  data: mockTheme,
  checks: [],
  seed: 42,
};

describe("locks module", () => {
  it("initializes with all roles unlocked", () => {
    const locks = createInitialLocks();
    expect(hasAnyLocked(locks)).toBe(false);
    expect(getLockedRoles(locks)).toEqual([]);
    expect(locks.background).toBe(false);
    expect(locks.accents).toBe(false);
  });

  it("toggles and sets locks properly", () => {
    let locks = createInitialLocks();
    locks = toggleLock(locks, "background");
    expect(locks.background).toBe(true);
    expect(hasAnyLocked(locks)).toBe(true);
    expect(getLockedRoles(locks)).toEqual(["background"]);

    locks = toggleLock(locks, "background");
    expect(locks.background).toBe(false);
    expect(hasAnyLocked(locks)).toBe(false);

    locks = setLock(locks, "motif", true);
    locks = setLock(locks, "accents", true);
    expect(getLockedRoles(locks)).toEqual(["motif", "accents"]);

    locks = resetLocks();
    expect(hasAnyLocked(locks)).toBe(false);
  });

  it("builds locked object from raw palette", () => {
    const locks = {
      ...createInitialLocks(),
      background: true,
      text: true,
    };

    const locked = buildLocked(locks, mockPalette);
    expect(locked).toEqual({
      background: "#120326",
      text: "#F8F0FF",
    });
    expect(locked.deep).toBeUndefined();
    expect(locked.surface).toBeUndefined();
  });

  it("builds locked object from ThemeDetail including accents", () => {
    const locks = {
      ...createInitialLocks(),
      deep: true,
      surface: true,
      accents: true,
    };

    const locked = buildLocked(locks, mockTheme);
    expect(locked.deep).toBe("#07010F");
    expect(locked.surface).toBe("#3A0B5C");
    expect(locked.accents).toEqual(mockTheme.accents);
    expect(locked.background).toBeUndefined();
  });

  it("builds locked object from GeneratorOption", () => {
    const locks = {
      ...createInitialLocks(),
      motif: true,
      textMuted: true,
    };

    const locked = buildLocked(locks, mockOption);
    expect(locked).toEqual({
      motif: "#FF3EA5",
      textMuted: "#B3A9BE",
    });
  });

  it("returns empty object when no roles are locked", () => {
    const locks = createInitialLocks();
    const locked = buildLocked(locks, mockTheme);
    expect(locked).toEqual({});
  });
});
