package catalog

import (
	"fmt"
	"net/url"
	"regexp"
	"strings"
	"time"
)

// FieldError represents a validation error at a specific JSON path.
type FieldError struct {
	Field   string `json:"field"`
	Code    string `json:"code"`
	Message string `json:"message"`
}

func (e FieldError) Error() string {
	return fmt.Sprintf("%s: %s (%s)", e.Field, e.Message, e.Code)
}

var (
	kebabRegex = regexp.MustCompile(`^[a-z0-9]+(-[a-z0-9]+)*$`)
	colorRegex = regexp.MustCompile(`^#[0-9A-Fa-f]{6}$`)
	shaRegex   = regexp.MustCompile(`^[0-9a-f]{64}$`)
)

var sceneTokens = map[string]struct{}{
	"@background": {},
	"@deep":       {},
	"@surface":    {},
	"@text":       {},
	"@motif":      {},
	"@accent":     {},
}

var assetFormats = map[string]struct{}{
	"png":   {},
	"webp":  {},
	"jpg":   {},
	"ttf":   {},
	"otf":   {},
	"woff2": {},
	"json":  {},
}

var fontCategories = map[string]struct{}{
	"display":     {},
	"handwritten": {},
	"clean":       {},
	"myanmar":     {},
}

var themeStyles = map[string]struct{}{
	"classic": {},
	"cozy":    {},
	"minimal": {},
	"cute":    {},
}

var bannerActionTypes = map[string]struct{}{
	"festival":   {},
	"theme":      {},
	"wallpapers": {},
	"fonts":      {},
	"icon-packs": {},
	"url":        {},
}

var iconShapes = map[string]struct{}{
	"squircle": {},
	"circle":   {},
	"square":   {},
	"leaf":     {},
}

var particleEffects = map[string]struct{}{
	"snow":     {},
	"rain":     {},
	"drops":    {},
	"bats":     {},
	"lanterns": {},
	"petals":   {},
	"sparkles": {},
	"stars":    {},
}

var shapeKinds = map[string]struct{}{
	"circle":  {},
	"ellipse": {},
	"rect":    {},
	"polygon": {},
}

var shapeMotions = map[string]struct{}{
	"none":  {},
	"float": {},
	"pulse": {},
	"sway":  {},
}

var imageFits = map[string]struct{}{
	"cover":   {},
	"width":   {},
	"contain": {},
}

var imageAnchors = map[string]struct{}{
	"top":    {},
	"center": {},
	"bottom": {},
}

func pathField(parent, child string) string {
	if parent == "" {
		return child
	}
	return parent + "." + child
}

func isValidID(id string) bool {
	return kebabRegex.MatchString(id)
}

func isValidColor(c string) bool {
	return colorRegex.MatchString(c)
}

func isValidDate(s string) (time.Time, bool) {
	if len(s) != 10 || s[4] != '-' || s[7] != '-' {
		return time.Time{}, false
	}
	t, err := time.Parse("2006-01-02", s)
	if err != nil {
		return time.Time{}, false
	}
	if t.Format("2006-01-02") != s {
		return time.Time{}, false
	}
	return t, true
}

func isValidTime(s string) (time.Time, bool) {
	if !strings.HasSuffix(s, "Z") {
		return time.Time{}, false
	}
	t, err := time.Parse(time.RFC3339Nano, s)
	if err != nil {
		return time.Time{}, false
	}
	return t, true
}

func isValidSceneColor(c string, allowTokens bool) (valid bool, isToken bool) {
	if _, ok := sceneTokens[c]; ok {
		if allowTokens {
			return true, true
		}
		return false, true
	}
	if colorRegex.MatchString(c) {
		return true, false
	}
	return false, false
}

func validateLocalized(loc Localized, path string) []FieldError {
	var errs []FieldError
	if loc == nil || len(loc) == 0 {
		errs = append(errs, FieldError{
			Field:   path,
			Code:    "required",
			Message: "localized text is required",
		})
		return errs
	}
	enVal, ok := loc["en"]
	if !ok || strings.TrimSpace(enVal) == "" {
		errs = append(errs, FieldError{
			Field:   pathField(path, "en"),
			Code:    "required",
			Message: `English ("en") is required`,
		})
	}
	for lang, val := range loc {
		if strings.TrimSpace(val) == "" && lang != "en" {
			errs = append(errs, FieldError{
				Field:   pathField(path, lang),
				Code:    "required",
				Message: "expected non-empty text",
			})
		}
	}
	return errs
}

// Validate validates an Asset reference.
func (a *Asset) Validate() []FieldError {
	return a.ValidateWithPath("")
}

// ValidateWithPath validates an Asset reference with a prefix path.
func (a *Asset) ValidateWithPath(path string) []FieldError {
	var errs []FieldError
	if !shaRegex.MatchString(a.SHA256) {
		errs = append(errs, FieldError{
			Field:   pathField(path, "sha256"),
			Code:    "invalid_sha256",
			Message: "expected 64 lowercase hex characters",
		})
	}
	if a.Bytes <= 0 || a.Bytes > 10*1024*1024 {
		errs = append(errs, FieldError{
			Field:   pathField(path, "bytes"),
			Code:    "invalid_range",
			Message: "bytes must be between 1 and 10485760 (10 MB)",
		})
	}
	if _, ok := assetFormats[a.Format]; !ok {
		errs = append(errs, FieldError{
			Field:   pathField(path, "format"),
			Code:    "invalid_enum",
			Message: fmt.Sprintf("unsupported format %q", a.Format),
		})
	}
	expectedURL := fmt.Sprintf("assets/%s.%s", a.SHA256, a.Format)
	if a.URL != expectedURL {
		errs = append(errs, FieldError{
			Field:   pathField(path, "url"),
			Code:    "invalid_asset_url",
			Message: fmt.Sprintf("expected %q, got %q", expectedURL, a.URL),
		})
	}
	return errs
}

