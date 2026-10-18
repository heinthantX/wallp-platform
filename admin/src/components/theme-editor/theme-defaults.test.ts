import { describe, it, expect } from "vitest";
import { defaultTheme } from "./ThemeEditor";

// B14 (loop-2 P1): theme fonts hold font ids, not family names.
describe("defaultTheme", () => {
  it("uses font ids for every font slot", () => {
    for (const id of Object.values(defaultTheme.fonts)) {
      expect(id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    }
  });
});
