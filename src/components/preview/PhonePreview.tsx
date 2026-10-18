"use client";

import * as React from "react";
import type { ThemeDetail, IconPack, Accent, TileShape } from "@/lib/catalog/types";
import { LayersCanvas, resolveColor } from "./LayersCanvas";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Calendar,
  Moon,
  Gift,
  Droplets,
  Sun,
  PartyPopper,
  Flower2,
  Snowflake,
  Star,
  Heart,
  Music,
  Phone,
  MessageSquare,
  Globe,
  Camera,
  Settings,
  Mail,
  Folder,
  MapPin,
  Clock as ClockIcon,
  ShoppingBag,
  type LucideIcon,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";

export interface PhonePreviewProps {
  theme: ThemeDetail;
  iconPack?: IconPack;
  fontsMap?: Record<string, string>; // { fontId: url }
  className?: string;
  defaultTab?: "lock" | "home" | "card";
  tab?: "lock" | "home" | "card";
  onTabChange?: (tab: "lock" | "home" | "card") => void;
  hideControls?: boolean;
  compact?: boolean;
}

const EVENT_ICON_MAP: Record<string, LucideIcon> = {
  event: Calendar,
  nightlight_round: Moon,
  card_giftcard_rounded: Gift,
  water_drop_rounded: Droplets,
  light_mode_rounded: Sun,
  celebration_rounded: PartyPopper,
  local_florist_rounded: Flower2,
  ac_unit_rounded: Snowflake,
  star_rounded: Star,
  favorite_rounded: Heart,
  music_note_rounded: Music,
};

const SAMPLE_APPS = [
  { id: "phone", name: { en: "Phone", my: "ဖုန်း" }, icon: Phone },
  { id: "messages", name: { en: "Messages", my: "မက်ဆေ့ခ်ျ" }, icon: MessageSquare },
  { id: "browser", name: { en: "Browser", my: "ဘရောက်ဆာ" }, icon: Globe },
  { id: "camera", name: { en: "Camera", my: "ကင်မရာ" }, icon: Camera },
  { id: "music", name: { en: "Music", my: "ဂီတ" }, icon: Music },
  { id: "mail", name: { en: "Mail", my: "မေးလ်" }, icon: Mail },
  { id: "maps", name: { en: "Maps", my: "မြေပုံ" }, icon: MapPin },
  { id: "clock", name: { en: "Clock", my: "နာရီ" }, icon: ClockIcon },
  { id: "settings", name: { en: "Settings", my: "ဆက်တင်" }, icon: Settings },
  { id: "store", name: { en: "Store", my: "စတိုး" }, icon: ShoppingBag },
  { id: "files", name: { en: "Files", my: "ဖိုင်များ" }, icon: Folder },
  { id: "gallery", name: { en: "Photos", my: "ဓာတ်ပုံ" }, icon: Star },
];

