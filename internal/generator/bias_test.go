package generator

import (
	"math/rand/v2"
	"testing"
)

func TestHueBias_WeightsCalculation(t *testing.T) {
	// Bin 0: hue 5 (in [0, 10)) -> 2 accepted, 0 rejected -> score = 2, weight = 1 + 2 = 3.0
	// Bin 1: hue 15 (in [10, 20)) -> 0 accepted, 4 rejected -> score = -2, weight = max(0.2, 1 - 2) = 0.2
	// Other bins: 0 accepted, 0 rejected -> score = 0, weight = 1.0
	feedback := []FeedbackItem{
		{Hue: 5, Action: "accepted"},
		{Hue: 7, Action: "accepted"},
		{Hue: 15, Action: "rejected"},
		{Hue: 16, Action: "rejected"},
		{Hue: 17, Action: "rejected"},
		{Hue: 18, Action: "rejected"},
	}

	bias := NewHueBiasFromFeedback(feedback)
	if bias.Weights[0] != 3.0 {
		t.Errorf("expected bin 0 weight 3.0, got %f", bias.Weights[0])
	}
	if bias.Weights[1] != 0.2 {
		t.Errorf("expected bin 1 weight 0.2 (clamped), got %f", bias.Weights[1])
	}
	if bias.Weights[2] != 1.0 {
		t.Errorf("expected bin 2 weight 1.0, got %f", bias.Weights[2])
	}
}

func TestHueBias_StatisticalShift(t *testing.T) {
	// Favoured 60-degree band: [180, 240) -> Bins 18, 19, 20, 21, 22, 23 (6 bins)
	// Add many accepted feedback items in this band
	var feedback []FeedbackItem
	for i := 0; i < 50; i++ {
		for bin := 18; bin <= 23; bin++ {
			feedback = append(feedback, FeedbackItem{
				Hue:    float64(bin*10) + 5.0,
				Action: "accepted",
			})
		}
	}

	bias := NewHueBiasFromFeedback(feedback)

	// Fixed seed for determinism
	rng := rand.New(rand.NewPCG(42, 99999))

	const totalSamples = 200
	favouredCount := 0

	for i := 0; i < totalSamples; i++ {
		h := bias.Sample(rng)
		if h >= 180.0 && h < 240.0 {
			favouredCount++
		}
	}

	ratio := float64(favouredCount) / float64(totalSamples)
	if ratio < 0.60 {
		t.Fatalf("expected >= 60%% of 200 samples in the favoured [180, 240) band, got %d/%d (%.1f%%)",
			favouredCount, totalSamples, ratio*100)
	}
}
