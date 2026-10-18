package generator

import (
	"errors"
	"fmt"
	"math"
	"math/rand/v2"
	"strings"

	"github.com/heinthant/wallp-backend/internal/catalog"
)

// FontInfo represents font metadata from the font library.
type FontInfo struct {
	ID       string   `json:"id"`
	Category string   `json:"category"`
	Tags     []string `json:"tags"`
	Scripts  []string `json:"scripts"`
}

// Input specifies parameters for theme generation.
type Input struct {
	FestivalID   string                `json:"festivalId"`
	FestivalName catalog.Localized     `json:"festivalName"`
	FestivalTags []string              `json:"festivalTags"`
	FestivalLook *catalog.FestivalLook `json:"festivalLook"` // for mood "classic": base hue from look.brand
	Mood         string                `json:"mood"`         // classic|cozy|minimal|cute
	BaseColor    string                `json:"baseColor"`    // "" = pick for me (seeded)
	Engine       string                `json:"engine"`       // halloween|christmas|thingyan|layers ("" = layers)
	Description  string                `json:"description"`
	Seed         int64                 `json:"seed"`
	Around       *catalog.Palette      `json:"around"` // "More like this": small jitter around this palette
	Fonts        []FontInfo            `json:"fonts"`  // library: {ID, Category, Tags, Scripts}
}

// Check represents a single contrast validation check.
type Check struct {
	Name  string  `json:"name"`
	Field string  `json:"field"`
	Ratio float64 `json:"ratio"`
	Min   float64 `json:"min"`
	Pass  bool    `json:"pass"`
}

// Option represents a generated theme option along with its contrast checks and seed.
type Option struct {
	Theme  catalog.ThemeDetail `json:"theme"`
	Checks []Check             `json:"checks"`
	Seed   int64               `json:"seed"`
}

var (
	ErrNoFonts          = errors.New("no_fonts: Import or add fonts first")
	ErrGenerationFailed = errors.New("generation_failed")
	ErrInvalidCount     = errors.New("invalid_count: count must be 1-6")
	ErrInvalidMood      = errors.New("invalid_mood: mood must be classic, cozy, minimal, or cute")
	ErrInvalidEngine    = errors.New("invalid_engine: unknown engine")
)

var moodWordLists = map[string][]string{
	"cozy": {
		"Ember", "Hearth", "Lantern", "Blanket", "Cabin",
		"Cider", "Velvet", "Glow", "Fireside", "Snug",
	},
	"classic": {
		"Tradition", "Heritage", "Festive", "Ceremony", "Tribute",
		"Royal", "Legend", "Legacy", "Spirit", "Crown",
	},
	"minimal": {
		"Essence", "Breeze", "Silent", "Simplicity", "Still",
		"Clarity", "Echo", "Zenith", "Dawn", "Solitude",
	},
	"cute": {
		"Bubbly", "Whimsical", "Sparkle", "Petal", "Twinkle",
		"Peachy", "Darling", "Blossom", "Sprite", "Cotton",
	},
}

func round2(v float64) float64 {
	return math.Round(v*100) / 100
}

func round4(v float64) float64 {
	return math.Round(v*10000) / 10000
}

func hueWord(h float64) string {
	h = NormalizeHue(h)
	switch {
	case h >= 345 || h < 15:
		return "ruby"
	case h < 45:
		return "amber"
	case h < 75:
		return "gold"
	case h < 155:
		return "emerald"
	case h < 195:
		return "teal"
	case h < 255:
		return "sapphire"
	case h < 295:
		return "amethyst"
	case h < 345:
		return "rose"
	default:
		return "amber"
	}
}

func hueDisplayName(h float64) string {
	w := hueWord(h)
	if len(w) > 0 {
		return strings.ToUpper(w[:1]) + w[1:]
	}
	return "Accent"
}

func toKebab(s string) string {
	s = strings.TrimSpace(strings.ToLower(s))
	var b strings.Builder
	for i := 0; i < len(s); i++ {
		c := s[i]
		if (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9') {
			b.WriteByte(c)
		} else if c == '-' || c == '_' || c == ' ' {
			if b.Len() > 0 && b.String()[b.Len()-1] != '-' {
				b.WriteByte('-')
			}
		}
	}
	res := strings.Trim(b.String(), "-")
	if res == "" {
		return "theme"
	}
	return res
}

