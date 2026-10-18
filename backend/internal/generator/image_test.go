package generator

import (
	"bytes"
	"image"
	"image/color"
	"image/png"
	"testing"
)

func TestSwatches_TwoColorPNG(t *testing.T) {
	// Create a 10x10 image with left half #FF0000 (Red) and right half #0000FF (Blue)
	img := image.NewRGBA(image.Rect(0, 0, 10, 10))
	red := color.RGBA{R: 255, G: 0, B: 0, A: 255}
	blue := color.RGBA{R: 0, G: 0, B: 255, A: 255}

	for y := 0; y < 10; y++ {
		for x := 0; x < 5; x++ {
			img.Set(x, y, red)
		}
		for x := 5; x < 10; x++ {
			img.Set(x, y, blue)
		}
	}

	var buf bytes.Buffer
	if err := png.Encode(&buf, img); err != nil {
		t.Fatalf("png encode failed: %v", err)
	}

	decoded, err := png.Decode(&buf)
	if err != nil {
		t.Fatalf("png decode failed: %v", err)
	}

	swatches := Swatches(decoded, 8)
	if len(swatches) < 2 {
		t.Fatalf("expected at least 2 swatches, got %d", len(swatches))
	}

	// Verify top 2 swatches are red and blue
	hex1 := swatches[0].Hex
	hex2 := swatches[1].Hex

	isRedAndBlue := (hex1 == "#FF0000" && hex2 == "#0000FF") || (hex1 == "#0000FF" && hex2 == "#FF0000")
	if !isRedAndBlue {
		t.Fatalf("expected top 2 swatches to be #FF0000 and #0000FF, got %s and %s", hex1, hex2)
	}

	// Share should be approximately 0.5 each
	if swatches[0].Share < 0.45 || swatches[0].Share > 0.55 {
		t.Errorf("expected share ~0.5, got %f", swatches[0].Share)
	}
	if swatches[1].Share < 0.45 || swatches[1].Share > 0.55 {
		t.Errorf("expected share ~0.5, got %f", swatches[1].Share)
	}
}

func TestRolesFromSwatches(t *testing.T) {
	swatches := []Swatch{
		{Hex: "#101018", Share: 0.50}, // dark blue-gray (darkest high-share)
		{Hex: "#2E3440", Share: 0.25}, // mid gray
		{Hex: "#FF5500", Share: 0.15}, // bright orange (most chromatic)
		{Hex: "#50B0E0", Share: 0.10}, // light cyan accent
	}

	baseColor, locked := RolesFromSwatches(swatches)
	if baseColor != "#FF5500" {
		t.Errorf("expected baseColor to be #FF5500 (most chromatic), got %s", baseColor)
	}
	if locked == nil {
		t.Fatalf("expected locked not to be nil")
	}
	if locked.Background == nil || *locked.Background == "" {
		t.Errorf("expected locked.Background to be set")
	}
	if locked.Deep == nil || *locked.Deep == "" {
		t.Errorf("expected locked.Deep to be set")
	}
	if locked.Surface == nil || *locked.Surface == "" {
		t.Errorf("expected locked.Surface to be set")
	}
	if locked.Motif == nil || *locked.Motif == "" {
		t.Errorf("expected locked.Motif to be set")
	}
	if len(locked.Accents) == 0 {
		t.Errorf("expected locked.Accents to be non-empty")
	}
}
