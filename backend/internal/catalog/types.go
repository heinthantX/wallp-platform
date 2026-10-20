package catalog

// Localized maps language codes (e.g. "en", "my") to display text.
// The "en" key is required.
type Localized map[string]string

// Asset represents a downloadable file on the CDN, named by its content hash.
type Asset struct {
	URL    string `json:"url"`
	SHA256 string `json:"sha256"`
	Bytes  int64  `json:"bytes"`
	Format string `json:"format"`
}

// FallbackDate holds a month and day for fixed-date festivals or recurring fallback.
// 29 February is not allowed.
type FallbackDate struct {
	Month int `json:"month"`
	Day   int `json:"day"`
}

// FestivalLook contains the 8 required colors and display font for browsing a festival.
type FestivalLook struct {
	Background  string `json:"background"`
	Surface     string `json:"surface"`
	Surface2    string `json:"surface2"`
	Outline     string `json:"outline"`
	Nav         string `json:"nav"`
	Muted       string `json:"muted"`
	Brand       string `json:"brand"`
	DisplayFont string `json:"displayFont"`
}

// Festival represents a dated festival or collection.
type Festival struct {
	ID           string        `json:"id"`
	Name         Localized     `json:"name"`
	Kind         string        `json:"kind"`
	Tags         []string      `json:"tags,omitempty"`
	ComingSoon   *bool         `json:"comingSoon,omitempty"`
	Sort         int           `json:"sort"`
	Occurrences  []string      `json:"occurrences,omitempty"`
	FallbackDate *FallbackDate `json:"fallbackDate,omitempty"`
	DurationDays *int          `json:"durationDays,omitempty"`
	Unit         *string       `json:"unit,omitempty"`
	Look         FestivalLook  `json:"look"`
	CoverThemeID *string       `json:"coverThemeId,omitempty"`
}

// Category represents a catalog category grouping.
type Category struct {
	ID   string    `json:"id"`
	Name Localized `json:"name"`
	Sort int       `json:"sort"`
	Tags []string  `json:"tags,omitempty"`
}

// Palette defines the five core theme colors plus an optional motif color.
type Palette struct {
	Background string  `json:"background"`
	Deep       string  `json:"deep"`
	Surface    string  `json:"surface"`
	Text       string  `json:"text"`
	TextMuted  string  `json:"textMuted"`
	Motif      *string `json:"motif,omitempty"`
}

// PaletteOverride contains partial palette color overrides for a variant.
type PaletteOverride struct {
	Background *string `json:"background,omitempty"`
	Deep       *string `json:"deep,omitempty"`
	Surface    *string `json:"surface,omitempty"`
	Text       *string `json:"text,omitempty"`
	TextMuted  *string `json:"textMuted,omitempty"`
	Motif      *string `json:"motif,omitempty"`
}

// Accent represents a solid or gradient accent color choice.
type Accent struct {
	ID     string    `json:"id"`
	Name   Localized `json:"name"`
	Type   string    `json:"type"`
	Colors []string  `json:"colors"`
	Angle  *int      `json:"angle,omitempty"`
}

// Variant defines a color variant of a theme.
type Variant struct {
	ID       string           `json:"id"`
	Name     Localized        `json:"name"`
	Palette  *PaletteOverride `json:"palette,omitempty"`
	AccentID *string          `json:"accentId,omitempty"`
}

// ThemeFonts specifies font IDs for display, body, and icon labels.
type ThemeFonts struct {
	Display string `json:"display"`
	Body    string `json:"body"`
	Labels  string `json:"labels"`
}

// Clock configures lock screen clock appearance.
type Clock struct {
	UseAccent bool `json:"useAccent"`
}

// Labels configures app name labels on wallp Home.
type Labels struct {
	Color *string `json:"color,omitempty"`
}

// Layer represents a single layer in a layers engine scene.
// Gradient, shape, image, and particles layers share this struct with optional fields.
type Layer struct {
	Type    string   `json:"type"`
	Opacity *float64 `json:"opacity,omitempty"`

	// Gradient layer fields
	Colors []string `json:"colors,omitempty"`
	Angle  *int     `json:"angle,omitempty"`

	// Shape layer fields
	Shape  *string     `json:"shape,omitempty"`
	X      *float64    `json:"x,omitempty"`
	Y      *float64    `json:"y,omitempty"`
	Width  *float64    `json:"width,omitempty"`
	Aspect *float64    `json:"aspect,omitempty"`
	Color  *string     `json:"color,omitempty"`
	Points [][]float64 `json:"points,omitempty"`
	Glow   *bool       `json:"glow,omitempty"`
	Motion *string     `json:"motion,omitempty"`

	// Image layer fields
	Image  *Asset  `json:"image,omitempty"`
	Fit    *string `json:"fit,omitempty"`
	Anchor *string `json:"anchor,omitempty"`

	// Particles layer fields
	Effect *string  `json:"effect,omitempty"`
	Count  *int     `json:"count,omitempty"`
	Speed  *float64 `json:"speed,omitempty"`
	Size   *float64 `json:"size,omitempty"`
}