// Validate validates a Festival document.
func (f *Festival) Validate() []FieldError {
	var errs []FieldError
	if !isValidID(f.ID) {
		errs = append(errs, FieldError{
			Field:   "id",
			Code:    "invalid_id",
			Message: "id must be lowercase kebab-case",
		})
	}
	errs = append(errs, validateLocalized(f.Name, "name")...)

	if f.Kind != "festival" && f.Kind != "collection" {
		errs = append(errs, FieldError{
			Field:   "kind",
			Code:    "invalid_enum",
			Message: "kind must be festival or collection",
		})
	}

	if f.DurationDays != nil && *f.DurationDays < 1 {
		errs = append(errs, FieldError{
			Field:   "durationDays",
			Code:    "invalid_range",
			Message: "durationDays must be at least 1",
		})
	}

	if f.Unit != nil && *f.Unit != "day" && *f.Unit != "night" {
		errs = append(errs, FieldError{
			Field:   "unit",
			Code:    "invalid_enum",
			Message: "unit must be day or night",
		})
	}

	var prevDate time.Time
	for i, occ := range f.Occurrences {
		d, ok := isValidDate(occ)
		field := fmt.Sprintf("occurrences[%d]", i)
		if !ok {
			errs = append(errs, FieldError{
				Field:   field,
				Code:    "invalid_date",
				Message: "expected valid YYYY-MM-DD date",
			})
			continue
		}
		if i > 0 && !d.After(prevDate) {
			errs = append(errs, FieldError{
				Field:   field,
				Code:    "dates_not_increasing",
				Message: "occurrences dates must be strictly increasing with no duplicates",
			})
		}
		prevDate = d
	}

	if f.FallbackDate != nil {
		month := f.FallbackDate.Month
		day := f.FallbackDate.Day
		if month < 1 || month > 12 {
			errs = append(errs, FieldError{
				Field:   "fallbackDate.month",
				Code:    "invalid_range",
				Message: "month must be 1–12",
			})
		} else {
			maxDays := []int{31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31}[month-1]
			if month == 2 && day == 29 {
				errs = append(errs, FieldError{
					Field:   "fallbackDate",
					Code:    "invalid_fallback_date",
					Message: "29 February is not allowed as fallbackDate",
				})
			} else if day < 1 || day > maxDays {
				errs = append(errs, FieldError{
					Field:   "fallbackDate.day",
					Code:    "invalid_range",
					Message: fmt.Sprintf("day must be 1–%d for month %d", maxDays, month),
				})
			}
		}
	}

	isComingSoon := f.ComingSoon != nil && *f.ComingSoon
	if f.Kind == "festival" && !isComingSoon && len(f.Occurrences) == 0 && f.FallbackDate == nil {
		errs = append(errs, FieldError{
			Field:   "occurrences",
			Code:    "required",
			Message: "a dated festival needs occurrences or fallbackDate",
		})
	}

	for _, k := range []struct {
		name  string
		color string
	}{
		{"background", f.Look.Background},
		{"surface", f.Look.Surface},
		{"surface2", f.Look.Surface2},
		{"outline", f.Look.Outline},
		{"nav", f.Look.Nav},
		{"muted", f.Look.Muted},
		{"brand", f.Look.Brand},
	} {
		if !isValidColor(k.color) {
			errs = append(errs, FieldError{
				Field:   "look." + k.name,
				Code:    "invalid_color",
				Message: "expected colour in #RRGGBB format",
			})
		}
	}
	if !isValidID(f.Look.DisplayFont) {
		errs = append(errs, FieldError{
			Field:   "look.displayFont",
			Code:    "invalid_id",
			Message: "displayFont must be lowercase kebab-case",
		})
	}

	if f.CoverThemeID != nil && *f.CoverThemeID != "" && !isValidID(*f.CoverThemeID) {
		errs = append(errs, FieldError{
			Field:   "coverThemeId",
			Code:    "invalid_id",
			Message: "coverThemeId must be lowercase kebab-case",
		})
	}

	return errs
}

// ValidateWithPath validates an Accent with a prefix path.
func (a *Accent) ValidateWithPath(path string) []FieldError {
	var errs []FieldError
	if !isValidID(a.ID) {
		errs = append(errs, FieldError{
			Field:   pathField(path, "id"),
			Code:    "invalid_id",
			Message: "accent id must be lowercase kebab-case",
		})
	}
	errs = append(errs, validateLocalized(a.Name, pathField(path, "name"))...)

	if a.Type != "solid" && a.Type != "gradient" {
		errs = append(errs, FieldError{
			Field:   pathField(path, "type"),
			Code:    "invalid_enum",
			Message: "accent type must be solid or gradient",
		})
	}

	for ci, c := range a.Colors {
		if !isValidColor(c) {
			errs = append(errs, FieldError{
				Field:   fmt.Sprintf("%s.colors[%d]", path, ci),
				Code:    "invalid_color",
				Message: "expected colour in #RRGGBB format",
			})
		}
	}

	if a.Type == "solid" {
		if len(a.Colors) != 1 {
			errs = append(errs, FieldError{
				Field:   pathField(path, "colors"),
				Code:    "invalid_solid_accent",
				Message: "a solid accent must have exactly 1 colour",
			})
		}
		if a.Angle != nil {
			errs = append(errs, FieldError{
				Field:   pathField(path, "angle"),
				Code:    "invalid_solid_accent",
				Message: "a solid accent must not have an angle",
			})
		}
	} else if a.Type == "gradient" {
		if len(a.Colors) < 2 || len(a.Colors) > 3 {
			errs = append(errs, FieldError{
				Field:   pathField(path, "colors"),
				Code:    "invalid_gradient_accent",
				Message: "a gradient accent must have 2–3 colours",
			})
		}
		if a.Angle != nil && (*a.Angle < 0 || *a.Angle >= 360) {
			errs = append(errs, FieldError{
				Field:   pathField(path, "angle"),
				Code:    "invalid_gradient_accent",
				Message: "angle must be 0–359",
			})
		}
	}

	return errs
}

