package generator

import (
	"math"
	"testing"
)

func TestContrastKnownPairs(t *testing.T) {
	// Spec: #000/#FFF = 21
	ratio0, err := ContrastRatio("#000", "#FFF")
	if err != nil {
		t.Fatalf("ContrastRatio(#000, #FFF) err: %v", err)
	}
	if math.Abs(ratio0-21.0) > 0.01 {
		t.Errorf("expected #000/#FFF = 21.0, got %f", ratio0)
	}

	ratio0Hex6, err := ContrastRatio("#000000", "#FFFFFF")
	if err != nil {
		t.Fatalf("ContrastRatio(#000000, #FFFFFF) err: %v", err)
	}
	if math.Abs(ratio0Hex6-21.0) > 0.01 {
		t.Errorf("expected #000000/#FFFFFF = 21.0, got %f", ratio0Hex6)
	}

	// Spec: #777/#FFF ≈ 4.48
	ratio7, err := ContrastRatio("#777", "#FFF")
	if err != nil {
		t.Fatalf("ContrastRatio(#777, #FFF) err: %v", err)
	}
	if math.Abs(ratio7-4.48) > 0.05 {
		t.Errorf("expected #777/#FFF ≈ 4.48, got %f", ratio7)
	}

	ratio7Hex6, err := ContrastRatio("#777777", "#FFFFFF")
	if err != nil {
		t.Fatalf("ContrastRatio(#777777, #FFFFFF) err: %v", err)
	}
	if math.Abs(ratio7Hex6-4.48) > 0.05 {
		t.Errorf("expected #777777/#FFFFFF ≈ 4.48, got %f", ratio7Hex6)
	}
}
