package generator

import (
	"fmt"
	"math"
	"math/rand/v2"

	"github.com/heinthant/wallp-backend/internal/catalog"
)

// blendRole picks between A, B, or their OKLCH midpoint, and applies mutation jitter (+-8 deg hue, +-0.03 L).
func blendRole(hexA, hexB string, rng *rand.Rand) OKLCH {
	lchA, errA := HexToOKLCH(hexA)
	lchB, errB := HexToOKLCH(hexB)

	var chosen OKLCH
	if errA != nil && errB != nil {
		chosen = OKLCH{L: 0.5, C: 0.1, H: 180.0}
	} else if errA != nil {
		chosen = lchB
	} else if errB != nil {
		chosen = lchA
	} else {
		choice := rng.IntN(3)
		switch choice {
		case 0:
			chosen = lchA
		case 1:
			chosen = lchB
		default:
			// OKLCH midpoint
			midL := (lchA.L + lchB.L) / 2.0
			midC := (lchA.C + lchB.C) / 2.0
			diff := lchB.H - lchA.H
			if diff > 180.0 {
				diff -= 360.0
			} else if diff < -180.0 {
				diff += 360.0
			}
			midH := NormalizeHue(lchA.H + diff/2.0)
			chosen = OKLCH{L: midL, C: midC, H: midH}
		}
	}

	// Mutation: +-8 deg hue, +-0.03 L
	deltaH := (rng.Float64() * 16.0) - 8.0
	deltaL := (rng.Float64() * 0.06) - 0.03
	chosen.L = math.Max(0.04, math.Min(0.99, chosen.L+deltaL))
	chosen.H = NormalizeHue(chosen.H + deltaH)

	return chosen
}