// SceneParams contains engine-specific parameters (e.g. layers).
type SceneParams struct {
	Layers []Layer `json:"layers,omitempty"`
}

// Scene describes the engine drawing a wallpaper or theme and its parameters.
type Scene struct {
	Engine string      `json:"engine"`
	Params SceneParams `json:"params"`
}

// ThemeDetail is the complete definition of a theme (from themes/<id>.<rev>.json).
type ThemeDetail struct {
	ID            string     `json:"id"`
	Rev           int        `json:"rev"`
	FestivalID    string     `json:"festivalId"`
	CategoryIDs   []string   `json:"categoryIds,omitempty"`
	Name          Localized  `json:"name"`
	Subtitle      Localized  `json:"subtitle,omitempty"`
	Style         string     `json:"style"`
	Tags          []string   `json:"tags,omitempty"`
	IsLive        *bool      `json:"isLive,omitempty"`
	PublishedAt   string     `json:"publishedAt"`
	Popularity    *int       `json:"popularity,omitempty"`
	MinAppVersion *string    `json:"minAppVersion,omitempty"`
	Scene         Scene      `json:"scene"`
	Palette       Palette    `json:"palette"`
	Accents       []Accent   `json:"accents"`
	Variants      []Variant  `json:"variants,omitempty"`
	Fonts         ThemeFonts `json:"fonts"`
	Clock         Clock      `json:"clock"`
	Labels        *Labels    `json:"labels,omitempty"`
	EventIcon     *string    `json:"eventIcon,omitempty"`
	IconPackID    string     `json:"iconPackId"`
	WallpaperIDs  []string   `json:"wallpaperIds,omitempty"`
	DownloadBytes int64      `json:"downloadBytes"`
	PreviewImage  *Asset     `json:"previewImage,omitempty"`
}

// ThemeSummary is a lightweight theme listing inside catalog.<version>.json.
type ThemeSummary struct {
	ID              string    `json:"id"`
	Rev             int       `json:"rev"`
	FestivalID      string    `json:"festivalId"`
	CategoryIDs     []string  `json:"categoryIds,omitempty"`
	Name            Localized `json:"name"`
	Subtitle        Localized `json:"subtitle,omitempty"`
	Style           string    `json:"style"`
	Tags            []string  `json:"tags,omitempty"`
	IsLive          *bool     `json:"isLive,omitempty"`
	PublishedAt     string    `json:"publishedAt"`
	Popularity      *int      `json:"popularity,omitempty"`
	MinAppVersion   *string   `json:"minAppVersion,omitempty"`
	Scene           Scene     `json:"scene"`
	Palette         Palette   `json:"palette"`
	Accent          Accent    `json:"accent"`
	DisplayFont     string    `json:"displayFont"`
	VariantSwatches []string  `json:"variantSwatches,omitempty"`
	IconPackID      string    `json:"iconPackId"`
	DownloadBytes   int64     `json:"downloadBytes"`
	PreviewImage    *Asset    `json:"previewImage,omitempty"`
}

// ImageSize defines a single resolution variant of an image wallpaper.
type ImageSize struct {
	Width  int   `json:"width"`
	Height int   `json:"height"`
	Asset  Asset `json:"asset"`
}

// WallpaperImage holds the size variants and metadata for an image wallpaper.
type WallpaperImage struct {
	Sizes    []ImageSize `json:"sizes"`
	Dominant string      `json:"dominant"`
	Blurhash *string     `json:"blurhash,omitempty"`
}

// Wallpaper represents a standalone wallpaper (scene or image).
type Wallpaper struct {
	ID            string          `json:"id"`
	FestivalID    string          `json:"festivalId"`
	CategoryIDs   []string        `json:"categoryIds,omitempty"`
	Name          Localized       `json:"name"`
	Kind          string          `json:"kind"`
	PublishedAt   string          `json:"publishedAt"`
	Scene         *Scene          `json:"scene,omitempty"`
	Image         *WallpaperImage `json:"image,omitempty"`
	Tags          []string        `json:"tags,omitempty"`
	IsLive        *bool           `json:"isLive,omitempty"`
	Popularity    *int            `json:"popularity,omitempty"`
	MinAppVersion *string         `json:"minAppVersion,omitempty"`
}

