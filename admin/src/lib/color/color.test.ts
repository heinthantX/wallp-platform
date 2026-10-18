import { describe, it, expect } from "vitest";
import {
  hexToOklch,
  oklchToHex,
  relativeLuminance,
  contrastRatio,
  contrastBadge,
} from "./index";

describe("color utilities", () => {
  describe("WCAG contrast ratio & relative luminance", () => {
    it("#000 vs #fff has maximum contrast ratio of 21", () => {
      const ratio = contrastRatio("#000000", "#ffffff");
      expect(ratio).toBe(21);

      // Short hex should also work identically
      expect(contrastRatio("#000", "#fff")).toBe(21);
    });

    it("#777 vs #fff has contrast ratio about 4.48", () => {
      const ratio = contrastRatio("#777", "#fff");
      // Culori returns ~4.478...
      expect(ratio).toBeGreaterThan(4.47);
      expect(ratio).toBeLessThan(4.49);
      expect(Math.round(ratio * 100) / 100).toBe(4.48);
    });

    it("relative luminance of pure white is 1 and pure black is 0", () => {
      expect(relativeLuminance("#ffffff")).toBe(1);
      expect(relativeLuminance("#000000")).toBe(0);
    });

    it("contrast ratio is symmetric (colorA vs colorB equals colorB vs colorA)", () => {
      const r1 = contrastRatio("#FF3EA5", "#120326");
      const r2 = contrastRatio("#120326", "#FF3EA5");
      expect(r1).toBeCloseTo(r2, 4);
    });

    it("handles invalid color input without throwing", () => {
      expect(contrastRatio("invalid", "#fff")).toBe(1);
      expect(relativeLuminance("not-a-color")).toBe(0);
    });
  });

  describe("hex <-> oklch conversion", () => {
    it("converts hex to oklch and back preserving color", () => {
      const hex = "#22e4ff";
      const oklch = hexToOklch(hex);
      expect(oklch).not.toBeNull();
      if (!oklch) return;

      expect(oklch.l).toBeGreaterThan(0.8);
      expect(oklch.l).toBeLessThan(0.9);
      expect(oklch.c).toBeGreaterThan(0.1);

      const backToHex = oklchToHex(oklch);
      expect(backToHex.toLowerCase()).toBe(hex.toLowerCase());
    });

    it("returns null for invalid hex", () => {
      expect(hexToOklch("xyz")).toBeNull();
      expect(hexToOklch("")).toBeNull();
    });

    it("handles black and white correctly", () => {
      const blackOklch = hexToOklch("#000000");
      expect(blackOklch?.l).toBe(0);
      expect(oklchToHex({ l: 0, c: 0 })).toBe("#000000");

      const whiteOklch = hexToOklch("#ffffff");
      expect(whiteOklch?.l).toBe(1);
      expect(oklchToHex({ l: 1, c: 0 })).toBe("#ffffff");
    });
  });

  describe("contrastBadge", () => {
    it("evaluates pass against standard min 4.5", () => {
      const passBadge = contrastBadge(21, 4.5);
      expect(passBadge.pass).toBe(true);
      expect(passBadge.variant).toBe("success");
      expect(passBadge.formatted).toBe("21.00:1");

      const failBadge = contrastBadge(3.5, 4.5);
      expect(failBadge.pass).toBe(false);
      expect(failBadge.variant).toBe("warning");

      const severeFail = contrastBadge(1.8, 4.5);
      expect(severeFail.pass).toBe(false);
      expect(severeFail.variant).toBe("destructive");
    });

    it("evaluates pass against custom min threshold", () => {
      const badge = contrastBadge(3.5, 3.0);
      expect(badge.pass).toBe(true);
      expect(badge.variant).toBe("success");
    });
  });
});
