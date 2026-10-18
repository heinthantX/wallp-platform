package generator

import (
	"encoding/json"
	"reflect"
	"testing"

	"github.com/heinthant/wallp-backend/internal/catalog"
)

func strPtr(s string) *string {
	return &s
}

func floatPtr(f float64) *float64 {
	return &f
}

func mockParentThemes() (catalog.ThemeDetail, catalog.ThemeDetail) {
	motifA := "#FF5500"
	motifB := "#0088FF"
	a := catalog.ThemeDetail{
		ID:         "parent-a",
		Rev:        1,
		FestivalID: "christmas",
		Name:       catalog.Localized{"en": "Parent Christmas"},
		Style:      "cozy",
		Tags:       []string{"christmas", "cozy", "ruby"},
		Palette: catalog.Palette{
			Background: "#1A1520",
			Deep:       "#120E18",
			Surface:    "#2C2436",
			Text:       "#F5F0FA",
			TextMuted:  "#C8BCD4",
			Motif:      &motifA,
		},
		Accents: []catalog.Accent{
			{
				ID:     "accent-1",
				Name:   catalog.Localized{"en": "Orange Accent"},
				Type:   "solid",
				Colors: []string{"#FF5500"},
			},
			{
				ID:     "accent-2",
				Name:   catalog.Localized{"en": "Teal Accent"},
				Type:   "solid",
				Colors: []string{"#20B2AA"},
			},
		},
		Fonts: catalog.ThemeFonts{
			Display: "font-display-a",
			Body:    "font-body-a",
			Labels:  "font-display-a",
		},
		Scene: catalog.Scene{
			Engine: "layers",
			Params: catalog.SceneParams{
				Layers: []catalog.Layer{
					{
						Type:  "shape",
						Shape: strPtr("circle"),
						X:     floatPtr(0.5),
						Y:     floatPtr(0.3),
						Width: floatPtr(0.4),
						Color: strPtr("@motif"),
					},
				},
			},
		},
	}

	b := catalog.ThemeDetail{
		ID:         "parent-b",
		Rev:        1,
		FestivalID: "christmas",
		Name:       catalog.Localized{"en": "Parent Winter"},
		Style:      "minimal",
		Tags:       []string{"christmas", "minimal", "sapphire"},
		Palette: catalog.Palette{
			Background: "#0F1A24",
			Deep:       "#081018",
			Surface:    "#1E2E3E",
			Text:       "#EEF6FC",
			TextMuted:  "#A8C4DC",
			Motif:      &motifB,
		},
		Accents: []catalog.Accent{
			{
				ID:     "accent-b1",
				Name:   catalog.Localized{"en": "Blue Accent"},
				Type:   "solid",
				Colors: []string{"#0088FF"},
			},
			{
				ID:     "accent-b2",
				Name:   catalog.Localized{"en": "Gold Accent"},
				Type:   "solid",
				Colors: []string{"#FFD700"},
			},
		},
		Fonts: catalog.ThemeFonts{
			Display: "font-display-b",
			Body:    "font-body-b",
			Labels:  "font-display-b",
		},
		Scene: catalog.Scene{
			Engine: "layers",
			Params: catalog.SceneParams{
				Layers: []catalog.Layer{
					{
						Type:   "gradient",
						Colors: []string{"@surface", "@background"},
					},
				},
			},
		},
	}

	return a, b
}

func TestBreed_Deterministic(t *testing.T) {
	a, b := mockParentThemes()
	seed := int64(123456789)

	opts1 := Breed(a, b, seed, nil, 6)
	opts2 := Breed(a, b, seed, nil, 6)

	if len(opts1) != 6 {
		t.Fatalf("expected 6 options, got %d", len(opts1))
	}
	if len(opts2) != 6 {
		t.Fatalf("expected 6 options, got %d", len(opts2))
	}

	b1, err := json.Marshal(opts1)
	if err != nil {
		t.Fatalf("marshal opts1 failed: %v", err)
	}
	b2, err := json.Marshal(opts2)
	if err != nil {
		t.Fatalf("marshal opts2 failed: %v", err)
	}

	if !reflect.DeepEqual(b1, b2) {
		t.Fatalf("Breed was not deterministic for identical seed %d", seed)
	}
}

func TestBreed_AllChildrenPassChecks(t *testing.T) {
	a, b := mockParentThemes()
	opts := Breed(a, b, 98765, nil, 6)

	if len(opts) != 6 {
		t.Fatalf("expected 6 options, got %d", len(opts))
	}

	for i, opt := range opts {
		// 1. ThemeDetail.Validate must pass
		errs := opt.Theme.Validate()
		if len(errs) > 0 {
			t.Fatalf("child option %d failed theme validation: %v", i, errs)
		}

		// 2. All error-level checks must pass
		for _, chk := range opt.Checks {
			if chk.Level == "error" && !chk.Pass {
				t.Fatalf("child option %d failed error-level check %s (%s): ratio=%f, min=%f",
					i, chk.Name, chk.Field, chk.Ratio, chk.Min)
			}
		}
	}
}