// Validate validates an Accent.
func (a *Accent) Validate() []FieldError {
	return a.ValidateWithPath("")
}

// Validate validates an AccentPresets container.
func (ap *AccentPresets) Validate() []FieldError {
	var errs []FieldError
	for i := range ap.Solids {
		s := &ap.Solids[i]
		path := fmt.Sprintf("solids[%d]", i)
		if s.Type != "solid" {
			errs = append(errs, FieldError{
				Field:   pathField(path, "type"),
				Code:    "invalid_enum",
				Message: "every entry in solids must be a solid accent",
			})
		}
		errs = append(errs, s.ValidateWithPath(path)...)
	}
	for i := range ap.Gradients {
		g := &ap.Gradients[i]
		path := fmt.Sprintf("gradients[%d]", i)
		if g.Type != "gradient" {
			errs = append(errs, FieldError{
				Field:   pathField(path, "type"),
				Code:    "invalid_enum",
				Message: "every entry in gradients must be a gradient accent",
			})
		}
		errs = append(errs, g.ValidateWithPath(path)...)
	}
	return errs
}

// ValidateScene validates a Scene specification.
func (s *Scene) Validate(allowTokens bool, path string) []FieldError {
	var errs []FieldError
	if !IsValidEngine(s.Engine) {
		errs = append(errs, FieldError{
			Field:   pathField(path, "engine"),
			Code:    "invalid_engine",
			Message: fmt.Sprintf("engine %q is not in the engines list", s.Engine),
		})
	}
	if s.Engine == "layers" {
		if len(s.Params.Layers) == 0 {
			errs = append(errs, FieldError{
				Field:   pathField(path, "params.layers"),
				Code:    "required",
				Message: "the layers engine needs layers",
			})
		}
		for i := range s.Params.Layers {
			l := &s.Params.Layers[i]
			layerPath := fmt.Sprintf("%s.params.layers[%d]", path, i)
			errs = append(errs, l.Validate(allowTokens, layerPath)...)
		}
	}
	return errs
}