func toTitleKebab(s string) string {
	parts := strings.Split(s, "-")
	for i, p := range parts {
		if len(p) > 0 {
			parts[i] = strings.ToUpper(p[:1]) + strings.ToLower(p[1:])
		}
	}
	return strings.Join(parts, " ")
}

func shiftHueTowards(h, target, factor float64) float64 {
	h = NormalizeHue(h)
	target = NormalizeHue(target)
	diff := target - h
	if diff > 180 {
		diff -= 360
	} else if diff < -180 {
		diff += 360
	}
	return NormalizeHue(h + diff*factor)
}

const base36Chars = "0123456789abcdefghijklmnopqrstuvwxyz"

func generateBase36(rng *rand.Rand, length int) string {
	b := make([]byte, length)
	for i := 0; i < length; i++ {
		b[i] = base36Chars[rng.IntN(len(base36Chars))]
	}
	return string(b)
}

func pickBaseHue(in Input, rng *rand.Rand) float64 {
	if in.Around != nil && in.Around.Background != "" {
		lch, err := HexToOKLCH(in.Around.Background)
		if err == nil {
			jitter := (rng.Float64() * 40.0) - 20.0
			return NormalizeHue(lch.H + jitter)
		}
	}

	if in.BaseColor != "" {
		lch, err := HexToOKLCH(in.BaseColor)
		if err == nil {
			h := NormalizeHue(lch.H)
			if in.Mood == "cozy" {
				return shiftHueTowards(h, 50.0, 0.4)
			}
			return h
		}
	}

	if in.Mood == "classic" && in.FestivalLook != nil && in.FestivalLook.Brand != "" {
		lch, err := HexToOKLCH(in.FestivalLook.Brand)
		if err == nil {
			return NormalizeHue(lch.H)
		}
	}

	if in.Mood == "cozy" {
		// warm hues shift toward 30–70°
		return 30.0 + rng.Float64()*40.0
	}

	return rng.Float64() * 360.0
}

func hasAnyTag(tags []string, wanted ...string) bool {
	for _, t := range tags {
		for _, w := range wanted {
			if strings.EqualFold(t, w) {
				return true
			}
		}
	}
	return false
}

func selectFonts(in Input, rng *rand.Rand) (catalog.ThemeFonts, error) {
	if len(in.Fonts) == 0 {
		return catalog.ThemeFonts{}, ErrNoFonts
	}

	var displayCandidates []FontInfo
	switch in.Mood {
	case "cute":
		for _, f := range in.Fonts {
			if f.Category == "display" || f.Category == "handwritten" || hasAnyTag(f.Tags, "rounded", "cute", "handwritten") {
				displayCandidates = append(displayCandidates, f)
			}
		}
	case "minimal":
		for _, f := range in.Fonts {
			if f.Category == "clean" {
				displayCandidates = append(displayCandidates, f)
			}
		}
	case "classic", "cozy":
		for _, f := range in.Fonts {
			if f.Category == "display" {
				displayCandidates = append(displayCandidates, f)
			}
		}
	}
	if len(displayCandidates) == 0 {
		displayCandidates = in.Fonts
	}
	displayFont := displayCandidates[rng.IntN(len(displayCandidates))].ID

	var labelCandidates []FontInfo
	switch in.Mood {
	case "cute":
		for _, f := range in.Fonts {
			if f.Category == "display" || f.Category == "handwritten" || hasAnyTag(f.Tags, "rounded", "cute", "handwritten") {
				labelCandidates = append(labelCandidates, f)
			}
		}
	case "minimal":
		for _, f := range in.Fonts {
			if f.Category == "clean" {
				labelCandidates = append(labelCandidates, f)
			}
		}
	default:
		for _, f := range in.Fonts {
			if f.Category == "display" {
				labelCandidates = append(labelCandidates, f)
			}
		}
	}
	if len(labelCandidates) == 0 {
		labelCandidates = in.Fonts
	}
	labelsFont := labelCandidates[rng.IntN(len(labelCandidates))].ID

	var cleanFonts []FontInfo
	for _, f := range in.Fonts {
		if f.Category == "clean" {
			cleanFonts = append(cleanFonts, f)
		}
	}
	if len(cleanFonts) == 0 {
		cleanFonts = in.Fonts
	}

	var myanmarCleanFonts []FontInfo
	for _, f := range cleanFonts {
		for _, sc := range f.Scripts {
			if strings.EqualFold(sc, "myanmar") {
				myanmarCleanFonts = append(myanmarCleanFonts, f)
				break
			}
		}
	}

	var bodyFont string
	if len(myanmarCleanFonts) > 0 {
		bodyFont = myanmarCleanFonts[rng.IntN(len(myanmarCleanFonts))].ID
	} else {
		bodyFont = cleanFonts[rng.IntN(len(cleanFonts))].ID
	}

	return catalog.ThemeFonts{
		Display: displayFont,
		Body:    bodyFont,
		Labels:  labelsFont,
	}, nil
}

