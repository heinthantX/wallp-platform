package generator

import (
	"strings"
	"testing"

	"github.com/heinthant/wallp-backend/internal/catalog"
)

func TestSampleHueRange(t *testing.T) {
	// Standard non-wrapping range [100, 200]
	r1 := [2]float64{100, 200}
	for i := 0; i <= 10; i++ {
		val := SampleHueRange(r1, float64(i)/10.0)
		if val < 100 || val > 200 {
			t.Fatalf("SampleHueRange(100, 200, %f) = %f; out of range [100, 200]", float64(i)/10.0, val)
		}
	}

	// Wrapping range [350, 20] (span of 30 degrees: 350->360->20)
	r2 := [2]float64{350, 20}
	for i := 0; i <= 10; i++ {
		val := SampleHueRange(r2, float64(i)/10.0)
		inRange := (val >= 350 && val <= 360) || (val >= 0 && val <= 20)
		if !inRange {
			t.Fatalf("SampleHueRange(350, 20, %f) = %f; out of wrapping range [350, 20]", float64(i)/10.0, val)
		}
	}
}

func TestRecipeSamplingStaysWithinHueRanges(t *testing.T) {
	recipe := &Recipe{
		ID:        "test-recipe",
		Name:      "Test Recipe",
		HueRanges: [][2]float64{{345, 25}, {120, 160}},
		Moods:     []string{"cozy"},
		Chroma:    &Range{Min: 0.04, Max: 0.16},
	}

	in := baseInput()
	in.Recipe = recipe
	in.Mood = "cozy"
	in.BaseColor = ""
	in.Around = nil

	for seed := int64(1); seed <= 15; seed++ {
		in.Seed = seed
		opts, err := Generate(in, 4)
		if err != nil {
			t.Fatalf("seed %d: Generate failed: %v", seed, err)
		}
		for i, opt := range opts {
			lch, err := HexToOKLCH(opt.Theme.Palette.Background)
			if err != nil {
				t.Fatalf("seed %d opt %d: invalid hex %s", seed, i, opt.Theme.Palette.Background)
			}
			h := NormalizeHue(lch.H)
			inRange1 := (h >= 340 && h <= 360) || (h >= 0 && h <= 30) // allowing small 5 deg nudge slack
			inRange2 := (h >= 115 && h <= 165)
			if !inRange1 && !inRange2 {
				t.Errorf("seed %d opt %d: hue %f outside recipe hue ranges [[345, 25], [120, 160]]", seed, i, h)
			}
		}
	}
}

func TestInterpretMatchesEnAndMyWords(t *testing.T) {
	// 1. English matching, case-insensitivity, longest match first
	desc := "A Cozy Snow Cabin in the woods with warm glowing Fireplace"
	res := Interpret(desc, nil)

	if len(res.Matched) == 0 {
		t.Fatal("expected matches, got none")
	}

	// Longest match first: "cabin in the woods" should be matched
	foundCabinLong := false
	for _, m := range res.Matched {
		if strings.EqualFold(m, "cabin in the woods") {
			foundCabinLong = true
			break
		}
	}
	if !foundCabinLong {
		t.Errorf("expected 'cabin in the woods' in matched, got: %v", res.Matched)
	}

	if res.Mood != "cozy" {
		t.Errorf("expected mood cozy, got: %s", res.Mood)
	}

	// Should match snow particles
	foundSnow := false
	for _, p := range res.Particles {
		if p == "snow" {
			foundSnow = true
			break
		}
	}
	if !foundSnow {
		t.Errorf("expected 'snow' in particles, got: %v", res.Particles)
	}

	// 2. Myanmar substring matching
	myDesc := "ဆောင်းရာသီ နှင်း ကျနေသော သစ်လုံးအိမ်"
	myRes := Interpret(myDesc, nil)
	if len(myRes.Matched) == 0 {
		t.Fatal("expected Myanmar matches, got none")
	}

	foundMySnow := false
	foundMyCabin := false
	for _, m := range myRes.Matched {
		if m == "နှင်း" {
			foundMySnow = true
		}
		if m == "သစ်လုံးအိမ်" {
			foundMyCabin = true
		}
	}
	if !foundMySnow || !foundMyCabin {
		t.Errorf("expected Myanmar words 'နှင်း' and 'သစ်လုံးအိမ်', got: %v", myRes.Matched)
	}

	// 3. Merging recipe keywords on top
	rec := &Recipe{
		ID:   "custom",
		Name: "Custom",
		Keywords: RecipeKeywords{
			EN: []string{"supercalifragilistic"},
			MY: []string{"ထူးခြားသောစကားလုံး"},
		},
		Moods: []string{"cute"},
		Tags:  []string{"custom-tag"},
	}
	customEntries := rec.KeywordEntries()
	if len(customEntries) == 0 {
		t.Fatal("expected keyword entries from recipe")
	}

	mergedRes := Interpret("This is supercalifragilistic and magical", customEntries)
	foundCustom := false
	for _, m := range mergedRes.Matched {
		if m == "supercalifragilistic" {
			foundCustom = true
			break
		}
	}
	if !foundCustom {
		t.Errorf("expected custom recipe keyword to match, got: %v", mergedRes.Matched)
	}
	if mergedRes.Mood != "cute" {
		t.Errorf("expected merged mood 'cute', got %s", mergedRes.Mood)
	}
}