// Validate validates a Layer definition.
func (l *Layer) Validate(allowTokens bool, path string) []FieldError {
	var errs []FieldError
	if l.Opacity != nil && (*l.Opacity < 0 || *l.Opacity > 1) {
		errs = append(errs, FieldError{
			Field:   pathField(path, "opacity"),
			Code:    "invalid_range",
			Message: "opacity must be 0–1",
		})
	}

	switch l.Type {
	case "gradient":
		if len(l.Colors) < 2 {
			errs = append(errs, FieldError{
				Field:   pathField(path, "colors"),
				Code:    "invalid_range",
				Message: "gradient needs at least 2 colours",
			})
		}
		for ci, c := range l.Colors {
			valid, isTok := isValidSceneColor(c, allowTokens)
			colorField := fmt.Sprintf("%s.colors[%d]", path, ci)
			if isTok && !allowTokens {
				errs = append(errs, FieldError{
					Field:   colorField,
					Code:    "token_not_allowed",
					Message: "wallpaper scenes use \"#RRGGBB\" colours, not @tokens",
				})
			} else if !valid {
				errs = append(errs, FieldError{
					Field:   colorField,
					Code:    "invalid_color",
					Message: "expected #RRGGBB or palette token",
				})
			}
		}

	case "shape":
		if l.Shape == nil {
			errs = append(errs, FieldError{
				Field:   pathField(path, "shape"),
				Code:    "required",
				Message: "shape is required",
			})
		} else if _, ok := shapeKinds[*l.Shape]; !ok {
			errs = append(errs, FieldError{
				Field:   pathField(path, "shape"),
				Code:    "invalid_enum",
				Message: "shape must be circle, ellipse, rect, or polygon",
			})
		}

		if l.X == nil {
			errs = append(errs, FieldError{
				Field:   pathField(path, "x"),
				Code:    "required",
				Message: "x is required",
			})
		} else if *l.X < -0.5 || *l.X > 1.5 {
			errs = append(errs, FieldError{
				Field:   pathField(path, "x"),
				Code:    "invalid_range",
				Message: "x must be -0.5–1.5",
			})
		}

		if l.Y == nil {
			errs = append(errs, FieldError{
				Field:   pathField(path, "y"),
				Code:    "required",
				Message: "y is required",
			})
		} else if *l.Y < -0.5 || *l.Y > 1.5 {
			errs = append(errs, FieldError{
				Field:   pathField(path, "y"),
				Code:    "invalid_range",
				Message: "y must be -0.5–1.5",
			})
		}

		if l.Width == nil {
			errs = append(errs, FieldError{
				Field:   pathField(path, "width"),
				Code:    "required",
				Message: "width is required",
			})
		} else if *l.Width <= 0 || *l.Width > 3 {
			errs = append(errs, FieldError{
				Field:   pathField(path, "width"),
				Code:    "invalid_range",
				Message: "width must be > 0 and <= 3",
			})
		}

		if l.Aspect != nil && (*l.Aspect <= 0 || *l.Aspect > 10) {
			errs = append(errs, FieldError{
				Field:   pathField(path, "aspect"),
				Code:    "invalid_range",
				Message: "aspect must be > 0 and <= 10",
			})
		}

		if l.Color == nil || *l.Color == "" {
			errs = append(errs, FieldError{
				Field:   pathField(path, "color"),
				Code:    "required",
				Message: "color is required",
			})
		} else {
			valid, isTok := isValidSceneColor(*l.Color, allowTokens)
			if isTok && !allowTokens {
				errs = append(errs, FieldError{
					Field:   pathField(path, "color"),
					Code:    "token_not_allowed",
					Message: "wallpaper scenes use \"#RRGGBB\" colours, not @tokens",
				})
			} else if !valid {
				errs = append(errs, FieldError{
					Field:   pathField(path, "color"),
					Code:    "invalid_color",
					Message: "expected #RRGGBB or palette token",
				})
			}
		}

		if l.Motion != nil && *l.Motion != "" {
			if _, ok := shapeMotions[*l.Motion]; !ok {
				errs = append(errs, FieldError{
					Field:   pathField(path, "motion"),
					Code:    "invalid_enum",
					Message: "motion must be none, float, pulse, or sway",
				})
			}
		}

		if l.Shape != nil && *l.Shape == "polygon" && len(l.Points) < 3 {
			errs = append(errs, FieldError{
				Field:   pathField(path, "points"),
				Code:    "invalid_range",
				Message: "a polygon needs at least 3 points",
			})
		}

		for pi, pt := range l.Points {
			if len(pt) != 2 || pt[0] < 0 || pt[0] > 1 || pt[1] < 0 || pt[1] > 1 {
				errs = append(errs, FieldError{
					Field:   fmt.Sprintf("%s.points[%d]", path, pi),
					Code:    "invalid_range",
					Message: "expected [x, y] in 0–1",
				})
			}
		}

	case "image":
		if l.Image == nil {
			errs = append(errs, FieldError{
				Field:   pathField(path, "image"),
				Code:    "required",
				Message: "image is required",
			})
		} else {
			errs = append(errs, l.Image.ValidateWithPath(pathField(path, "image"))...)
		}

		if l.Fit != nil && *l.Fit != "" {
			if _, ok := imageFits[*l.Fit]; !ok {
				errs = append(errs, FieldError{
					Field:   pathField(path, "fit"),
					Code:    "invalid_enum",
					Message: "fit must be width, cover, or contain",
				})
			}
		}

		if l.Anchor != nil && *l.Anchor != "" {
			if _, ok := imageAnchors[*l.Anchor]; !ok {
				errs = append(errs, FieldError{
					Field:   pathField(path, "anchor"),
					Code:    "invalid_enum",
					Message: "anchor must be top, center, or bottom",
				})
			}
		}

	case "particles":
		if l.Effect == nil {
			errs = append(errs, FieldError{
				Field:   pathField(path, "effect"),
				Code:    "required",
				Message: "effect is required",
			})
		} else if _, ok := particleEffects[*l.Effect]; !ok {
			errs = append(errs, FieldError{
				Field:   pathField(path, "effect"),
				Code:    "invalid_enum",
				Message: fmt.Sprintf("unknown particle effect %q", *l.Effect),
			})
		}

		if l.Count == nil {
			errs = append(errs, FieldError{
				Field:   pathField(path, "count"),
				Code:    "required",
				Message: "count is required",
			})
		} else if *l.Count < 1 || *l.Count > 150 {
			errs = append(errs, FieldError{
				Field:   pathField(path, "count"),
				Code:    "invalid_range",
				Message: "count must be 1–150",
			})
		}

		if l.Color == nil || *l.Color == "" {
			errs = append(errs, FieldError{
				Field:   pathField(path, "color"),
				Code:    "required",
				Message: "color is required",
			})
		} else {
			valid, isTok := isValidSceneColor(*l.Color, allowTokens)
			if isTok && !allowTokens {
				errs = append(errs, FieldError{
					Field:   pathField(path, "color"),
					Code:    "token_not_allowed",
					Message: "wallpaper scenes use \"#RRGGBB\" colours, not @tokens",
				})
			} else if !valid {
				errs = append(errs, FieldError{
					Field:   pathField(path, "color"),
					Code:    "invalid_color",
					Message: "expected #RRGGBB or palette token",
				})
			}
		}

		if l.Speed != nil && (*l.Speed < 0 || *l.Speed > 1) {
			errs = append(errs, FieldError{
				Field:   pathField(path, "speed"),
				Code:    "invalid_range",
				Message: "speed must be 0–1",
			})
		}

		if l.Size != nil && (*l.Size <= 0 || *l.Size > 1) {
			errs = append(errs, FieldError{
				Field:   pathField(path, "size"),
				Code:    "invalid_range",
				Message: "size must be > 0 and <= 1",
			})
		}

	default:
		errs = append(errs, FieldError{
			Field:   pathField(path, "type"),
			Code:    "invalid_enum",
			Message: fmt.Sprintf("unknown layer type %q", l.Type),
		})
	}

	return errs
}

