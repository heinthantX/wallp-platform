import { describe, it, expect } from "vitest";
import { resolveAppFile } from "./resolve-app-file";

describe("resolveAppFile", () => {
  it("exact package", () => expect(resolveAppFile("com.whatsapp.png")).toEqual({ pkg: "com.whatsapp", source: "exact" }));
  it("unknown but valid package is exact", () => expect(resolveAppFile("org.example.thing.webp")).toEqual({ pkg: "org.example.thing", source: "exact" }));
  it("alias", () => expect(resolveAppFile("maps.png")).toEqual({ pkg: "com.google.android.apps.maps", source: "alias" }));
  it("size suffix + uppercase", () => {
    expect(resolveAppFile("WhatsApp@2x.PNG").pkg).toBe("com.whatsapp");
    expect(resolveAppFile("YT-1024.jpg").pkg).toBe("com.google.android.youtube");
    expect(resolveAppFile("Chrome_512.webp").pkg).toBe("com.android.chrome");
  });
  it("OEM alias package", () => expect(resolveAppFile("com.samsung.android.dialer.png").source).toBe("exact"));
  it("unmatched with suggestion", () => {
    expect(resolveAppFile("random.png")).toEqual({ source: "unmatched" });
    expect(resolveAppFile("spot.png")).toEqual({ source: "unmatched", suggestion: "com.spotify.music" });
  });
});