// FontFile describes a font asset with weight, maxWeight, and style.
type FontFile struct {
	Weight    *int    `json:"weight,omitempty"`
	MaxWeight *int    `json:"maxWeight,omitempty"`
	Style     *string `json:"style,omitempty"`
	Asset     Asset   `json:"asset"`
}

// Font represents a downloadable typeface.
type Font struct {
	ID          string            `json:"id"`
	Family      string            `json:"family"`
	Category    string            `json:"category"`
	Scripts     []string          `json:"scripts"`
	Tags        []string          `json:"tags,omitempty"`
	License     string            `json:"license"`
	Files       []FontFile        `json:"files"`
	FallbackFor map[string]string `json:"fallbackFor,omitempty"`
	SampleText  Localized         `json:"sampleText,omitempty"`
	Listed      *bool             `json:"listed,omitempty"`
}

// IconPack represents an icon pack (painted or images).
type IconPack struct {
	ID         string    `json:"id"`
	FestivalID string    `json:"festivalId"`
	Name       Localized `json:"name"`
	Style      Localized `json:"style"`
	Kind       string    `json:"kind"`
	Painter    *string   `json:"painter,omitempty"`
	Shape      string    `json:"shape"`
	Tile       *string   `json:"tile,omitempty"`
	Glyph      string    `json:"glyph"`
	Ring       string    `json:"ring"`
	Background *Asset    `json:"background,omitempty"`
	// Apps maps an Android package name to a drawn icon; apps not listed fall back to the pack style.
	Apps              map[string]Asset `json:"apps,omitempty"`
	AppsFallbackStyle *string          `json:"appsFallbackStyle,omitempty"`
	PublishedAt       string           `json:"publishedAt"`
	Popularity        *int             `json:"popularity,omitempty"`
}

// BannerAction defines where a banner button links to.
type BannerAction struct {
	Type string  `json:"type"`
	ID   *string `json:"id,omitempty"`
	URL  *string `json:"url,omitempty"`
}

// BannerLook defines the colors, font, and optional background art for a banner.
type BannerLook struct {
	Background string  `json:"background"`
	Accent     string  `json:"accent"`
	TitleColor string  `json:"titleColor"`
	Font       string  `json:"font"`
	ArtThemeID *string `json:"artThemeId,omitempty"`
	// Image is an optional banner picture; apps that predate it ignore the field.
	Image *Asset `json:"image,omitempty"`
}

// Banner represents a store home carousel banner.
type Banner struct {
	ID       string       `json:"id"`
	Title    Localized    `json:"title"`
	Subtitle Localized    `json:"subtitle"`
	Tag      Localized    `json:"tag"`
	CTA      Localized    `json:"cta"`
	Action   BannerAction `json:"action"`
	Look     BannerLook   `json:"look"`
	Sort     int          `json:"sort"`
	StartsAt *string      `json:"startsAt,omitempty"`
	EndsAt   *string      `json:"endsAt,omitempty"`
}

// AccentPresets provides the solid and gradient accent choices offered on every theme.
type AccentPresets struct {
	Solids    []Accent `json:"solids"`
	Gradients []Accent `json:"gradients"`
}

// Engine describes an engine entry in engines.json.
type Engine struct {
	ID       string   `json:"id"`
	SinceApp string   `json:"sinceApp"`
	Params   []string `json:"params"`
}

// Engines represents the top-level engines.json format.
type Engines struct {
	Engines []Engine `json:"engines"`
}

// Catalog represents the full catalog.<version>.json document.
type Catalog struct {
	CatalogVersion    string         `json:"catalogVersion"`
	Festivals         []Festival     `json:"festivals"`
	Categories        []Category     `json:"categories"`
	Themes            []ThemeSummary `json:"themes"`
	Wallpapers        []Wallpaper    `json:"wallpapers"`
	Fonts             []Font         `json:"fonts"`
	IconPacks         []IconPack     `json:"iconPacks"`
	Banners           []Banner       `json:"banners"`
	AccentPresets     AccentPresets  `json:"accentPresets"`
	SearchSuggestions []string       `json:"searchSuggestions"`
}

// Manifest represents manifest.json pointing to the active catalog file.
type Manifest struct {
	SchemaVersion  int    `json:"schemaVersion"`
	CatalogVersion string `json:"catalogVersion"`
	Catalog        string `json:"catalog"`
	CatalogSHA256  string `json:"catalogSha256"`
	MinAppVersion  string `json:"minAppVersion"`
	PublishedAt    string `json:"publishedAt"`
}