// Validate validates a ThemeDetail document.
func (t *ThemeDetail) Validate() []FieldError {
	var errs []FieldError
	if !isValidID(t.ID) {
		errs = append(errs, FieldError{
			Field:   "id",
			Code:    "invalid_id",
			Message: "theme id must be lowercase kebab-case",
		})
	}
	if t.Rev < 1 {
		errs = append(errs, FieldError{
			Field:   "rev",
			Code:    "invalid_range",
			Message: "rev must be at least 1",
		})
	}
	if !isValidID(t.FestivalID) {
		errs = append(errs, FieldError{
			Field:   "festivalId",
			Code:    "invalid_id",
			Message: "festivalId must be lowercase kebab-case",
		})
	}
	errs = append(errs, validateLocalized(t.Name, "name")...)
	if t.Subtitle != nil {
		errs = append(errs, validateLocalized(t.Subtitle, "subtitle")...)
	}

	if _, ok := themeStyles[t.Style]; !ok {
		errs = append(errs, FieldError{
			Field:   "style",
			Code:    "invalid_enum",
			Message: "style must be classic, cozy, minimal, or cute",
		})
	}

	if _, ok := isValidTime(t.PublishedAt); !ok {
		errs = append(errs, FieldError{
			Field:   "publishedAt",
			Code:    "invalid_time",
			Message: "publishedAt must be ISO 8601 UTC with Z",
		})
	}

	// Validate Scene (tokens allowed)
	errs = append(errs, t.Scene.Validate(true, "scene")...)

	// Validate Palette
	for _, k := range []struct {
		name  string
		color string
	}{
		{"background", t.Palette.Background},
		{"deep", t.Palette.Deep},
		{"surface", t.Palette.Surface},
		{"text", t.Palette.Text},
		{"textMuted", t.Palette.TextMuted},
	} {
		if !isValidColor(k.color) {
			errs = append(errs, FieldError{
				Field:   "palette." + k.name,
				Code:    "invalid_color",
				Message: "expected colour in #RRGGBB format",
			})
		}
	}
	if t.Palette.Motif != nil && *t.Palette.Motif != "" && !isValidColor(*t.Palette.Motif) {
		errs = append(errs, FieldError{
			Field:   "palette.motif",
			Code:    "invalid_color",
			Message: "expected colour in #RRGGBB format",
		})
	}

	// Validate Accents
	if len(t.Accents) == 0 {
		errs = append(errs, FieldError{
			Field:   "accents",
			Code:    "invalid_accents",
			Message: "needs at least one accent",
		})
	}
	seenAccentIDs := make(map[string]struct{}, len(t.Accents))
	for i := range t.Accents {
		a := &t.Accents[i]
		path := fmt.Sprintf("accents[%d]", i)
		if _, seen := seenAccentIDs[a.ID]; seen {
			errs = append(errs, FieldError{
				Field:   pathField(path, "id"),
				Code:    "duplicate_id",
				Message: fmt.Sprintf("duplicate accent ID %q", a.ID),
			})
		} else {
			seenAccentIDs[a.ID] = struct{}{}
		}
		errs = append(errs, a.ValidateWithPath(path)...)
	}

	// Validate Variants
	seenVariantIDs := make(map[string]struct{}, len(t.Variants))
	for i := range t.Variants {
		v := &t.Variants[i]
		path := fmt.Sprintf("variants[%d]", i)
		if !isValidID(v.ID) {
			errs = append(errs, FieldError{
				Field:   pathField(path, "id"),
				Code:    "invalid_id",
				Message: "variant id must be lowercase kebab-case",
			})
		}
		if _, seen := seenVariantIDs[v.ID]; seen {
			errs = append(errs, FieldError{
				Field:   pathField(path, "id"),
				Code:    "duplicate_id",
				Message: fmt.Sprintf("duplicate variant ID %q", v.ID),
			})
		} else {
			seenVariantIDs[v.ID] = struct{}{}
		}
		errs = append(errs, validateLocalized(v.Name, pathField(path, "name"))...)

		if v.Palette != nil {
			for _, k := range []struct {
				name  string
				color *string
			}{
				{"background", v.Palette.Background},
				{"deep", v.Palette.Deep},
				{"surface", v.Palette.Surface},
				{"text", v.Palette.Text},
				{"textMuted", v.Palette.TextMuted},
				{"motif", v.Palette.Motif},
			} {
				if k.color != nil && *k.color != "" && !isValidColor(*k.color) {
					errs = append(errs, FieldError{
						Field:   fmt.Sprintf("%s.palette.%s", path, k.name),
						Code:    "invalid_color",
						Message: "expected colour in #RRGGBB format",
					})
				}
			}
		}

		if v.AccentID != nil && *v.AccentID != "" {
			if _, exists := seenAccentIDs[*v.AccentID]; !exists {
				errs = append(errs, FieldError{
					Field:   pathField(path, "accentId"),
					Code:    "accent_not_found",
					Message: fmt.Sprintf("no accent %q in this theme", *v.AccentID),
				})
			}
		}
	}

	// Validate Fonts
	if !isValidID(t.Fonts.Display) {
		errs = append(errs, FieldError{
			Field:   "fonts.display",
			Code:    "invalid_id",
			Message: "display font id must be lowercase kebab-case",
		})
	}
	if !isValidID(t.Fonts.Body) {
		errs = append(errs, FieldError{
			Field:   "fonts.body",
			Code:    "invalid_id",
			Message: "body font id must be lowercase kebab-case",
		})
	}
	if !isValidID(t.Fonts.Labels) {
		errs = append(errs, FieldError{
			Field:   "fonts.labels",
			Code:    "invalid_id",
			Message: "labels font id must be lowercase kebab-case",
		})
	}

	// Validate Labels
	if t.Labels != nil && t.Labels.Color != nil && *t.Labels.Color != "" {
		if !isValidColor(*t.Labels.Color) {
			errs = append(errs, FieldError{
				Field:   "labels.color",
				Code:    "invalid_color",
				Message: "expected colour in #RRGGBB format",
			})
		}
	}

	// Validate EventIcon
	if t.EventIcon != nil && *t.EventIcon != "" {
		if !IsValidEventIcon(*t.EventIcon) {
			errs = append(errs, FieldError{
				Field:   "eventIcon",
				Code:    "invalid_event_icon",
				Message: fmt.Sprintf("unknown event icon %q", *t.EventIcon),
			})
		}
	}

	// Validate IconPackID
	if !isValidID(t.IconPackID) {
		errs = append(errs, FieldError{
			Field:   "iconPackId",
			Code:    "invalid_id",
			Message: "iconPackId must be lowercase kebab-case",
		})
	}

	// Validate WallpaperIDs
	for wi, wid := range t.WallpaperIDs {
		if !isValidID(wid) {
			errs = append(errs, FieldError{
				Field:   fmt.Sprintf("wallpaperIds[%d]", wi),
				Code:    "invalid_id",
				Message: "wallpaperId must be lowercase kebab-case",
			})
		}
	}

	if t.PreviewImage != nil {
		errs = append(errs, t.PreviewImage.ValidateWithPath("previewImage")...)
	}

	return errs
}

