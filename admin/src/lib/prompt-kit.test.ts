import { describe, it, expect } from "vitest";
import { buildPromptKit } from "./prompt-kit";

const apps = [{ pkg: "com.whatsapp", subject: "a chat bubble" }, { pkg: "x.y", subject: "a map pin" }];

describe("buildPromptKit", () => {
  it("builds preamble and one line per app", () => {
    const kit = buildPromptKit({ packName: "Neon", style: "cozy", tile: "#111111", glyph: "#ffffff", accent: "#ff0000", apps });
    expect(kit).toContain("Icon set, Neon, cozy style.");
    for (const t of ["1024x1024", "66%", "not its logo", "background #111111", "main #ffffff", "detail #ff0000"]) expect(kit).toContain(t);
    expect(kit).toContain("`com.whatsapp.png`: a chat bubble");
    expect(kit.split("\n")).toHaveLength(2 + 2);
  });
  it("omits empty colours and style", () => {
    const kit = buildPromptKit({ packName: "Neon", tile: "#111111", accent: "", apps });
    expect(kit).toContain("Icon set, Neon.");
    expect(kit).toContain("palette: background #111111.");
    expect(kit).not.toContain("detail");
    expect(kit).not.toContain("main ");
  });
});