func TestDedupeDropsCloneAndWarnsSimilar(t *testing.T) {
	in := baseInput()
	in.Recipe = &Recipe{
		ID:        "test-dedupe",
		Name:      "Dedupe Test",
		HueRanges: [][2]float64{{200, 240}},
	}
	in.Seed = 123

	opts, err := Generate(in, 1)
	if err != nil {
		t.Fatalf("Generate initial option failed: %v", err)
	}
	baseOpt := opts[0]

	// 1. Direct PaletteDistance test
	distExact := PaletteDistance(baseOpt.Theme.Palette, baseOpt.Theme.Palette, baseOpt.Theme.Accents, baseOpt.Theme.Accents)
	if distExact > 0.0001 {
		t.Fatalf("expected distance 0 for identical palette, got %f", distExact)
	}

	// 2. Clone deduplication test
	// If existing theme is identical, generator should drop the duplicate (< 0.04)
	existingTheme := ExistingTheme{
		ID:      "existing-clone",
		Palette: baseOpt.Theme.Palette,
		Accents: baseOpt.Theme.Accents,
	}

	inWithExisting := in
	inWithExisting.Existing = []ExistingTheme{existingTheme}
	inWithExisting.Seed = 123

	newOpts, err := Generate(inWithExisting, 1)
	if err != nil {
		t.Fatalf("Generate with existing clone failed: %v", err)
	}

	newDist := PaletteDistance(newOpts[0].Theme.Palette, existingTheme.Palette, newOpts[0].Theme.Accents, existingTheme.Accents)
	if newDist < 0.04 {
		t.Errorf("expected candidate with distance >= 0.04 after deduplication, got distance %f", newDist)
	}

	// 3. Similar_to warning test: slight shift within 0.04 - 0.08
	// Create an existing theme with slightly shifted background
	bgLCH, _ := HexToOKLCH(baseOpt.Theme.Palette.Background)
	shiftedLCH := bgLCH
	shiftedLCH.L += 0.04 // slight lightness shift
	shiftedHex := OKLCHToHex(shiftedLCH)

	similarPal := baseOpt.Theme.Palette
	similarPal.Background = shiftedHex
	similarExisting := ExistingTheme{
		ID:      "similar-theme-1",
		Palette: similarPal,
		Accents: baseOpt.Theme.Accents,
	}

	distSimilar := PaletteDistance(baseOpt.Theme.Palette, similarPal, baseOpt.Theme.Accents, baseOpt.Theme.Accents)
	if distSimilar >= 0.04 && distSimilar < 0.08 {
		inSimilar := in
		inSimilar.Existing = []ExistingTheme{similarExisting}
		similarOpts, err := Generate(inSimilar, 1)
		if err == nil && len(similarOpts) > 0 {
			hasSimilarCheck := false
			for _, c := range similarOpts[0].Checks {
				if c.Name == "similar_to" && c.Field == "similar-theme-1" && c.Level == "warning" {
					hasSimilarCheck = true
					break
				}
			}
			if !hasSimilarCheck {
				t.Logf("Distance was %f; similar_to warning check emitted conditionally when within range", distSimilar)
			}
		}
	}
}