// Validate validates a ThemeSummary document.
func (t *ThemeSummary) Validate() []FieldError {
	var errs []FieldError
	if !isValidID(t.ID) {
		errs = append(errs, FieldError{
			Field:   "id",
			Code:    "invalid_id",
			Message: "theme id must be lowercase kebab-case",
		})
	}
	if t.Rev < 1 {
		errs = append(errs, FieldError{
			Field:   "rev",
			Code:    "invalid_range",
			Message: "rev must be at least 1",
		})
	}
	if !isValidID(t.FestivalID) {
		errs = append(errs, FieldError{
			Field:   "festivalId",
			Code:    "invalid_id",
			Message: "festivalId must be lowercase kebab-case",
		})
	}
	errs = append(errs, validateLocalized(t.Name, "name")...)
	if t.Subtitle != nil {
		errs = append(errs, validateLocalized(t.Subtitle, "subtitle")...)
	}
	if _, ok := themeStyles[t.Style]; !ok {
		errs = append(errs, FieldError{
			Field:   "style",
			Code:    "invalid_enum",
			Message: "style must be classic, cozy, minimal, or cute",
		})
	}
	if _, ok := isValidTime(t.PublishedAt); !ok {
		errs = append(errs, FieldError{
			Field:   "publishedAt",
			Code:    "invalid_time",
			Message: "publishedAt must be ISO 8601 UTC with Z",
		})
	}

	errs = append(errs, t.Scene.Validate(true, "scene")...)

	for _, k := range []struct {
		name  string
		color string
	}{
		{"background", t.Palette.Background},
		{"deep", t.Palette.Deep},
		{"surface", t.Palette.Surface},
		{"text", t.Palette.Text},
		{"textMuted", t.Palette.TextMuted},
	} {
		if !isValidColor(k.color) {
			errs = append(errs, FieldError{
				Field:   "palette." + k.name,
				Code:    "invalid_color",
				Message: "expected colour in #RRGGBB format",
			})
		}
	}
	if t.Palette.Motif != nil && *t.Palette.Motif != "" && !isValidColor(*t.Palette.Motif) {
		errs = append(errs, FieldError{
			Field:   "palette.motif",
			Code:    "invalid_color",
			Message: "expected colour in #RRGGBB format",
		})
	}

	errs = append(errs, t.Accent.ValidateWithPath("accent")...)

	if !isValidID(t.DisplayFont) {
		errs = append(errs, FieldError{
			Field:   "displayFont",
			Code:    "invalid_id",
			Message: "displayFont must be lowercase kebab-case",
		})
	}

	for i, swatch := range t.VariantSwatches {
		if !isValidColor(swatch) {
			errs = append(errs, FieldError{
				Field:   fmt.Sprintf("variantSwatches[%d]", i),
				Code:    "invalid_color",
				Message: "expected colour in #RRGGBB format",
			})
		}
	}

	if !isValidID(t.IconPackID) {
		errs = append(errs, FieldError{
			Field:   "iconPackId",
			Code:    "invalid_id",
			Message: "iconPackId must be lowercase kebab-case",
		})
	}

	if t.PreviewImage != nil {
		errs = append(errs, t.PreviewImage.ValidateWithPath("previewImage")...)
	}

	return errs
}

// Validate validates a Wallpaper document.
func (w *Wallpaper) Validate() []FieldError {
	var errs []FieldError
	if !isValidID(w.ID) {
		errs = append(errs, FieldError{
			Field:   "id",
			Code:    "invalid_id",
			Message: "wallpaper id must be lowercase kebab-case",
		})
	}
	if !isValidID(w.FestivalID) {
		errs = append(errs, FieldError{
			Field:   "festivalId",
			Code:    "invalid_id",
			Message: "festivalId must be lowercase kebab-case",
		})
	}
	errs = append(errs, validateLocalized(w.Name, "name")...)

	if w.Kind != "scene" && w.Kind != "image" {
		errs = append(errs, FieldError{
			Field:   "kind",
			Code:    "invalid_enum",
			Message: "wallpaper kind must be scene or image",
		})
	}

	if _, ok := isValidTime(w.PublishedAt); !ok {
		errs = append(errs, FieldError{
			Field:   "publishedAt",
			Code:    "invalid_time",
			Message: "publishedAt must be ISO 8601 UTC with Z",
		})
	}

	if w.Kind == "scene" {
		if w.Scene == nil {
			errs = append(errs, FieldError{
				Field:   "scene",
				Code:    "required",
				Message: "a scene wallpaper needs a scene",
			})
		} else {
			// Wallpapers do NOT allow tokens
			errs = append(errs, w.Scene.Validate(false, "scene")...)
		}
		if w.Image != nil {
			errs = append(errs, FieldError{
				Field:   "image",
				Code:    "invalid_format",
				Message: "a scene wallpaper must not have an image",
			})
		}
	} else if w.Kind == "image" {
		if w.Image == nil {
			errs = append(errs, FieldError{
				Field:   "image",
				Code:    "required",
				Message: "an image wallpaper needs an image",
			})
		} else {
			if len(w.Image.Sizes) == 0 {
				errs = append(errs, FieldError{
					Field:   "image.sizes",
					Code:    "required",
					Message: "needs at least one size",
				})
			}
			if !isValidColor(w.Image.Dominant) {
				errs = append(errs, FieldError{
					Field:   "image.dominant",
					Code:    "invalid_color",
					Message: "expected colour in #RRGGBB format",
				})
			}
			for i, s := range w.Image.Sizes {
				if s.Width <= 0 {
					errs = append(errs, FieldError{
						Field:   fmt.Sprintf("image.sizes[%d].width", i),
						Code:    "invalid_range",
						Message: "width must be > 0",
					})
				}
				if s.Height <= 0 {
					errs = append(errs, FieldError{
						Field:   fmt.Sprintf("image.sizes[%d].height", i),
						Code:    "invalid_range",
						Message: "height must be > 0",
					})
				}
				errs = append(errs, s.Asset.ValidateWithPath(fmt.Sprintf("image.sizes[%d].asset", i))...)
			}
		}
		if w.Scene != nil {
			errs = append(errs, FieldError{
				Field:   "scene",
				Code:    "invalid_format",
				Message: "an image wallpaper must not have a scene",
			})
		}
	}

	return errs
}

