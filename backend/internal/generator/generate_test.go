package generator

import (
	"bytes"
	"encoding/json"
	"math"
	"testing"

	"github.com/heinthant/wallp-backend/internal/catalog"
)

func testFonts() []FontInfo {
	return []FontInfo{
		{
			ID:       "creepster",
			Category: "display",
			Tags:     []string{"halloween", "spooky"},
			Scripts:  []string{"latin"},
		},
		{
			ID:       "cinzel-decorative",
			Category: "display",
			Tags:     []string{"classic", "festive"},
			Scripts:  []string{"latin"},
		},
		{
			ID:       "space-grotesk",
			Category: "clean",
			Tags:     []string{"modern", "clean"},
			Scripts:  []string{"latin"},
		},
		{
			ID:       "padauk",
			Category: "clean",
			Tags:     []string{"myanmar", "clean"},
			Scripts:  []string{"latin", "myanmar"},
		},
		{
			ID:       "fredoka",
			Category: "handwritten",
			Tags:     []string{"cute", "rounded"},
			Scripts:  []string{"latin"},
		},
	}
}

func baseInput() Input {
	return Input{
		FestivalID:   "christmas",
		FestivalName: catalog.Localized{"en": "Christmas"},
		FestivalTags: []string{"christmas", "winter", "holiday"},
		FestivalLook: &catalog.FestivalLook{
			Brand:       "#D42426",
			Background:  "#0F172A",
			Surface:     "#1E293B",
			Surface2:    "#334155",
			Outline:     "#475569",
			Nav:         "#0F172A",
			Muted:       "#94A3B8",
			DisplayFont: "cinzel-decorative",
		},
		Mood:   "cozy",
		Engine: "christmas",
		Seed:   12345,
		Fonts:  testFonts(),
	}
}

func TestGenerateDeterminismByteIdenticalJSON(t *testing.T) {
	in := baseInput()

	opt1, err := Generate(in, 6)
	if err != nil {
		t.Fatalf("first Generate failed: %v", err)
	}

	opt2, err := Generate(in, 6)
	if err != nil {
		t.Fatalf("second Generate failed: %v", err)
	}

	json1, err := json.Marshal(opt1)
	if err != nil {
		t.Fatalf("marshal opt1 failed: %v", err)
	}

	json2, err := json.Marshal(opt2)
	if err != nil {
		t.Fatalf("marshal opt2 failed: %v", err)
	}

	if !bytes.Equal(json1, json2) {
		t.Fatalf("expected byte-identical JSON for same Input + Seed, but outputs differed")
	}
}

func TestGenerateSeedsDiffer(t *testing.T) {
	in1 := baseInput()
	in1.Seed = 1000

	in2 := baseInput()
	in2.Seed = 9999

	opt1, err := Generate(in1, 6)
	if err != nil {
		t.Fatalf("Generate in1 failed: %v", err)
	}

	opt2, err := Generate(in2, 6)
	if err != nil {
		t.Fatalf("Generate in2 failed: %v", err)
	}

	json1, _ := json.Marshal(opt1)
	json2, _ := json.Marshal(opt2)

	if bytes.Equal(json1, json2) {
		t.Fatalf("expected different outputs for different seeds, but they were identical")
	}

	// Verify each option within opt1 has a distinct seed
	seenSeeds := make(map[int64]bool)
	for i, opt := range opt1 {
		if seenSeeds[opt.Seed] {
			t.Errorf("option %d has duplicate seed %d", i, opt.Seed)
		}
		seenSeeds[opt.Seed] = true
	}
}

func TestGenerate6Options4Moods4Engines(t *testing.T) {
	moods := []string{"classic", "cozy", "minimal", "cute"}
	engines := []string{"halloween", "christmas", "thingyan", "layers"}

	for _, mood := range moods {
		for _, eng := range engines {
			t.Run(mood+"_"+eng, func(t *testing.T) {
				in := baseInput()
				in.Mood = mood
				in.Engine = eng
				in.Seed = int64(len(mood)*1000 + len(eng))

				options, err := Generate(in, 6)
				if err != nil {
					t.Fatalf("Generate(%s, %s) failed: %v", mood, eng, err)
				}
				if len(options) != 6 {
					t.Fatalf("expected 6 options, got %d", len(options))
				}

				for optIdx, opt := range options {
					// 1. Checks pass
					if len(opt.Checks) == 0 {
						t.Errorf("opt %d has empty Checks list", optIdx)
					}
					for _, chk := range opt.Checks {
						if !chk.Pass {
							t.Errorf("opt %d check %s failed: ratio %f < min %f", optIdx, chk.Name, chk.Ratio, chk.Min)
						}
						if chk.Ratio < chk.Min {
							t.Errorf("opt %d check %s ratio %f < min %f", optIdx, chk.Name, chk.Ratio, chk.Min)
						}
					}

					// 2. ThemeDetail.Validate has zero errors
					errs := opt.Theme.Validate()
					if len(errs) > 0 {
						t.Errorf("opt %d ThemeDetail.Validate() returned errors: %v", optIdx, errs)
					}
				}
			})
		}
	}
}

func TestGenerateMinimalHasExactly1Accent(t *testing.T) {
	in := baseInput()
	in.Mood = "minimal"
	in.Seed = 42

	options, err := Generate(in, 6)
	if err != nil {
		t.Fatalf("Generate minimal failed: %v", err)
	}

	for i, opt := range options {
		if len(opt.Theme.Accents) != 1 {
			t.Errorf("option %d: expected exactly 1 accent for minimal, got %d", i, len(opt.Theme.Accents))
		}
		if opt.Theme.Accents[0].Type != "solid" {
			t.Errorf("option %d: expected solid accent, got %s", i, opt.Theme.Accents[0].Type)
		}
		if opt.Theme.Clock.UseAccent {
			t.Errorf("option %d: expected Clock.UseAccent == false for minimal", i)
		}
	}
}

func TestGenerateAroundKeepsHueWithin20Degrees(t *testing.T) {
	// A reference palette with a known background hue
	around := &catalog.Palette{
		Background: "#1B2A4A", // Dark blue
		Deep:       "#0D1525",
		Surface:    "#2E4374",
		Text:       "#F0F4F8",
		TextMuted:  "#9BAECE",
	}

	refLCH, err := HexToOKLCH(around.Background)
	if err != nil {
		t.Fatalf("HexToOKLCH failed: %v", err)
	}

	in := baseInput()
	in.Around = around
	in.Seed = 777

	options, err := Generate(in, 6)
	if err != nil {
		t.Fatalf("Generate with Around failed: %v", err)
	}

	for i, opt := range options {
		bgLCH, err := HexToOKLCH(opt.Theme.Palette.Background)
		if err != nil {
			t.Errorf("option %d: HexToOKLCH background failed: %v", i, err)
			continue
		}

		diff := math.Abs(bgLCH.H - refLCH.H)
		if diff > 180 {
			diff = 360 - diff
		}

		if diff > 20.01 {
			t.Errorf("option %d: background hue %f deviated %f degrees from ref hue %f (max 20°)",
				i, bgLCH.H, diff, refLCH.H)
		}
	}
}

func TestGenerateNoFontsError(t *testing.T) {
	in := baseInput()
	in.Fonts = nil

	_, err := Generate(in, 6)
	if err == nil {
		t.Fatalf("expected error for empty fonts library, got nil")
	}
	if err.Error() != ErrNoFonts.Error() {
		t.Errorf("expected %v, got %v", ErrNoFonts, err)
	}
}