func selectEventIcon(festivalID string, tags []string) string {
	all := append([]string{festivalID}, tags...)
	for _, t := range all {
		low := strings.ToLower(t)
		if strings.Contains(low, "halloween") {
			return "nightlight_round"
		}
		if strings.Contains(low, "christmas") {
			return "ac_unit_rounded"
		}
		if strings.Contains(low, "thingyan") {
			return "water_drop_rounded"
		}
	}
	return "celebration_rounded"
}

func selectParticleEffect(festivalID string, tags []string) string {
	all := append([]string{festivalID}, tags...)
	for _, t := range all {
		low := strings.ToLower(t)
		if strings.Contains(low, "christmas") {
			return "snow"
		}
		if strings.Contains(low, "halloween") {
			return "bats"
		}
		if strings.Contains(low, "thingyan") {
			return "drops"
		}
		if strings.Contains(low, "myanmar") {
			return "lanterns"
		}
	}
	return "stars"
}

func buildScene(engine string, festivalID string, tags []string, rng *rand.Rand) catalog.Scene {
	if engine == "" {
		engine = "layers"
	}

	if engine != "layers" {
		return catalog.Scene{
			Engine: engine,
			Params: catalog.SceneParams{},
		}
	}

	angle180 := 180
	gradientLayer := catalog.Layer{
		Type:   "gradient",
		Colors: []string{"@surface", "@background"},
		Angle:  &angle180,
	}

	x := round4(0.2 + rng.Float64()*0.6)
	y := round4(0.15 + rng.Float64()*0.20)
	w := round4(0.25 + rng.Float64()*0.20)
	shapeCircle := "circle"
	colorMotif := "@motif"
	glow := true
	motionPulse := "pulse"
	motifLayer := catalog.Layer{
		Type:   "shape",
		Shape:  &shapeCircle,
		X:      &x,
		Y:      &y,
		Width:  &w,
		Color:  &colorMotif,
		Glow:   &glow,
		Motion: &motionPulse,
	}

	numHills := 1 + rng.IntN(2)
	shapePolygon := "polygon"
	hillX := 0.5
	hillY := 0.85
	hillW := 1.0
	colorDeep := "@deep"
	colorSurface := "@surface"

	hill1 := catalog.Layer{
		Type:  "shape",
		Shape: &shapePolygon,
		X:     &hillX,
		Y:     &hillY,
		Width: &hillW,
		Color: &colorDeep,
		Points: [][]float64{
			{0.0, 1.0},
			{0.0, 0.45},
			{0.45, 0.15},
			{0.8, 0.35},
			{1.0, 0.55},
			{1.0, 1.0},
		},
	}

	layers := []catalog.Layer{gradientLayer, motifLayer, hill1}

	if numHills == 2 {
		hill2Y := 0.90
		hill2 := catalog.Layer{
			Type:  "shape",
			Shape: &shapePolygon,
			X:     &hillX,
			Y:     &hill2Y,
			Width: &hillW,
			Color: &colorSurface,
			Points: [][]float64{
				{0.0, 1.0},
				{0.0, 0.60},
				{0.3, 0.30},
				{0.65, 0.20},
				{1.0, 0.40},
				{1.0, 1.0},
			},
		}
		layers = append(layers, hill2)
	}

	particleEffect := selectParticleEffect(festivalID, tags)
	count := 30 + rng.IntN(61)
	speed := round4(0.2 + rng.Float64()*0.3)
	opacity := round4(0.6 + rng.Float64()*0.3)
	colorText := "@text"

	particleLayer := catalog.Layer{
		Type:    "particles",
		Effect:  &particleEffect,
		Count:   &count,
		Speed:   &speed,
		Color:   &colorText,
		Opacity: &opacity,
	}

	layers = append(layers, particleLayer)

	return catalog.Scene{
		Engine: "layers",
		Params: catalog.SceneParams{
			Layers: layers,
		},
	}
}