export function PhonePreview({
  theme,
  iconPack,
  fontsMap,
  className,
  defaultTab = "lock",
  tab,
  onTabChange,
  hideControls = false,
  compact = false,
}: PhonePreviewProps) {
  // Switchers state
  const [internalTab, setInternalTab] = React.useState<"lock" | "home" | "card">(defaultTab);
  const activeTab = tab !== undefined ? tab : internalTab;
  const setActiveTab = React.useCallback(
    (nextTab: "lock" | "home" | "card") => {
      setInternalTab(nextTab);
      onTabChange?.(nextTab);
    },
    [onTabChange]
  );
  const [selectedAccentId, setSelectedAccentId] = React.useState<string>(
    theme.accents?.[0]?.id || ""
  );
  const [lang, setLang] = React.useState<"en" | "my">("en");
  const [tileShape, setTileShape] = React.useState<TileShape>(
    iconPack?.shape || "squircle"
  );
  const [nameColorChoice, setNameColorChoice] = React.useState<
    "theme" | "accent" | "white" | "dark"
  >("theme");
  const [nameFontChoice, setNameFontChoice] = React.useState<"theme" | "system">("theme");
  const [animate, setAnimate] = React.useState(Boolean(theme.isLive));

  // Sync selected accent when theme accents change
  React.useEffect(() => {
    if (theme.accents?.length && !theme.accents.some((a) => a.id === selectedAccentId)) {
      setSelectedAccentId(theme.accents[0].id);
    }
  }, [theme.accents, selectedAccentId]);

  // Load custom fonts dynamically via FontFace API
  React.useEffect(() => {
    if (!fontsMap || typeof window === "undefined" || !("fonts" in document)) return;

    for (const [fontId, url] of Object.entries(fontsMap)) {
      try {
        const face = new FontFace(fontId, `url(${url})`);
        face.load().then((loadedFace) => {
          document.fonts.add(loadedFace);
        }).catch(() => {
          // Ignore font loading errors gracefully
        });
      } catch {
        // Ignore font construction errors
      }
    }
  }, [fontsMap]);

  const activeAccent = React.useMemo<Accent | undefined>(() => {
    return theme.accents?.find((a) => a.id === selectedAccentId) || theme.accents?.[0];
  }, [theme.accents, selectedAccentId]);

  const EventIcon = EVENT_ICON_MAP[theme.eventIcon || "event"] || Calendar;

  // Resolved accent color (gradient or solid)
  const accentGradientCss = React.useMemo(() => {
    if (!activeAccent) return "#22E4FF";
    if (activeAccent.type === "gradient" && activeAccent.colors?.length >= 2) {
      const angle = activeAccent.angle ?? 90;
      return `linear-gradient(${angle}deg, ${activeAccent.colors.join(", ")})`;
    }
    return activeAccent.colors?.[0] || "#22E4FF";
  }, [activeAccent]);

  const primaryAccentHex = activeAccent?.colors?.[0] || "#22E4FF";

  // Resolved label name color
  const resolvedNameColor = React.useMemo(() => {
    switch (nameColorChoice) {
      case "theme":
        return theme.labels?.color || "#FFFFFF";
      case "accent":
        return primaryAccentHex;
      case "white":
        return "#FFFFFF";
      case "dark":
        return "#111827";
    }
  }, [nameColorChoice, theme.labels?.color, primaryAccentHex]);

  // Resolved font families
  const displayFontFamily = theme.fonts?.display ? `"${theme.fonts.display}", sans-serif` : "sans-serif";
  const labelFontFamily =
    nameFontChoice === "theme" && theme.fonts?.labels
      ? `"${theme.fonts.labels}", sans-serif`
      : "system-ui, -apple-system, sans-serif";

  // Tile shape styling
  const getTileShapeClass = (shape: TileShape) => {
    switch (shape) {
      case "circle":
        return "rounded-full";
      case "square":
        return "rounded-xs";
      case "leaf":
        return "rounded-tl-2xl rounded-br-2xl rounded-tr-xs rounded-bl-xs";
      case "squircle":
      default:
        return "rounded-[22%]";
    }
  };

  return (
    <div className={cn("flex flex-col xl:flex-row gap-6 items-start", className)}>
      {/* Phone container */}
      <div
        className={cn(
          "relative mx-auto shrink-0 aspect-[390/844] shadow-2xl bg-neutral-900 border-[6px] border-neutral-800 ring-1 ring-white/10 overflow-hidden select-none",
          compact
            ? "w-[240px] sm:w-[260px] rounded-[36px] p-2 border-[4px]"
            : "w-[320px] sm:w-[360px] md:w-[390px] rounded-[48px] p-3"
        )}
      >
        {/* Dynamic island / notch */}
        <div className="absolute top-4 left-1/2 -translate-x-1/2 w-28 h-6 bg-black rounded-full z-30 flex items-center justify-between px-3">
          <div className="w-2.5 h-2.5 rounded-full bg-neutral-900 border border-neutral-800" />
          <div className="w-2 h-2 rounded-full bg-blue-950/40" />
        </div>

        {/* Screen canvas */}
        <div className="relative w-full h-full rounded-[40px] overflow-hidden bg-black text-white">
          {/* Live Wallpaper Background */}
          <div className="absolute inset-0 z-0">
            <LayersCanvas
              scene={theme.scene}
              palette={theme.palette}
              accent={activeAccent}
              animate={animate}
              width={390}
              height={844}
            />
          </div>

          {/* Screen Content Overlay */}
          <div className="relative z-10 w-full h-full flex flex-col justify-between pt-12 pb-6 px-4">
            {activeTab === "lock" && (
              <div className="flex-1 flex flex-col justify-between items-center text-center">
                {/* Lock Screen Top Header */}
                <div className="mt-8 flex flex-col items-center">
                  <p className="text-xs font-medium tracking-wide uppercase opacity-90 drop-shadow-md">
                    {lang === "my" ? "သောကြာ၊ အောက်တိုဘာ ၁၆" : "Friday, October 16"}
                  </p>
                  <h1
                    className="text-7xl font-bold tracking-tight drop-shadow-lg my-1"
                    style={{
                      fontFamily: displayFontFamily,
                      ...(theme.clock?.useAccent
                        ? activeAccent?.type === "gradient"
                          ? {
                              backgroundImage: accentGradientCss,
                              WebkitBackgroundClip: "text",
                              WebkitTextFillColor: "transparent",
                            }
                          : { color: primaryAccentHex }
                        : { color: resolveColor("@text", theme.palette, activeAccent) }),
                    }}
                  >
                    19:47
                  </h1>
                </div>

                {/* Countdown Card */}
                <div className="w-full max-w-[320px] rounded-2xl bg-black/40 backdrop-blur-md border border-white/10 p-3.5 mb-10 shadow-lg flex items-center gap-3 text-left">
                  <div
                    className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0 shadow-md"
                    style={{ background: accentGradientCss }}
                  >
                    <EventIcon className="h-5 w-5 text-black" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-medium text-white/70 uppercase tracking-wider">
                      {theme.name?.[lang] || theme.name?.en}
                    </p>
                    <p className="text-sm font-semibold text-white truncate">
                      {lang === "my" ? "၃ ရက် အတွင်း ကျရောက်မည်" : "Coming up in 3 days"}
                    </p>
                  </div>
                </div>

                {/* Bottom lock indicators */}
                <div className="w-full flex justify-between items-center px-4 mb-2">
                  <div className="h-10 w-10 rounded-full bg-black/40 backdrop-blur-md border border-white/10 flex items-center justify-center">
                    <Sun className="h-4 w-4 text-white" />
                  </div>
                  <div className="h-10 w-10 rounded-full bg-black/40 backdrop-blur-md border border-white/10 flex items-center justify-center">
                    <Camera className="h-4 w-4 text-white" />
                  </div>
                </div>
              </div>
            )}

            {activeTab === "home" && (
              <div className="flex-1 flex flex-col justify-between">
                {/* Home Screen Clock / Widget */}
                <div className="mt-4 flex flex-col items-center text-center">
                  <h2
                    className="text-4xl font-bold drop-shadow-md"
                    style={{
                      fontFamily: displayFontFamily,
                      color: resolveColor("@text", theme.palette, activeAccent),
                    }}
                  >
                    19:47
                  </h2>
                  <p className="text-xs opacity-80 mt-0.5">
                    {lang === "my" ? "သောကြာ၊ ၁၆ အောက်တိုဘာ" : "Friday, Oct 16"}
                  </p>
                </div>

                {/* 4x3 Icon Grid */}
                <div className="grid grid-cols-4 gap-y-4 gap-x-2 my-auto px-1">
                  {SAMPLE_APPS.slice(0, 8).map((app) => {
                    const AppIcon = app.icon;
                    return (
                      <div key={app.id} className="flex flex-col items-center gap-1">
                        <div
                          className={cn(
                            "h-14 w-14 flex items-center justify-center shadow-md transition-all overflow-hidden border",
                            getTileShapeClass(tileShape)
                          )}
                          style={{
                            backgroundColor: iconPack?.tile || resolveColor("@surface", theme.palette, activeAccent),
                            borderColor: iconPack?.ring || "transparent",
                          }}
                        >
                          <AppIcon
                            className="h-6 w-6"
                            style={{ color: iconPack?.glyph || "#FFFFFF" }}
                          />
                        </div>
                        <span
                          className="text-[11px] font-medium tracking-tight truncate max-w-[64px]"
                          style={{
                            color: resolvedNameColor,
                            fontFamily: labelFontFamily,
                            textShadow:
                              nameColorChoice === "white" || nameColorChoice === "theme"
                                ? "0 1px 3px rgba(0,0,0,0.85)"
                                : "0 1px 2px rgba(255,255,255,0.4)",
                          }}
                        >
                          {app.name[lang] || app.name.en}
                        </span>
                      </div>
                    );
                  })}
                </div>

                {/* Dock with 4 apps */}
                <div className="rounded-3xl bg-black/35 backdrop-blur-md border border-white/10 p-2.5 grid grid-cols-4 gap-2 mb-2">
                  {SAMPLE_APPS.slice(8, 12).map((app) => {
                    const AppIcon = app.icon;
                    return (
                      <div key={app.id} className="flex flex-col items-center">
                        <div
                          className={cn(
                            "h-13 w-13 flex items-center justify-center shadow-md border",
                            getTileShapeClass(tileShape)
                          )}
                          style={{
                            backgroundColor: iconPack?.tile || resolveColor("@surface", theme.palette, activeAccent),
                            borderColor: iconPack?.ring || "transparent",
                          }}
                        >
                          <AppIcon
                            className="h-6 w-6"
                            style={{ color: iconPack?.glyph || "#FFFFFF" }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {activeTab === "card" && (
              <div className="flex-1 flex flex-col justify-center items-center gap-6 p-2">
                {/* Store Grid Card Preview */}
                <div className="w-full max-w-[280px] rounded-2xl overflow-hidden border border-white/15 bg-black/60 shadow-xl">
                  <div className="relative aspect-4/3 w-full overflow-hidden">
                    <LayersCanvas
                      scene={theme.scene}
                      palette={theme.palette}
                      accent={activeAccent}
                      animate={false}
                      width={280}
                      height={210}
                    />
                    <div className="absolute top-2 left-2 flex gap-1">
                      {theme.isLive && (
                        <span className="bg-red-500/90 text-white font-bold text-[9px] px-1.5 py-0.5 rounded-xs tracking-wider">
                          LIVE
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="p-3">
                    <h3
                      className="text-sm font-semibold truncate"
                      style={{ fontFamily: displayFontFamily }}
                    >
                      {theme.name?.[lang] || theme.name?.en}
                    </h3>
                    <p className="text-[11px] text-muted-foreground truncate">
                      {theme.subtitle?.[lang] || theme.subtitle?.en || "Curated wallpaper theme"}
                    </p>
                    <div className="mt-2 flex items-center justify-between text-[10px] text-white/60">
                      <span className="capitalize">{theme.style || "minimal"}</span>
                      <span>{(theme.downloadBytes ? (theme.downloadBytes / 1024 / 1024).toFixed(1) : "0.8")} MB</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Home indicator bar */}
          <div className="absolute bottom-1.5 left-1/2 -translate-x-1/2 w-32 h-1 bg-white/60 rounded-full z-20 pointer-events-none" />
        </div>
      </div>

      {/* Switchers & Controls Panel */}
      {!hideControls && (
        <div className="flex-1 w-full max-w-md space-y-5 rounded-xl border bg-card p-5 text-card-foreground shadow-xs">
          <div>
            <h2 className="text-base font-semibold">Preview Controls</h2>
            <p className="text-xs text-muted-foreground">
              Simulate how the theme renders across user device settings
            </p>
          </div>

          {/* Tab Switcher */}
          <div className="space-y-1.5">
            <Label className="text-xs">Preview Mode</Label>
            <Tabs
              value={activeTab}
              onValueChange={(v) => setActiveTab(v as "lock" | "home" | "card")}
              className="w-full"
            >
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="lock">Lock Screen</TabsTrigger>
                <TabsTrigger value="home">Home Screen</TabsTrigger>
                <TabsTrigger value="card">Store Card</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          {/* Accent Picker */}
          <div className="space-y-1.5">
            <Label className="text-xs">Accent Color</Label>
            <div className="flex flex-wrap gap-2">
              {theme.accents?.map((acc) => {
                const isSelected = acc.id === selectedAccentId;
                const bg =
                  acc.type === "gradient" && acc.colors?.length >= 2
                    ? `linear-gradient(${acc.angle ?? 90}deg, ${acc.colors.join(", ")})`
                    : acc.colors?.[0] || "#fff";

                return (
                  <button
                    key={acc.id}
                    type="button"
                    onClick={() => setSelectedAccentId(acc.id)}
                    className={cn(
                      "flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-all",
                      isSelected
                        ? "border-primary bg-primary/10 ring-1 ring-primary"
                        : "hover:bg-muted"
                    )}
                  >
                    <span
                      className="h-3 w-3 rounded-full border border-black/20"
                      style={{ background: bg }}
                    />
                    <span>{acc.name?.[lang] || acc.name?.en || acc.id}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Language Switcher */}
          <div className="space-y-1.5">
            <Label className="text-xs">Device Language</Label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setLang("en")}
                className={cn(
                  "rounded-md border py-1.5 text-xs font-medium transition-colors",
                  lang === "en" ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted"
                )}
              >
                English (en)
              </button>
              <button
                type="button"
                onClick={() => setLang("my")}
                className={cn(
                  "rounded-md border py-1.5 text-xs font-medium transition-colors",
                  lang === "my" ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted"
                )}
              >
                မြန်မာ (my)
              </button>
            </div>
          </div>

          {/* Tile Shape Switcher */}
          <div className="space-y-1.5">
            <Label className="text-xs">Icon Tile Shape</Label>
            <div className="grid grid-cols-4 gap-2">
              {(["squircle", "circle", "square", "leaf"] as TileShape[]).map((shape) => (
                <button
                  key={shape}
                  type="button"
                  onClick={() => setTileShape(shape)}
                  className={cn(
                    "rounded-md border py-1.5 text-xs capitalize font-medium transition-colors",
                    tileShape === shape
                      ? "border-primary bg-primary/10 text-primary ring-1 ring-primary"
                      : "hover:bg-muted"
                  )}
                >
                  {shape}
                </button>
              ))}
            </div>
          </div>

          {/* App Name Color Switcher */}
          <div className="space-y-1.5">
            <Label className="text-xs">App Name Colour</Label>
            <div className="grid grid-cols-4 gap-2">
              {(["theme", "accent", "white", "dark"] as const).map((col) => (
                <button
                  key={col}
                  type="button"
                  onClick={() => setNameColorChoice(col)}
                  className={cn(
                    "rounded-md border py-1.5 text-xs capitalize font-medium transition-colors",
                    nameColorChoice === col
                      ? "border-primary bg-primary/10 text-primary ring-1 ring-primary"
                      : "hover:bg-muted"
                  )}
                >
                  {col}
                </button>
              ))}
            </div>
          </div>

          {/* App Name Font Switcher */}
          <div className="space-y-1.5">
            <Label className="text-xs">App Name Font</Label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setNameFontChoice("theme")}
                className={cn(
                  "rounded-md border py-1.5 text-xs font-medium transition-colors",
                  nameFontChoice === "theme"
                    ? "border-primary bg-primary/10 text-primary ring-1 ring-primary"
                    : "hover:bg-muted"
                  )}
              >
                Theme Font ({theme.fonts?.labels || "Default"})
              </button>
              <button
                type="button"
                onClick={() => setNameFontChoice("system")}
                className={cn(
                  "rounded-md border py-1.5 text-xs font-medium transition-colors",
                  nameFontChoice === "system"
                    ? "border-primary bg-primary/10 text-primary ring-1 ring-primary"
                    : "hover:bg-muted"
                )}
              >
                System Font
              </button>
            </div>
          </div>

          {/* Animate Toggle */}
          <div className="flex items-center justify-between border-t pt-3">
            <div className="space-y-0.5">
              <Label htmlFor="preview-animate" className="text-xs font-medium flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                Live Animation
              </Label>
              <p className="text-[11px] text-muted-foreground">
                Respects prefers-reduced-motion
              </p>
            </div>
            <Switch
              id="preview-animate"
              checked={animate}
              onCheckedChange={setAnimate}
            />
          </div>
        </div>
      )}
    </div>
  );
}