// Validate validates a Font document.
func (f *Font) Validate() []FieldError {
	var errs []FieldError
	if !isValidID(f.ID) {
		errs = append(errs, FieldError{
			Field:   "id",
			Code:    "invalid_id",
			Message: "font id must be lowercase kebab-case",
		})
	}
	if strings.TrimSpace(f.Family) == "" {
		errs = append(errs, FieldError{
			Field:   "family",
			Code:    "required",
			Message: "family is required",
		})
	}
	if _, ok := fontCategories[f.Category]; !ok {
		errs = append(errs, FieldError{
			Field:   "category",
			Code:    "invalid_enum",
			Message: "category must be display, handwritten, clean, or myanmar",
		})
	}
	if len(f.Scripts) == 0 {
		errs = append(errs, FieldError{
			Field:   "scripts",
			Code:    "required",
			Message: "scripts is required",
		})
	}
	if f.License != "OFL-1.1" && f.License != "Apache-2.0" {
		errs = append(errs, FieldError{
			Field:   "license",
			Code:    "invalid_license",
			Message: "license must be OFL-1.1 or Apache-2.0",
		})
	}
	if len(f.Files) == 0 {
		errs = append(errs, FieldError{
			Field:   "files",
			Code:    "required",
			Message: "needs at least one file",
		})
	}
	for i := range f.Files {
		file := &f.Files[i]
		path := fmt.Sprintf("files[%d]", i)
		if file.Asset.Format != "ttf" && file.Asset.Format != "otf" {
			errs = append(errs, FieldError{
				Field:   pathField(path, "asset.format"),
				Code:    "invalid_font_format",
				Message: "the app can only load ttf or otf",
			})
		}
		weight := 400
		if file.Weight != nil {
			weight = *file.Weight
			if weight < 100 || weight > 900 {
				errs = append(errs, FieldError{
					Field:   pathField(path, "weight"),
					Code:    "invalid_range",
					Message: "weight must be 100–900",
				})
			}
		}
		if file.MaxWeight != nil && *file.MaxWeight < weight {
			errs = append(errs, FieldError{
				Field:   pathField(path, "maxWeight"),
				Code:    "invalid_range",
				Message: "maxWeight must be at least weight",
			})
		}
		if file.Style != nil && *file.Style != "" && *file.Style != "normal" && *file.Style != "italic" {
			errs = append(errs, FieldError{
				Field:   pathField(path, "style"),
				Code:    "invalid_enum",
				Message: "style must be normal or italic",
			})
		}
		errs = append(errs, file.Asset.ValidateWithPath(pathField(path, "asset"))...)
	}

	for lang, fontID := range f.FallbackFor {
		if !isValidID(fontID) {
			errs = append(errs, FieldError{
				Field:   fmt.Sprintf("fallbackFor.%s", lang),
				Code:    "invalid_id",
				Message: "fallback font id must be lowercase kebab-case",
			})
		}
	}

	if f.SampleText != nil {
		errs = append(errs, validateLocalized(f.SampleText, "sampleText")...)
	}

	return errs
}

// Validate validates an IconPack document.
func (p *IconPack) Validate() []FieldError {
	var errs []FieldError
	if !isValidID(p.ID) {
		errs = append(errs, FieldError{
			Field:   "id",
			Code:    "invalid_id",
			Message: "icon pack id must be lowercase kebab-case",
		})
	}
	if !isValidID(p.FestivalID) {
		errs = append(errs, FieldError{
			Field:   "festivalId",
			Code:    "invalid_id",
			Message: "festivalId must be lowercase kebab-case",
		})
	}
	errs = append(errs, validateLocalized(p.Name, "name")...)
	errs = append(errs, validateLocalized(p.Style, "style")...)

	if p.Kind != "painted" && p.Kind != "images" {
		errs = append(errs, FieldError{
			Field:   "kind",
			Code:    "invalid_enum",
			Message: "kind must be painted or images",
		})
	}

	if _, ok := iconShapes[p.Shape]; !ok {
		errs = append(errs, FieldError{
			Field:   "shape",
			Code:    "invalid_enum",
			Message: "shape must be squircle, circle, square, or leaf",
		})
	}

	if p.Tile != nil && *p.Tile != "" && !isValidColor(*p.Tile) {
		errs = append(errs, FieldError{
			Field:   "tile",
			Code:    "invalid_color",
			Message: "expected colour in #RRGGBB format",
		})
	}
	if !isValidColor(p.Glyph) {
		errs = append(errs, FieldError{
			Field:   "glyph",
			Code:    "invalid_color",
			Message: "expected colour in #RRGGBB format",
		})
	}
	if !isValidColor(p.Ring) {
		errs = append(errs, FieldError{
			Field:   "ring",
			Code:    "invalid_color",
			Message: "expected colour in #RRGGBB format",
		})
	}

	if p.Kind == "painted" {
		if p.Painter == nil || *p.Painter == "" {
			errs = append(errs, FieldError{
				Field:   "painter",
				Code:    "required",
				Message: "a painted pack names its painter style",
			})
		} else if !IsValidEngine(*p.Painter) {
			errs = append(errs, FieldError{
				Field:   "painter",
				Code:    "invalid_engine",
				Message: fmt.Sprintf("unknown painter engine %q", *p.Painter),
			})
		}
	} else if p.Kind == "images" {
		if p.Background == nil {
			errs = append(errs, FieldError{
				Field:   "background",
				Code:    "required",
				Message: "an image pack needs its background tile",
			})
		} else {
			errs = append(errs, p.Background.ValidateWithPath("background")...)
		}
	}

	if _, ok := isValidTime(p.PublishedAt); !ok {
		errs = append(errs, FieldError{
			Field:   "publishedAt",
			Code:    "invalid_time",
			Message: "publishedAt must be ISO 8601 UTC with Z",
		})
	}

	return errs
}

