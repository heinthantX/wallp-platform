package generator

import (
	"fmt"
	"regexp"
	"strings"

	"github.com/heinthant/wallp-backend/internal/catalog"
)

var kebabRegex = regexp.MustCompile(`^[a-z0-9]+(-[a-z0-9]+)*$`)

// Range represents a min/max float range.
type Range struct {
	Min float64 `json:"min"`
	Max float64 `json:"max"`
}

// SampleHueRange samples a hue angle in degrees from [from, to], supporting wrap-around across 360.
func SampleHueRange(hr [2]float64, rngFloat float64) float64 {
	from := NormalizeHue(hr[0])
	to := NormalizeHue(hr[1])
	var span float64
	if from <= to {
		span = to - from
	} else {
		span = (360.0 - from) + to
	}
	return NormalizeHue(from + rngFloat*span)
}

// MotifSpec describes a motif layer shape and properties.
type MotifSpec struct {
	Shape      string      `json:"shape"`            // circle|ellipse|polygon
	Preset     string      `json:"preset,omitempty"` // moon|sun|tree|pagoda|star|heart|lantern|hill
	Points     [][]float64 `json:"points,omitempty"`
	WidthRange *[2]float64 `json:"widthRange,omitempty"` // [min, max]
	YRange     *[2]float64 `json:"yRange,omitempty"`     // [min, max]
	Glow       *bool       `json:"glow,omitempty"`
	Motion     string      `json:"motion,omitempty"`
}

// ParticleSpec describes particle effect properties.
type ParticleSpec struct {
	Effect       string      `json:"effect"`
	CountRange   *[2]int     `json:"countRange,omitempty"`
	SpeedRange   *[2]float64 `json:"speedRange,omitempty"`
	SizeRange    *[2]float64 `json:"sizeRange,omitempty"`
	OpacityRange *[2]float64 `json:"opacityRange,omitempty"`
}

// FontTagsSpec configures preferred font tags for font selection.
type FontTagsSpec struct {
	Display []string `json:"display,omitempty"`
	Body    []string `json:"body,omitempty"`
	Labels  []string `json:"labels,omitempty"`
}

// LocalizedWords provides English and Myanmar word lists for naming.
type LocalizedWords struct {
	EN []string `json:"en,omitempty"`
	MY []string `json:"my,omitempty"`
}

// RecipeKeywords provides English and Myanmar keywords for the recipe.
type RecipeKeywords struct {
	EN []string `json:"en,omitempty"`
	MY []string `json:"my,omitempty"`
}

// Recipe defines configuration-driven generator rules.
type Recipe struct {
	ID              string          `json:"id"`
	Name            string          `json:"name"`
	FestivalIDs     []string        `json:"festivalIds,omitempty"`
	Tags            []string        `json:"tags,omitempty"`
	Moods           []string        `json:"moods,omitempty"`
	HueRanges       [][2]float64    `json:"hueRanges,omitempty"`
	Chroma          *Range          `json:"chroma,omitempty"`
	AccentHues      string          `json:"accentHues,omitempty"` // complementary|analogous|triad|recipe
	AccentHueRanges [][2]float64    `json:"accentHueRanges,omitempty"`
	Motifs          []MotifSpec     `json:"motifs,omitempty"`
	Particles       []ParticleSpec  `json:"particles,omitempty"`
	LayerTemplates  []catalog.Layer `json:"layerTemplates,omitempty"`
	FontTags        FontTagsSpec    `json:"fontTags,omitempty"`
	EventIcon       string          `json:"eventIcon,omitempty"`
	NameWords       LocalizedWords  `json:"nameWords,omitempty"`
	Keywords        RecipeKeywords  `json:"keywords,omitempty"`
	CostBudget      int             `json:"costBudget,omitempty"`
}

// Locked holds color swatches that must be kept exactly during generation.
type Locked struct {
	Background *string  `json:"background,omitempty"`
	Deep       *string  `json:"deep,omitempty"`
	Surface    *string  `json:"surface,omitempty"`
	Text       *string  `json:"text,omitempty"`
	TextMuted  *string  `json:"textMuted,omitempty"`
	Motif      *string  `json:"motif,omitempty"`
	Accents    []string `json:"accents,omitempty"`
}

var validAccentHues = map[string]struct{}{
	"complementary": {},
	"analogous":     {},
	"triad":         {},
	"recipe":        {},
}

var validMotifShapes = map[string]struct{}{
	"circle":  {},
	"ellipse": {},
	"polygon": {},
}

