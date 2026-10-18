package generator

import (
	"math"
	"math/rand/v2"
	"testing"
)

func TestOKLCHKnownRed(t *testing.T) {
	lch, err := HexToOKLCH("#FF0000")
	if err != nil {
		t.Fatalf("HexToOKLCH(#FF0000) error = %v", err)
	}

	// Spec: known value #FF0000 ≈ L 0.628, C 0.258, H 29.2
	if math.Abs(lch.L-0.628) > 0.005 {
		t.Errorf("expected L ≈ 0.628, got %f (diff %f)", lch.L, math.Abs(lch.L-0.628))
	}
	if math.Abs(lch.C-0.258) > 0.005 {
		t.Errorf("expected C ≈ 0.258, got %f (diff %f)", lch.C, math.Abs(lch.C-0.258))
	}
	if math.Abs(lch.H-29.2) > 0.5 {
		t.Errorf("expected H ≈ 29.2, got %f (diff %f)", lch.H, math.Abs(lch.H-29.2))
	}
}

func TestOKLCHRoundTrip20RandomColours(t *testing.T) {
	rng := rand.New(rand.NewPCG(42, 100))
	const tolerance = 1.0 / 255.0

	for i := 0; i < 20; i++ {
		orig := RGB{
			R: float64(rng.IntN(256)) / 255.0,
			G: float64(rng.IntN(256)) / 255.0,
			B: float64(rng.IntN(256)) / 255.0,
		}

		lch := RGBToOKLCH(orig)
		back := OKLCHToRGB(lch)

		diffR := math.Abs(orig.R - back.R)
		diffG := math.Abs(orig.G - back.G)
		diffB := math.Abs(orig.B - back.B)

		if diffR > tolerance || diffG > tolerance || diffB > tolerance {
			t.Errorf("colour %d %v: round-trip exceeded 1/255: diffs (%f, %f, %f)",
				i, orig, diffR, diffG, diffB)
		}
	}
}

func TestClampOKLCHReducesChroma(t *testing.T) {
	// A high-chroma color that falls outside sRGB gamut
	outOfGamut := OKLCH{L: 0.7, C: 0.4, H: 140.0}
	clamped := ClampOKLCH(outOfGamut)

	if clamped.C >= outOfGamut.C {
		t.Errorf("expected chroma to be reduced, got %f >= %f", clamped.C, outOfGamut.C)
	}
	if math.Abs(clamped.L-outOfGamut.L) > 1e-4 {
		t.Errorf("expected lightness preserved, got %f != %f", clamped.L, outOfGamut.L)
	}

	rgb := OKLCHToRGB(clamped)
	if rgb.R < 0 || rgb.R > 1 || rgb.G < 0 || rgb.G > 1 || rgb.B < 0 || rgb.B > 1 {
		t.Errorf("clamped color still outside sRGB: %v", rgb)
	}
}