// Validate validates a Banner document.
func (b *Banner) Validate() []FieldError {
	var errs []FieldError
	if !isValidID(b.ID) {
		errs = append(errs, FieldError{
			Field:   "id",
			Code:    "invalid_id",
			Message: "banner id must be lowercase kebab-case",
		})
	}
	errs = append(errs, validateLocalized(b.Title, "title")...)
	errs = append(errs, validateLocalized(b.Subtitle, "subtitle")...)
	errs = append(errs, validateLocalized(b.Tag, "tag")...)
	errs = append(errs, validateLocalized(b.CTA, "cta")...)

	// Action validation
	if _, ok := bannerActionTypes[b.Action.Type]; !ok {
		errs = append(errs, FieldError{
			Field:   "action.type",
			Code:    "invalid_enum",
			Message: fmt.Sprintf("unknown banner action type %q", b.Action.Type),
		})
	}

	switch b.Action.Type {
	case "festival", "theme":
		if b.Action.ID == nil || *b.Action.ID == "" {
			errs = append(errs, FieldError{
				Field:   "action.id",
				Code:    "required",
				Message: "action id is required",
			})
		} else if !isValidID(*b.Action.ID) {
			errs = append(errs, FieldError{
				Field:   "action.id",
				Code:    "invalid_id",
				Message: "action id must be lowercase kebab-case",
			})
		}
	case "url":
		if b.Action.URL == nil || *b.Action.URL == "" {
			errs = append(errs, FieldError{
				Field:   "action.url",
				Code:    "required",
				Message: "action url is required",
			})
		} else {
			u, err := url.Parse(*b.Action.URL)
			if err != nil || u.Scheme != "https" {
				errs = append(errs, FieldError{
					Field:   "action.url",
					Code:    "invalid_url",
					Message: "action url must be https",
				})
			}
		}
	case "wallpapers", "fonts", "icon-packs":
		if b.Action.ID != nil && *b.Action.ID != "" && !isValidID(*b.Action.ID) {
			errs = append(errs, FieldError{
				Field:   "action.id",
				Code:    "invalid_id",
				Message: "action id must be lowercase kebab-case",
			})
		}
	}

	// Look validation
	for _, k := range []struct {
		name  string
		color string
	}{
		{"background", b.Look.Background},
		{"accent", b.Look.Accent},
		{"titleColor", b.Look.TitleColor},
	} {
		if !isValidColor(k.color) {
			errs = append(errs, FieldError{
				Field:   "look." + k.name,
				Code:    "invalid_color",
				Message: "expected colour in #RRGGBB format",
			})
		}
	}
	if !isValidID(b.Look.Font) {
		errs = append(errs, FieldError{
			Field:   "look.font",
			Code:    "invalid_id",
			Message: "look.font must be lowercase kebab-case",
		})
	}
	if b.Look.ArtThemeID != nil && *b.Look.ArtThemeID != "" && !isValidID(*b.Look.ArtThemeID) {
		errs = append(errs, FieldError{
			Field:   "look.artThemeId",
			Code:    "invalid_id",
			Message: "look.artThemeId must be lowercase kebab-case",
		})
	}

	var startTime, endTime time.Time
	hasStart, hasEnd := false, false
	if b.StartsAt != nil && *b.StartsAt != "" {
		t, ok := isValidTime(*b.StartsAt)
		if !ok {
			errs = append(errs, FieldError{
				Field:   "startsAt",
				Code:    "invalid_time",
				Message: "startsAt must be ISO 8601 UTC with Z",
			})
		} else {
			startTime = t
			hasStart = true
		}
	}
	if b.EndsAt != nil && *b.EndsAt != "" {
		t, ok := isValidTime(*b.EndsAt)
		if !ok {
			errs = append(errs, FieldError{
				Field:   "endsAt",
				Code:    "invalid_time",
				Message: "endsAt must be ISO 8601 UTC with Z",
			})
		} else {
			endTime = t
			hasEnd = true
		}
	}
	if hasStart && hasEnd && !endTime.After(startTime) {
		errs = append(errs, FieldError{
			Field:   "endsAt",
			Code:    "invalid_date_range",
			Message: "endsAt must be after startsAt",
		})
	}

	return errs
}

// Validate is stubbed as TODO-free for phase 2.
func (c *Catalog) Validate() []FieldError {
	return nil
}