var validMotifPresets = map[string]struct{}{
	"moon":    {},
	"sun":     {},
	"tree":    {},
	"pagoda":  {},
	"star":    {},
	"heart":   {},
	"lantern": {},
	"hill":    {},
}

// Validate checks recipe schema constraints and returns field errors.
func (r *Recipe) Validate() []catalog.FieldError {
	var errs []catalog.FieldError

	id := strings.TrimSpace(r.ID)
	if id == "" {
		errs = append(errs, catalog.FieldError{
			Field:   "id",
			Code:    "required",
			Message: "Recipe ID is required",
		})
	} else if !kebabRegex.MatchString(id) {
		errs = append(errs, catalog.FieldError{
			Field:   "id",
			Code:    "format",
			Message: "Recipe ID must be kebab-case (e.g. spooky-nights)",
		})
	}

	if strings.TrimSpace(r.Name) == "" {
		errs = append(errs, catalog.FieldError{
			Field:   "name",
			Code:    "required",
			Message: "Recipe name is required",
		})
	}

	for i, hr := range r.HueRanges {
		if hr[0] < 0 || hr[0] > 360 || hr[1] < 0 || hr[1] > 360 {
			errs = append(errs, catalog.FieldError{
				Field:   fmt.Sprintf("hueRanges[%d]", i),
				Code:    "out_of_range",
				Message: "Hue range values must be between 0 and 360",
			})
		}
	}

	if r.Chroma != nil {
		if r.Chroma.Min < 0 || r.Chroma.Max < r.Chroma.Min {
			errs = append(errs, catalog.FieldError{
				Field:   "chroma",
				Code:    "invalid_range",
				Message: "Chroma min must be >= 0 and max must be >= min",
			})
		}
	}

	if r.AccentHues != "" {
		if _, ok := validAccentHues[r.AccentHues]; !ok {
			errs = append(errs, catalog.FieldError{
				Field:   "accentHues",
				Code:    "invalid_enum",
				Message: "accentHues must be complementary, analogous, triad, or recipe",
			})
		}
	}

	for i, ahr := range r.AccentHueRanges {
		if ahr[0] < 0 || ahr[0] > 360 || ahr[1] < 0 || ahr[1] > 360 {
			errs = append(errs, catalog.FieldError{
				Field:   fmt.Sprintf("accentHueRanges[%d]", i),
				Code:    "out_of_range",
				Message: "Accent hue range values must be between 0 and 360",
			})
		}
	}

	for i, m := range r.Motifs {
		if m.Shape != "" {
			if _, ok := validMotifShapes[m.Shape]; !ok {
				errs = append(errs, catalog.FieldError{
					Field:   fmt.Sprintf("motifs[%d].shape", i),
					Code:    "invalid_enum",
					Message: "motif shape must be circle, ellipse, or polygon",
				})
			}
		}
		if m.Preset != "" {
			if _, ok := validMotifPresets[m.Preset]; !ok {
				errs = append(errs, catalog.FieldError{
					Field:   fmt.Sprintf("motifs[%d].preset", i),
					Code:    "invalid_enum",
					Message: "motif preset must be moon, sun, tree, pagoda, star, heart, lantern, or hill",
				})
			}
		}
	}

	if r.CostBudget < 0 {
		errs = append(errs, catalog.FieldError{
			Field:   "costBudget",
			Code:    "out_of_range",
			Message: "costBudget must be >= 0",
		})
	}

	return errs
}

// KeywordEntries converts recipe keywords to KeywordEntry items for Interpret.
func (r *Recipe) KeywordEntries() []KeywordEntry {
	if r == nil || (len(r.Keywords.EN) == 0 && len(r.Keywords.MY) == 0) {
		return nil
	}
	entry := KeywordEntry{
		Words: WordList{
			EN: r.Keywords.EN,
			MY: r.Keywords.MY,
		},
		Tags: r.Tags,
	}
	if len(r.Moods) == 1 {
		entry.Mood = r.Moods[0]
	}
	if len(r.HueRanges) > 0 {
		hr := r.HueRanges[0]
		entry.HueRange = &hr
	}
	if r.Chroma != nil {
		entry.Chroma = r.Chroma
	}
	if len(r.Particles) > 0 {
		p := r.Particles[0].Effect
		entry.Particles = &p
	}
	if len(r.Motifs) > 0 {
		m := r.Motifs[0].Preset
		if m == "" {
			m = r.Motifs[0].Shape
		}
		entry.Motif = &m
	}
	return []KeywordEntry{entry}
}