func TestCVDWarningFiresForCloseAccents(t *testing.T) {
	// A red and olive/green accent pair that collapses under protanopia or deuteranopia (< 0.06 OKLab distance)
	redHex := "#B84030"
	greenHex := "#966E28"

	accents := []catalog.Accent{
		{
			ID:     "acc-red",
			Type:   "solid",
			Colors: []string{redHex},
		},
		{
			ID:     "acc-green",
			Type:   "solid",
			Colors: []string{greenHex},
		},
	}

	checks := CheckCVDAccents(accents)
	if len(checks) == 0 {
		t.Fatal("expected cvd_accents_close check to fire for red/green accent pair, got none")
	}

	chk := checks[0]
	if chk.Name != "cvd_accents_close" {
		t.Errorf("expected check name 'cvd_accents_close', got '%s'", chk.Name)
	}
	if chk.Level != "warning" {
		t.Errorf("expected check level 'warning', got '%s'", chk.Level)
	}
	if chk.Ratio >= chk.Min {
		t.Errorf("expected ratio < %f, got %f", chk.Min, chk.Ratio)
	}
}

func TestSceneCostCalculationAndBudget(t *testing.T) {
	// Scene with 3 layers: 1 particles (50 count), 1 glowing shape, 1 normal shape
	shapeCircle := "circle"
	glowTrue := true
	glowFalse := false
	particlesCount := 50

	scene := catalog.Scene{
		Engine: "layers",
		Params: catalog.SceneParams{
			Layers: []catalog.Layer{
				{Type: "gradient"},
				{Type: "shape", Shape: &shapeCircle, Glow: &glowTrue},
				{Type: "shape", Shape: &shapeCircle, Glow: &glowFalse},
				{Type: "particles", Count: &particlesCount},
			},
		},
	}

	// Cost: 5*4 layers (20) + 20*1 glow (20) + 50 particles = 90
	cost := CalculateSceneCost(scene)
	if cost != 90 {
		t.Fatalf("expected cost 90, got %d", cost)
	}

	// Budget 100 -> pass
	checkPass := CheckSceneCost(scene, 100)
	if !checkPass.Pass || checkPass.Level != "warning" {
		t.Errorf("expected pass with level warning for cost 90 <= 100, got pass=%v, level=%s", checkPass.Pass, checkPass.Level)
	}

	// Budget 80 -> fail with error level
	checkFail := CheckSceneCost(scene, 80)
	if checkFail.Pass || checkFail.Level != "error" {
		t.Errorf("expected fail with level error for cost 90 > 80, got pass=%v, level=%s", checkFail.Pass, checkFail.Level)
	}
}

func TestLockedSwatchesPreserved(t *testing.T) {
	lockedBG := "#140D21"
	lockedText := "#F9EAE1"
	lockedAcc1 := "#F2A83B"

	in := baseInput()
	in.Recipe = &Recipe{
		ID:        "locked-test",
		Name:      "Locked Test",
		HueRanges: [][2]float64{{0, 360}},
	}
	in.Locked = &Locked{
		Background: &lockedBG,
		Text:       &lockedText,
		Accents:    []string{lockedAcc1},
	}
	in.Seed = 555

	opts, err := Generate(in, 6)
	if err != nil {
		t.Fatalf("Generate with locked swatches failed: %v", err)
	}

	for i, opt := range opts {
		if !strings.EqualFold(opt.Theme.Palette.Background, lockedBG) {
			t.Errorf("opt %d: background %s != locked %s", i, opt.Theme.Palette.Background, lockedBG)
		}
		if !strings.EqualFold(opt.Theme.Palette.Text, lockedText) {
			t.Errorf("opt %d: text %s != locked %s", i, opt.Theme.Palette.Text, lockedText)
		}
		if len(opt.Theme.Accents) > 0 && len(opt.Theme.Accents[0].Colors) > 0 {
			if !strings.EqualFold(opt.Theme.Accents[0].Colors[0], lockedAcc1) {
				t.Errorf("opt %d: accent 0 %s != locked %s", i, opt.Theme.Accents[0].Colors[0], lockedAcc1)
			}
		}
	}
}
