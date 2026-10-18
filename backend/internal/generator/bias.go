package generator

import (
	"math"
	"math/rand/v2"
)

// FeedbackItem represents a recorded feedback row for bias computation.
type FeedbackItem struct {
	Hue    float64 `json:"hue"`
	Action string  `json:"action"`
}

// HueBias represents a 36-bin histogram (10 degrees each) of hue weights.
type HueBias struct {
	Weights [36]float64 `json:"weights"`
}

// NewHueBias creates a HueBias with explicit weights.
func NewHueBias(weights [36]float64) *HueBias {
	return &HueBias{Weights: weights}
}

// NewHueBiasFromFeedback constructs a HueBias from feedback items.
// Score per bin = accepted - 0.5*rejected.
// Weight = max(0.2, 1.0 + score) (Laplace smoothing).
func NewHueBiasFromFeedback(items []FeedbackItem) *HueBias {
	var accepted [36]int
	var rejected [36]int

	for _, item := range items {
		h := NormalizeHue(item.Hue)
		bin := int(math.Floor(h / 10.0))
		if bin < 0 {
			bin = 0
		} else if bin >= 36 {
			bin = 35
		}

		switch item.Action {
		case "accepted":
			accepted[bin]++
		case "rejected":
			rejected[bin]++
		}
	}

	var weights [36]float64
	for i := 0; i < 36; i++ {
		score := float64(accepted[i]) - 0.5*float64(rejected[i])
		weights[i] = math.Max(0.2, 1.0+score)
	}

	return &HueBias{Weights: weights}
}

// Sample samples a hue angle in [0, 360) according to the 36-bin weights.
func (b *HueBias) Sample(rng *rand.Rand) float64 {
	total := 0.0
	for _, w := range b.Weights {
		total += w
	}
	if total <= 0 {
		return rng.Float64() * 360.0
	}

	r := rng.Float64() * total
	selectedBin := 35
	for i, w := range b.Weights {
		r -= w
		if r <= 0 {
			selectedBin = i
			break
		}
	}

	offset := rng.Float64() * 10.0
	return NormalizeHue(float64(selectedBin)*10.0 + offset)
}

// SampleRange samples a hue angle in [from, to] (supporting wrap-around) according to the bin weights.
func (b *HueBias) SampleRange(hr [2]float64, rng *rand.Rand) float64 {
	return b.SampleRanges([][2]float64{hr}, rng)
}

// SampleRanges samples a hue angle across the given ranges according to the bin weights.
func (b *HueBias) SampleRanges(ranges [][2]float64, rng *rand.Rand) float64 {
	if len(ranges) == 0 {
		return b.Sample(rng)
	}

	type slice struct {
		from, to float64
		weight   float64
	}

	var slices []slice
	totalWeight := 0.0

	for i := 0; i < 36; i++ {
		binStart := float64(i) * 10.0
		binEnd := float64(i+1) * 10.0
		binWeight := b.Weights[i]

		for _, hr := range ranges {
			from := NormalizeHue(hr[0])
			to := NormalizeHue(hr[1])

			var rIntervals [][2]float64
			if from <= to {
				rIntervals = [][2]float64{{from, to}}
			} else {
				rIntervals = [][2]float64{{from, 360.0}, {0.0, to}}
			}

			for _, inter := range rIntervals {
				overlapStart := math.Max(binStart, inter[0])
				overlapEnd := math.Min(binEnd, inter[1])
				if overlapEnd > overlapStart {
					overlapLen := overlapEnd - overlapStart
					sw := binWeight * (overlapLen / 10.0)
					slices = append(slices, slice{
						from:   overlapStart,
						to:     overlapEnd,
						weight: sw,
					})
					totalWeight += sw
				}
			}
		}
	}

	if totalWeight <= 0 || len(slices) == 0 {
		return SampleHueRange(ranges[0], rng.Float64())
	}

	r := rng.Float64() * totalWeight
	sel := slices[len(slices)-1]
	for _, s := range slices {
		r -= s.weight
		if r <= 0 {
			sel = s
			break
		}
	}

	span := sel.to - sel.from
	return NormalizeHue(sel.from + rng.Float64()*span)
}