func getMinAppVersion(engine string) *string {
	if engine == "" {
		engine = "layers"
	}
	for _, eng := range catalog.EmbeddedEngines.Engines {
		if eng.ID == engine {
			v := eng.SinceApp
			return &v
		}
	}
	def := "1.0.0"
	return &def
}

func defaultIconPack(festivalID string, tags []string) string {
	all := append([]string{festivalID}, tags...)
	for _, t := range all {
		low := strings.ToLower(t)
		if strings.Contains(low, "halloween") {
			return "spooky-glow"
		}
		if strings.Contains(low, "christmas") {
			return "gold-ornament"
		}
		if strings.Contains(low, "thingyan") {
			return "water-splash"
		}
	}
	return "neon-glow"
}

func generateSingleOption(in Input, rng *rand.Rand, seed int64) (*Option, bool) {
	baseHue := pickBaseHue(in, rng)

	// Base palette values
	var bgL, bgC float64
	var deepL, deepC float64
	var surfaceL, surfaceC float64
	var textL, textC float64
	var mutedL, mutedC float64
	var motifL, motifC float64

	isMinimal := in.Mood == "minimal"
	isCute := in.Mood == "cute"
	isCozy := in.Mood == "cozy"

	bgL = 0.18 + rng.Float64()*(0.24-0.18)
	deepL = 0.12 + rng.Float64()*(0.16-0.12)
	surfaceL = 0.28 + rng.Float64()*(0.34-0.28)
	textL = 0.94 + rng.Float64()*(0.97-0.94)
	mutedL = 0.80 + rng.Float64()*(0.85-0.80)
	motifL = 0.45 + rng.Float64()*(0.60-0.45)

	if isMinimal {
		bgC = 0.01 + rng.Float64()*0.015
		deepC = 0.01 + rng.Float64()*0.015
		surfaceC = 0.015 + rng.Float64()*0.015
		textC = 0.005 + rng.Float64()*0.01
		mutedC = textC
		motifC = 0.02 + rng.Float64()*0.02
	} else {
		bgC = 0.02 + rng.Float64()*0.03
		deepC = 0.02 + rng.Float64()*0.02
		surfaceC = 0.03 + rng.Float64()*0.03
		textC = 0.01 + rng.Float64()*0.01
		mutedC = textC
		motifC = 0.08 + rng.Float64()*0.04
	}

	textHue := NormalizeHue(baseHue + (rng.Float64()*60.0 - 30.0))

	bgOK := OKLCH{L: bgL, C: bgC, H: baseHue}
	deepOK := OKLCH{L: deepL, C: deepC, H: baseHue}
	surfaceOK := OKLCH{L: surfaceL, C: surfaceC, H: baseHue}
	textOK := OKLCH{L: textL, C: textC, H: textHue}
	mutedOK := OKLCH{L: mutedL, C: mutedC, H: textHue}
	motifOK := OKLCH{L: motifL, C: motifC, H: baseHue}

	// Accents
	compHue := NormalizeHue(baseHue + 180.0)
	anaHue := NormalizeHue(baseHue + 35.0)

	var solidAccentsOK []OKLCH
	if isMinimal {
		solidAccentsOK = []OKLCH{
			{
				L: 0.70 + rng.Float64()*(0.82-0.70),
				C: 0.03 + rng.Float64()*0.03,
				H: baseHue,
			},
		}
	} else {
		var accL, accC float64
		if isCute {
			accL = 0.80 + rng.Float64()*(0.88-0.80)
			accC = 0.16 + rng.Float64()*0.05
		} else if isCozy {
			accL = 0.70 + rng.Float64()*(0.80-0.70)
			accC = 0.09 + rng.Float64()*0.04
		} else {
			accL = 0.70 + rng.Float64()*(0.82-0.70)
			accC = 0.16 + rng.Float64()*0.05
		}

		solidAccentsOK = []OKLCH{
			{L: accL, C: accC, H: baseHue},
			{L: accL, C: accC, H: compHue},
			{L: accL, C: accC, H: anaHue},
		}
	}

	angles := []int{90, 135, 180}
	gradAngle := angles[rng.IntN(len(angles))]

	// Nudge loop (max 40 steps)
	var finalPalette catalog.Palette
	var finalAccents []catalog.Accent
	var finalChecks []Check
	success := false

	for step := 0; step <= 40; step++ {
		bgHex := OKLCHToHex(bgOK)
		textHex := OKLCHToHex(textOK)
		mutedHex := OKLCHToHex(mutedOK)
		labelsHex := textHex

		ratioText, errText := ContrastRatio(textHex, bgHex)
		ratioMuted, errMuted := ContrastRatio(mutedHex, bgHex)
		ratioLabels, errLabels := ContrastRatio(labelsHex, bgHex)
		if errText != nil || errMuted != nil || errLabels != nil {
			break
		}

		allAccentsPass := true
		ratioAcc := make([]float64, len(solidAccentsOK))
		for ai, acc := range solidAccentsOK {
			accHex := OKLCHToHex(acc)
			r, err := ContrastRatio(accHex, bgHex)
			if err != nil {
				allAccentsPass = false
				break
			}
			ratioAcc[ai] = r
			if r < 3.0 {
				allAccentsPass = false
			}
		}

		ratioGrad := make([]float64, 2)
		if !isMinimal && len(solidAccentsOK) >= 2 {
			r0, err0 := ContrastRatio(OKLCHToHex(solidAccentsOK[0]), bgHex)
			r1, err1 := ContrastRatio(OKLCHToHex(solidAccentsOK[1]), bgHex)
			if err0 != nil || err1 != nil {
				allAccentsPass = false
			} else {
				ratioGrad[0] = r0
				ratioGrad[1] = r1
				if r0 < 3.0 || r1 < 3.0 {
					allAccentsPass = false
				}
			}
		}

		if ratioText >= 4.5 && ratioMuted >= 4.5 && ratioLabels >= 4.5 && allAccentsPass {
			motifHex := OKLCHToHex(motifOK)
			deepHex := OKLCHToHex(deepOK)
			surfaceHex := OKLCHToHex(surfaceOK)

			finalPalette = catalog.Palette{
				Background: bgHex,
				Deep:       deepHex,
				Surface:    surfaceHex,
				Text:       textHex,
				TextMuted:  mutedHex,
				Motif:      &motifHex,
			}

			finalChecks = []Check{
				{
					Name:  "Text contrast",
					Field: "palette.text",
					Ratio: round2(ratioText),
					Min:   4.5,
					Pass:  true,
				},
				{
					Name:  "Muted text contrast",
					Field: "palette.textMuted",
					Ratio: round2(ratioMuted),
					Min:   4.5,
					Pass:  true,
				},
				{
					Name:  "Labels contrast",
					Field: "labels.color",
					Ratio: round2(ratioLabels),
					Min:   4.5,
					Pass:  true,
				},
			}

			if isMinimal {
				accID := fmt.Sprintf("accent-%s", hueWord(solidAccentsOK[0].H))
				accName := catalog.Localized{"en": fmt.Sprintf("%s Accent", hueDisplayName(solidAccentsOK[0].H))}
				finalAccents = []catalog.Accent{
					{
						ID:     accID,
						Name:   accName,
						Type:   "solid",
						Colors: []string{OKLCHToHex(solidAccentsOK[0])},
					},
				}
				finalChecks = append(finalChecks, Check{
					Name:  "Accent 1 contrast",
					Field: "accents[0].colors[0]",
					Ratio: round2(ratioAcc[0]),
					Min:   3.0,
					Pass:  true,
				})
			} else {
				a1ID := fmt.Sprintf("primary-%s", hueWord(solidAccentsOK[0].H))
				a2ID := fmt.Sprintf("complement-%s", hueWord(solidAccentsOK[1].H))
				a3ID := fmt.Sprintf("analogous-%s", hueWord(solidAccentsOK[2].H))
				gradID := fmt.Sprintf("gradient-%s-%s", hueWord(solidAccentsOK[0].H), hueWord(solidAccentsOK[1].H))

				finalAccents = []catalog.Accent{
					{
						ID:     a1ID,
						Name:   catalog.Localized{"en": fmt.Sprintf("%s Accent", hueDisplayName(solidAccentsOK[0].H))},
						Type:   "solid",
						Colors: []string{OKLCHToHex(solidAccentsOK[0])},
					},
					{
						ID:     a2ID,
						Name:   catalog.Localized{"en": fmt.Sprintf("%s Complement", hueDisplayName(solidAccentsOK[1].H))},
						Type:   "solid",
						Colors: []string{OKLCHToHex(solidAccentsOK[1])},
					},
					{
						ID:     a3ID,
						Name:   catalog.Localized{"en": fmt.Sprintf("%s Analogous", hueDisplayName(solidAccentsOK[2].H))},
						Type:   "solid",
						Colors: []string{OKLCHToHex(solidAccentsOK[2])},
					},
					{
						ID:     gradID,
						Name:   catalog.Localized{"en": fmt.Sprintf("%s %s Glow", hueDisplayName(solidAccentsOK[0].H), hueDisplayName(solidAccentsOK[1].H))},
						Type:   "gradient",
						Colors: []string{OKLCHToHex(solidAccentsOK[0]), OKLCHToHex(solidAccentsOK[1])},
						Angle:  &gradAngle,
					},
				}

				for ai := range solidAccentsOK {
					finalChecks = append(finalChecks, Check{
						Name:  fmt.Sprintf("Accent %d contrast", ai+1),
						Field: fmt.Sprintf("accents[%d].colors[0]", ai),
						Ratio: round2(ratioAcc[ai]),
						Min:   3.0,
						Pass:  true,
					})
				}
				finalChecks = append(finalChecks,
					Check{
						Name:  "Gradient stop 1 contrast",
						Field: fmt.Sprintf("accents[%d].colors[0]", len(solidAccentsOK)),
						Ratio: round2(ratioGrad[0]),
						Min:   3.0,
						Pass:  true,
					},
					Check{
						Name:  "Gradient stop 2 contrast",
						Field: fmt.Sprintf("accents[%d].colors[1]", len(solidAccentsOK)),
						Ratio: round2(ratioGrad[1]),
						Min:   3.0,
						Pass:  true,
					},
				)
			}

			success = true
			break
		}

		if step == 40 {
			break
		}

		// Nudge step: lower background L or raise text/accent L
		if bgOK.L > 0.05 {
			bgOK.L = math.Max(0.04, bgOK.L-0.01)
			if deepOK.L >= bgOK.L {
				deepOK.L = math.Max(0.02, bgOK.L-0.03)
			}
		}
		if ratioText < 4.5 && textOK.L < 0.99 {
			textOK.L = math.Min(0.99, textOK.L+0.01)
		}
		if ratioMuted < 4.5 && mutedOK.L < 0.98 {
			mutedOK.L = math.Min(0.98, mutedOK.L+0.01)
		}
		for ai := range solidAccentsOK {
			if ratioAcc[ai] < 3.0 && solidAccentsOK[ai].L < 0.96 {
				solidAccentsOK[ai].L = math.Min(0.96, solidAccentsOK[ai].L+0.01)
			}
		}
	}

	if !success {
		return nil, false
	}

	themeFonts, err := selectFonts(in, rng)
	if err != nil {
		return nil, false
	}

	words := moodWordLists[in.Mood]
	if len(words) == 0 {
		words = moodWordLists["classic"]
	}
	moodWord := words[rng.IntN(len(words))]
	suffix := generateBase36(rng, 4)
	themeID := fmt.Sprintf("%s-%s-%s", in.FestivalID, strings.ToLower(moodWord), suffix)

	festivalName := in.FestivalName["en"]
	if strings.TrimSpace(festivalName) == "" {
		festivalName = toTitleKebab(in.FestivalID)
	}
	nameEn := fmt.Sprintf("%s %s", festivalName, moodWord)

	hWord := hueWord(baseHue)
	tagSet := make(map[string]struct{})
	var tags []string
	for _, t := range in.FestivalTags {
		low := strings.ToLower(strings.TrimSpace(t))
		if low != "" {
			if _, seen := tagSet[low]; !seen {
				tagSet[low] = struct{}{}
				tags = append(tags, low)
			}
		}
	}
	if _, seen := tagSet[in.Mood]; !seen {
		tagSet[in.Mood] = struct{}{}
		tags = append(tags, in.Mood)
	}
	if _, seen := tagSet[hWord]; !seen {
		tagSet[hWord] = struct{}{}
		tags = append(tags, hWord)
	}

	eventIcon := selectEventIcon(in.FestivalID, in.FestivalTags)
	minAppVersion := getMinAppVersion(in.Engine)
	scene := buildScene(in.Engine, in.FestivalID, in.FestivalTags, rng)

	theme := catalog.ThemeDetail{
		ID:            themeID,
		Rev:           1, // catalog.ThemeDetail.Validate requires rev >= 1
		FestivalID:    in.FestivalID,
		Name:          catalog.Localized{"en": nameEn},
		Style:         in.Mood,
		Tags:          tags,
		PublishedAt:   "2026-01-01T00:00:00Z",
		MinAppVersion: minAppVersion,
		Scene:         scene,
		Palette:       finalPalette,
		Accents:       finalAccents,
		Fonts:         themeFonts,
		Clock: catalog.Clock{
			UseAccent: !isMinimal,
		},
		Labels: &catalog.Labels{
			Color: &finalPalette.Text,
		},
		EventIcon:  &eventIcon,
		IconPackID: defaultIconPack(in.FestivalID, in.FestivalTags),
	}

	if errs := theme.Validate(); len(errs) > 0 {
		return nil, false
	}

	return &Option{
		Theme:  theme,
		Checks: finalChecks,
		Seed:   seed,
	}, true
}

