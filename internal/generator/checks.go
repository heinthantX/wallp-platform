package generator

import (
	"fmt"
	"math"

	"github.com/heinthant/wallp-backend/internal/catalog"
)

// ExistingTheme represents an existing theme for near-duplicate checking.
type ExistingTheme struct {
	ID      string           `json:"id"`
	Palette catalog.Palette  `json:"palette"`
	Accents []catalog.Accent `json:"accents,omitempty"`
}

// OKLabDistance calculates Euclidean distance between two OKLab colors.
func OKLabDistance(c1, c2 OKLab) float64 {
	dl := c1.L - c2.L
	da := c1.A - c2.A
	db := c1.B - c2.B
	return math.Sqrt(dl*dl + da*da + db*db)
}

// HexToOKLab converts a hex color to OKLab.
func HexToOKLab(hex string) (OKLab, error) {
	rgb, err := HexToRGB(hex)
	if err != nil {
		return OKLab{}, err
	}
	linR := sRGBToLinear(clamp01(rgb.R))
	linG := sRGBToLinear(clamp01(rgb.G))
	linB := sRGBToLinear(clamp01(rgb.B))
	return LinearToOKLab(linR, linG, linB), nil
}

// PaletteDistance computes the mean OKLab distance across background, surface, text, motif, and first accent.
func PaletteDistance(p1, p2 catalog.Palette, a1, a2 []catalog.Accent) float64 {
	roles := 0
	totalDist := 0.0

	// 1. Background
	if lab1, err1 := HexToOKLab(p1.Background); err1 == nil {
		if lab2, err2 := HexToOKLab(p2.Background); err2 == nil {
			totalDist += OKLabDistance(lab1, lab2)
			roles++
		}
	}

	// 2. Surface
	if lab1, err1 := HexToOKLab(p1.Surface); err1 == nil {
		if lab2, err2 := HexToOKLab(p2.Surface); err2 == nil {
			totalDist += OKLabDistance(lab1, lab2)
			roles++
		}
	}

	// 3. Text
	if lab1, err1 := HexToOKLab(p1.Text); err1 == nil {
		if lab2, err2 := HexToOKLab(p2.Text); err2 == nil {
			totalDist += OKLabDistance(lab1, lab2)
			roles++
		}
	}

	// 4. Motif
	m1 := p1.Surface
	if p1.Motif != nil && *p1.Motif != "" {
		m1 = *p1.Motif
	}
	m2 := p2.Surface
	if p2.Motif != nil && *p2.Motif != "" {
		m2 = *p2.Motif
	}
	if lab1, err1 := HexToOKLab(m1); err1 == nil {
		if lab2, err2 := HexToOKLab(m2); err2 == nil {
			totalDist += OKLabDistance(lab1, lab2)
			roles++
		}
	}

	// 5. First accent
	firstHex1 := ""
	for _, acc := range a1 {
		if len(acc.Colors) > 0 && acc.Colors[0] != "" {
			firstHex1 = acc.Colors[0]
			break
		}
	}
	firstHex2 := ""
	for _, acc := range a2 {
		if len(acc.Colors) > 0 && acc.Colors[0] != "" {
			firstHex2 = acc.Colors[0]
			break
		}
	}
	if firstHex1 != "" && firstHex2 != "" {
		if lab1, err1 := HexToOKLab(firstHex1); err1 == nil {
			if lab2, err2 := HexToOKLab(firstHex2); err2 == nil {
				totalDist += OKLabDistance(lab1, lab2)
				roles++
			}
		}
	}

	if roles == 0 {
		return 1.0
	}
	return totalDist / float64(roles)
}

// SimulateProtanopia transforms linear RGB using Viénot 1999 protanopia matrix and converts to OKLab.
func SimulateProtanopia(hex string) (OKLab, error) {
	rgb, err := HexToRGB(hex)
	if err != nil {
		return OKLab{}, err
	}
	linR := sRGBToLinear(clamp01(rgb.R))
	linG := sRGBToLinear(clamp01(rgb.G))
	linB := sRGBToLinear(clamp01(rgb.B))

	rSim := 0.56667*linR + 0.43333*linG
	gSim := 0.55833*linR + 0.44167*linG
	bSim := 0.24167*linG + 0.75833*linB

	return LinearToOKLab(rSim, gSim, bSim), nil
}

// SimulateDeuteranopia transforms linear RGB using Viénot 1999 deuteranopia matrix and converts to OKLab.
func SimulateDeuteranopia(hex string) (OKLab, error) {
	rgb, err := HexToRGB(hex)
	if err != nil {
		return OKLab{}, err
	}
	linR := sRGBToLinear(clamp01(rgb.R))
	linG := sRGBToLinear(clamp01(rgb.G))
	linB := sRGBToLinear(clamp01(rgb.B))

	rSim := 0.62500*linR + 0.37500*linG
	gSim := 0.70000*linR + 0.30000*linG
	bSim := 0.30000*linG + 0.70000*linB

	return LinearToOKLab(rSim, gSim, bSim), nil
}

// CheckCVDAccents tests whether any pair of solid accents collapses under protanopia or deuteranopia simulation.
func CheckCVDAccents(accents []catalog.Accent) []Check {
	var solidHexes []string
	var solidIndices []int
	for i, acc := range accents {
		if acc.Type == "solid" && len(acc.Colors) > 0 && acc.Colors[0] != "" {
			solidHexes = append(solidHexes, acc.Colors[0])
			solidIndices = append(solidIndices, i)
		}
	}

	var checks []Check
	for i := 0; i < len(solidHexes); i++ {
		for j := i + 1; j < len(solidHexes); j++ {
			// Protanopia
			pLab1, errP1 := SimulateProtanopia(solidHexes[i])
			pLab2, errP2 := SimulateProtanopia(solidHexes[j])

			// Deuteranopia
			dLab1, errD1 := SimulateDeuteranopia(solidHexes[i])
			dLab2, errD2 := SimulateDeuteranopia(solidHexes[j])

			if errP1 == nil && errP2 == nil && errD1 == nil && errD2 == nil {
				distP := OKLabDistance(pLab1, pLab2)
				distD := OKLabDistance(dLab1, dLab2)
				minDist := math.Min(distP, distD)

				if minDist < 0.06 {
					checks = append(checks, Check{
						Name:  "cvd_accents_close",
						Field: fmt.Sprintf("accents[%d],accents[%d]", solidIndices[i], solidIndices[j]),
						Ratio: round4(minDist),
						Min:   0.06,
						Pass:  true,
						Level: "warning",
					})
				}
			}
		}
	}
	return checks
}

// CalculateSceneCost computes particle counts + 20*glow shapes + 5*layers.
func CalculateSceneCost(scene catalog.Scene) int {
	layers := scene.Params.Layers
	cost := 5 * len(layers)
	for _, l := range layers {
		if l.Type == "particles" && l.Count != nil {
			cost += *l.Count
		}
		if l.Type == "shape" && l.Glow != nil && *l.Glow {
			cost += 20
		}
	}
	return cost
}

// CheckSceneCost evaluates if scene cost is within budget.
func CheckSceneCost(scene catalog.Scene, budget int) Check {
	if budget <= 0 {
		budget = 200
	}
	cost := CalculateSceneCost(scene)
	pass := cost <= budget
	level := "warning"
	if !pass {
		level = "error"
	}
	return Check{
		Name:  "scene_cost",
		Field: "scene",
		Ratio: float64(cost),
		Min:   float64(budget),
		Pass:  pass,
		Level: level,
	}
}