// Breed creates child theme options by breeding parent themes A and B.
// For each child:
// - Per palette role: pick A, B, or OKLCH midpoint seeded, with mutation (+-8 deg hue, +-0.03 L).
// - Accents: union trimmed to 3 solid + 1 gradient, with mutation.
// - Scene: inherited from one parent.
// - All children pass contrast nudging and error-level checks.
func Breed(a, b catalog.ThemeDetail, seed int64, fonts []FontInfo, count int) []Option {
	if count <= 0 {
		count = 6
	}

	options := make([]Option, 0, count)

	for i := 0; i < count; i++ {
		childSeed := seed + int64(i)*10007 + 1
		cRng := rand.New(rand.NewPCG(uint64(childSeed), uint64(childSeed^0x5DEECE66D+1)))

		// 1. Palette roles
		bgOK := blendRole(a.Palette.Background, b.Palette.Background, cRng)
		deepOK := blendRole(a.Palette.Deep, b.Palette.Deep, cRng)
		surfaceOK := blendRole(a.Palette.Surface, b.Palette.Surface, cRng)
		textOK := blendRole(a.Palette.Text, b.Palette.Text, cRng)
		mutedOK := blendRole(a.Palette.TextMuted, b.Palette.TextMuted, cRng)

		var motifA, motifB string
		if a.Palette.Motif != nil && *a.Palette.Motif != "" {
			motifA = *a.Palette.Motif
		} else {
			motifA = a.Palette.Surface
		}
		if b.Palette.Motif != nil && *b.Palette.Motif != "" {
			motifB = *b.Palette.Motif
		} else {
			motifB = b.Palette.Surface
		}
		motifOK := blendRole(motifA, motifB, cRng)

		// 2. Accents union trimmed
		var solidCandidates []string
		for _, acc := range a.Accents {
			if acc.Type == "solid" && len(acc.Colors) > 0 && acc.Colors[0] != "" {
				solidCandidates = append(solidCandidates, acc.Colors[0])
			}
		}
		for _, acc := range b.Accents {
			if acc.Type == "solid" && len(acc.Colors) > 0 && acc.Colors[0] != "" {
				solidCandidates = append(solidCandidates, acc.Colors[0])
			}
		}

		if len(solidCandidates) == 0 {
			solidCandidates = []string{"#E06050", "#50B0E0", "#E0B050"}
		}

		// Trim to up to 3 solid accents
		if len(solidCandidates) > 3 {
			solidCandidates = solidCandidates[:3]
		}

		var solidAccentsOK []OKLCH
		for _, sHex := range solidCandidates {
			lch, err := HexToOKLCH(sHex)
			if err != nil {
				lch = OKLCH{L: 0.75, C: 0.16, H: bgOK.H}
			}
			// Mutation: +-8 deg hue, +-0.03 L
			deltaH := (cRng.Float64() * 16.0) - 8.0
			deltaL := (cRng.Float64() * 0.06) - 0.03
			lch.L = math.Max(0.04, math.Min(0.99, lch.L+deltaL))
			lch.H = NormalizeHue(lch.H + deltaH)
			solidAccentsOK = append(solidAccentsOK, lch)
		}

		// Ensure background is sufficiently dark for dark-mode contrast
		if bgOK.L > 0.22 {
			bgOK.L = 0.20
		}
		if deepOK.L >= bgOK.L {
			deepOK.L = math.Max(0.04, bgOK.L-0.03)
		}

		// 3. Contrast nudging loop (up to 40 steps)
		for step := 0; step < 40; step++ {
			bgHex := OKLCHToHex(bgOK)
			textHex := OKLCHToHex(textOK)
			mutedHex := OKLCHToHex(mutedOK)

			ratioText, _ := ContrastRatio(textHex, bgHex)
			ratioMuted, _ := ContrastRatio(mutedHex, bgHex)

			allAccentsPass := true
			for _, acc := range solidAccentsOK {
				r, _ := ContrastRatio(OKLCHToHex(acc), bgHex)
				if r < 3.0 {
					allAccentsPass = false
					break
				}
			}

			if ratioText >= 4.5 && ratioMuted >= 4.5 && allAccentsPass {
				break
			}

			// Nudge
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
				r, _ := ContrastRatio(OKLCHToHex(solidAccentsOK[ai]), bgHex)
				if r < 3.0 && solidAccentsOK[ai].L < 0.96 {
					solidAccentsOK[ai].L = math.Min(0.96, solidAccentsOK[ai].L+0.01)
				}
			}
		}

		bgHex := OKLCHToHex(bgOK)
		deepHex := OKLCHToHex(deepOK)
		surfaceHex := OKLCHToHex(surfaceOK)
		textHex := OKLCHToHex(textOK)
		mutedHex := OKLCHToHex(mutedOK)
		motifHex := OKLCHToHex(motifOK)

		finalPalette := catalog.Palette{
			Background: bgHex,
			Deep:       deepHex,
			Surface:    surfaceHex,
			Text:       textHex,
			TextMuted:  mutedHex,
			Motif:      &motifHex,
		}

		// Accents: solid + 1 gradient
		var finalAccents []catalog.Accent
		for ai, acc := range solidAccentsOK {
			accHex := OKLCHToHex(acc)
			accID := fmt.Sprintf("accent-%d-%s", ai+1, hueWord(acc.H))
			finalAccents = append(finalAccents, catalog.Accent{
				ID:     accID,
				Name:   catalog.Localized{"en": fmt.Sprintf("%s Accent", hueDisplayName(acc.H))},
				Type:   "solid",
				Colors: []string{accHex},
			})
		}
		if len(solidAccentsOK) >= 2 {
			gradAngle := 135
			gradID := fmt.Sprintf("gradient-%s-%s", hueWord(solidAccentsOK[0].H), hueWord(solidAccentsOK[1].H))
			finalAccents = append(finalAccents, catalog.Accent{
				ID:     gradID,
				Name:   catalog.Localized{"en": fmt.Sprintf("%s %s Glow", hueDisplayName(solidAccentsOK[0].H), hueDisplayName(solidAccentsOK[1].H))},
				Type:   "gradient",
				Colors: []string{OKLCHToHex(solidAccentsOK[0]), OKLCHToHex(solidAccentsOK[1])},
				Angle:  &gradAngle,
			})
		}

		// Contrast checks
		ratioText, _ := ContrastRatio(textHex, bgHex)
		ratioMuted, _ := ContrastRatio(mutedHex, bgHex)
		checks := []Check{
			{
				Name:  "Text contrast",
				Field: "palette.text",
				Ratio: round2(ratioText),
				Min:   4.5,
				Pass:  ratioText >= 4.5,
				Level: "error",
			},
			{
				Name:  "Muted text contrast",
				Field: "palette.textMuted",
				Ratio: round2(ratioMuted),
				Min:   4.5,
				Pass:  ratioMuted >= 4.5,
				Level: "error",
			},
			{
				Name:  "Labels contrast",
				Field: "labels.color",
				Ratio: round2(ratioText),
				Min:   4.5,
				Pass:  ratioText >= 4.5,
				Level: "error",
			},
		}

		for ai, acc := range solidAccentsOK {
			r, _ := ContrastRatio(OKLCHToHex(acc), bgHex)
			checks = append(checks, Check{
				Name:  fmt.Sprintf("Accent %d contrast", ai+1),
				Field: fmt.Sprintf("accents[%d].colors[0]", ai),
				Ratio: round2(r),
				Min:   3.0,
				Pass:  r >= 3.0,
				Level: "error",
			})
		}

		// 4. Scene from one parent
		var scene catalog.Scene
		if cRng.IntN(2) == 0 {
			if len(a.Scene.Params.Layers) > 0 || a.Scene.Engine != "" {
				scene = a.Scene
			} else {
				scene = b.Scene
			}
		} else {
			if len(b.Scene.Params.Layers) > 0 || b.Scene.Engine != "" {
				scene = b.Scene
			} else {
				scene = a.Scene
			}
		}

		checks = append(checks, CheckSceneCost(scene, 200))
		checks = append(checks, CheckCVDAccents(finalAccents)...)

		// 5. Fonts
		var themeFonts catalog.ThemeFonts
		if cRng.IntN(2) == 0 && a.Fonts.Display != "" {
			themeFonts = a.Fonts
		} else if b.Fonts.Display != "" {
			themeFonts = b.Fonts
		} else if len(fonts) > 0 {
			dummyIn := Input{Mood: "classic", Fonts: fonts}
			themeFonts, _ = selectFonts(dummyIn, cRng)
		}

		// Metadata
		festID := a.FestivalID
		if festID == "" {
			festID = b.FestivalID
		}
		if festID == "" {
			festID = "default"
		}

		style := a.Style
		if style == "" {
			style = b.Style
		}
		if style == "" {
			style = "classic"
		}

		iconPackID := a.IconPackID
		if iconPackID == "" {
			iconPackID = b.IconPackID
		}
		if iconPackID == "" {
			iconPackID = defaultIconPack(festID, a.Tags)
		}

		eventIcon := a.EventIcon
		if eventIcon == nil {
			eventIcon = b.EventIcon
		}

		suffix := generateBase36(cRng, 4)
		themeID := fmt.Sprintf("breed-%s-%s-%s", a.ID, b.ID, suffix)
		nameEn := fmt.Sprintf("%s x %s", a.Name["en"], b.Name["en"])
		if a.Name["en"] == "" || b.Name["en"] == "" {
			nameEn = fmt.Sprintf("Bred Theme %s", suffix)
		}

		minAppVersion := a.MinAppVersion
		if minAppVersion == nil {
			minAppVersion = b.MinAppVersion
		}
		if minAppVersion == nil {
			def := "1.0.0"
			minAppVersion = &def
		}

		theme := catalog.ThemeDetail{
			ID:            themeID,
			Rev:           1,
			FestivalID:    festID,
			Name:          catalog.Localized{"en": nameEn},
			Style:         style,
			Tags:          append([]string{"breed"}, a.Tags...),
			PublishedAt:   "2026-01-01T00:00:00Z",
			MinAppVersion: minAppVersion,
			Scene:         scene,
			Palette:       finalPalette,
			Accents:       finalAccents,
			Fonts:         themeFonts,
			Clock:         a.Clock,
			Labels: &catalog.Labels{
				Color: &finalPalette.Text,
			},
			EventIcon:  eventIcon,
			IconPackID: iconPackID,
		}

		options = append(options, Option{
			Theme:  theme,
			Checks: checks,
			Seed:   childSeed,
		})
	}

	return options
}