// Generate generates 1-6 theme options matching the input specification.
func Generate(in Input, count int) ([]Option, error) {
	if count < 1 || count > 6 {
		return nil, ErrInvalidCount
	}
	if len(in.Fonts) == 0 {
		return nil, ErrNoFonts
	}

	if in.Mood == "" {
		in.Mood = "classic"
	}
	switch in.Mood {
	case "classic", "cozy", "minimal", "cute":
	default:
		return nil, ErrInvalidMood
	}

	if in.Engine == "" {
		in.Engine = "layers"
	}
	if !catalog.IsValidEngine(in.Engine) {
		return nil, ErrInvalidEngine
	}

	if strings.TrimSpace(in.FestivalID) == "" {
		in.FestivalID = "theme"
	} else {
		in.FestivalID = toKebab(in.FestivalID)
	}

	options := make([]Option, 0, count)
	for i := 0; i < count; i++ {
		subSeed := in.Seed + int64(i)
		var chosen *Option

		for k := 0; k < 10; k++ {
			trySeed := subSeed + int64(1000*k)
			pcg := rand.NewPCG(uint64(trySeed), uint64(trySeed)*6364136223846793005+1442695040888963407)
			rng := rand.New(pcg)

			opt, ok := generateSingleOption(in, rng, trySeed)
			if ok {
				chosen = opt
				break
			}
		}

		if chosen == nil {
			return nil, ErrGenerationFailed
		}
		options = append(options, *chosen)
	}

	return options, nil
}
