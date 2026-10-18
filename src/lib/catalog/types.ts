/**
 * Catalog data-format types matching docs/theme-api.md §§ 4.2–4.9.
 * These represent the catalog JSON format on disk and CDN, not the API schema.
 */

export interface Localized {
  en: string;
  [lang: string]: string;
}

export type AssetFormat =
  | "png"
  | "webp"
  | "jpg"
  | "ttf"
  | "otf"
  | "woff2"
  | "json";

export interface Asset {
  url: string;
  sha256: string;
  bytes: number;
  format: AssetFormat;
}

export interface FestivalFallbackDate {
  month: number;
  day: number;
}

export interface FestivalLook {
  background: string;
  surface: string;
  surface2: string;
  outline: string;
  nav: string;
  muted: string;
  brand: string;
  displayFont: string;
}

export interface Festival {
  id: string;
  name: Localized;
  kind: "festival" | "collection";
  tags?: string[];
  comingSoon?: boolean;
  sort?: number;
  occurrences?: string[];
  fallbackDate?: FestivalFallbackDate;
  durationDays?: number;
  unit?: "day" | "night";
  look: FestivalLook;
  coverThemeId?: string;
}

export interface Palette {
  background: string;
  deep: string;
  surface: string;
  text: string;
  textMuted: string;
  motif?: string;
}

export interface PaletteOverride {
  background?: string;
  deep?: string;
  surface?: string;
  text?: string;
  textMuted?: string;
  motif?: string;
}

export interface SolidAccent {
  id: string;
  name: Localized;
  type: "solid";
  colors: [string];
}

export interface GradientAccent {
  id: string;
  name: Localized;
  type: "gradient";
  colors: string[];
  angle?: number;
}

export type Accent = SolidAccent | GradientAccent;

export interface Variant {
  id: string;
  name: Localized;
  palette?: PaletteOverride;
  accentId?: string;
}

export interface GradientLayer {
  type: "gradient";
  colors: string[];
  angle?: number;
  opacity?: number;
}

export type ShapeType = "circle" | "ellipse" | "rect" | "polygon";
export type ShapeMotion = "none" | "float" | "pulse" | "sway";

export interface ShapeLayer {
  type: "shape";
  shape: ShapeType;
  x: number;
  y: number;
  width: number;
  aspect?: number;
  color: string;
  points?: [number, number][];
  glow?: boolean;
  motion?: ShapeMotion;
  opacity?: number;
}

export type ImageFit = "width" | "cover" | "contain";
export type ImageAnchor = "top" | "center" | "bottom";

export interface ImageLayer {
  type: "image";
  image: Asset;
  fit?: ImageFit;
  anchor?: ImageAnchor;
  opacity?: number;
}

export type ParticleEffect =
  | "snow"
  | "rain"
  | "drops"
  | "bats"
  | "lanterns"
  | "petals"
  | "sparkles"
  | "stars";

export interface ParticlesLayer {
  type: "particles";
  effect: ParticleEffect;
  count: number;
  color: string;
  speed?: number;
  size?: number;
  opacity?: number;
}

export type Layer = GradientLayer | ShapeLayer | ImageLayer | ParticlesLayer;

export interface LayersSceneParams {
  layers: Layer[];
}

export interface Scene<TParams = Record<string, unknown> | LayersSceneParams> {
  engine: "layers" | "halloween" | "christmas" | "thingyan" | string;
  params: TParams;
}

export interface ThemeFonts {
  display: string;
  body?: string;
  labels?: string;
}

export interface Clock {
  useAccent?: boolean;
}

export interface Labels {
  color?: string;
}

export type ThemeStyle = "classic" | "cozy" | "minimal" | "cute";

export interface ThemeDetail {
  id: string;
  rev: number;
  festivalId: string;
  name: Localized;
  subtitle?: Localized;
  style?: ThemeStyle;
  tags?: string[];
  isLive?: boolean;
  publishedAt?: string;
  popularity?: number;
  minAppVersion?: string;
  scene: Scene;
  palette: Palette;
  accents: Accent[];
  variants?: Variant[];
  fonts: ThemeFonts;
  clock?: Clock;
  labels?: Labels;
  eventIcon?: string;
  iconPackId?: string;
  wallpaperIds?: string[];
  downloadBytes?: number;
  previewImage?: Asset;
}

export interface ThemeSummary {
  id: string;
  rev: number;
  festivalId: string;
  name: Localized;
  subtitle?: Localized;
  style?: ThemeStyle;
  tags?: string[];
  isLive?: boolean;
  publishedAt?: string;
  popularity?: number;
  minAppVersion?: string;
  scene: Scene;
  palette: Palette;
  accent: Accent;
  displayFont: string;
  variantSwatches?: string[];
  iconPackId?: string;
  downloadBytes?: number;
  previewImage?: Asset;
}

export interface FontFile {
  weight?: number;
  maxWeight?: number;
  style?: "normal" | "italic";
  asset: Asset;
}

export type FontCategory = "display" | "handwritten" | "clean" | "myanmar";

export interface Font {
  id: string;
  family: string;
  category?: FontCategory;
  scripts: string[];
  tags?: string[];
  license: "OFL-1.1" | "Apache-2.0";
  files: FontFile[];
  fallbackFor?: Record<string, string>;
  sampleText?: Localized | string;
  listed?: boolean;
}

export type TileShape = "squircle" | "circle" | "square" | "leaf";

export interface IconPack {
  id: string;
  festivalId?: string;
  name: Localized;
  style?: Localized;
  kind: "painted" | "images";
  painter?: "halloween" | "christmas" | "thingyan" | string;
  shape?: TileShape;
  tile?: string;
  glyph?: string;
  ring?: string;
  background?: Asset;
  publishedAt?: string;
  popularity?: number;
}

export interface BannerAction {
  type: "festival" | "theme" | "wallpapers" | "icon-packs" | "fonts" | "url";
  id?: string;
  url?: string;
}

export interface BannerLook {
  background: string;
  accent: string;
  titleColor: string;
  font: string;
  artThemeId?: string;
}

export interface Banner {
  id: string;
  tag: Localized;
  title: Localized;
  subtitle: Localized;
  cta: Localized;
  action: BannerAction;
  look: BannerLook;
  startsAt?: string;
  endsAt?: string;
  sort: number;
}

export interface WallpaperImageSize {
  width: number;
  height: number;
  asset: Asset;
}

export interface WallpaperImage {
  sizes: WallpaperImageSize[];
  blurhash?: string;
  dominant?: string;
}

export interface Wallpaper {
  id: string;
  festivalId?: string;
  name: Localized;
  kind: "scene" | "image";
  scene?: Scene;
  image?: WallpaperImage;
  tags?: string[];
  publishedAt?: string;
  popularity?: number;
  minAppVersion?: string;
}

export interface EngineInfo {
  id: string;
  sinceApp: string;
  params: string[];
}
