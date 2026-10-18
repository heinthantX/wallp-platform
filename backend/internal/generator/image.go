package generator

import (
	"fmt"
	"image"
	"math"
	"sort"

	"golang.org/x/image/draw"
)

// Swatch represents a quantized palette color and its proportion in the image.
type Swatch struct {
	Hex   string  `json:"hex"`
	Share float64 `json:"share"`
}

type rgbPixel struct {
	r, g, b uint8
}

type colorBox struct {
	pixels []rgbPixel
}

// Swatches extracts up to n dominant colors from an image using median cut.
// It downscales the image to <=128 px on its longest side, runs median cut,
// and returns the swatches sorted by pixel share descending.
func Swatches(img image.Image, n int) []Swatch {
	if img == nil {
		return nil
	}
	if n <= 0 {
		n = 8
	}

	b := img.Bounds()
	w, h := b.Dx(), b.Dy()
	if w <= 0 || h <= 0 {
		return nil
	}

	targetW, targetH := w, h
	if w > 128 || h > 128 {
		if w >= h {
			targetW = 128
			targetH = int(math.Round(float64(h) * 128.0 / float64(w)))
			if targetH < 1 {
				targetH = 1
			}
		} else {
			targetH = 128
			targetW = int(math.Round(float64(w) * 128.0 / float64(h)))
			if targetW < 1 {
				targetW = 1
			}
		}
	}

	dst := image.NewRGBA(image.Rect(0, 0, targetW, targetH))
	draw.BiLinear.Scale(dst, dst.Bounds(), img, b, draw.Over, nil)

	totalPixels := targetW * targetH
	pixels := make([]rgbPixel, 0, totalPixels)
	for y := 0; y < targetH; y++ {
		for x := 0; x < targetW; x++ {
			c := dst.RGBAAt(x, y)
			pixels = append(pixels, rgbPixel{r: c.R, g: c.G, b: c.B})
		}
	}

	if len(pixels) == 0 {
		return nil
	}

	boxes := []colorBox{{pixels: pixels}}

	for len(boxes) < n {
		bestBoxIdx := -1
		maxSpan := -1
		bestChannel := 0 // 0=R, 1=G, 2=B

		for idx, box := range boxes {
			if len(box.pixels) <= 1 {
				continue
			}

			minR, maxR := 255, 0
			minG, maxG := 255, 0
			minB, maxB := 255, 0

			for _, p := range box.pixels {
				if int(p.r) < minR {
					minR = int(p.r)
				}
				if int(p.r) > maxR {
					maxR = int(p.r)
				}
				if int(p.g) < minG {
					minG = int(p.g)
				}
				if int(p.g) > maxG {
					maxG = int(p.g)
				}
				if int(p.b) < minB {
					minB = int(p.b)
				}
				if int(p.b) > maxB {
					maxB = int(p.b)
				}
			}

			spanR := maxR - minR
			spanG := maxG - minG
			spanB := maxB - minB

			span := spanR
			channel := 0
			if spanG > span {
				span = spanG
				channel = 1
			}
			if spanB > span {
				span = spanB
				channel = 2
			}

			if span > maxSpan {
				maxSpan = span
				bestBoxIdx = idx
				bestChannel = channel
			}
		}

		if bestBoxIdx == -1 || maxSpan == 0 {
			break
		}

		targetBox := boxes[bestBoxIdx]
		sort.Slice(targetBox.pixels, func(i, j int) bool {
			switch bestChannel {
			case 0:
				return targetBox.pixels[i].r < targetBox.pixels[j].r
			case 1:
				return targetBox.pixels[i].g < targetBox.pixels[j].g
			default:
				return targetBox.pixels[i].b < targetBox.pixels[j].b
			}
		})

		mid := len(targetBox.pixels) / 2
		b1 := colorBox{pixels: targetBox.pixels[:mid]}
		b2 := colorBox{pixels: targetBox.pixels[mid:]}

		boxes[bestBoxIdx] = b1
		boxes = append(boxes, b2)
	}

	swatches := make([]Swatch, len(boxes))
	for i, box := range boxes {
		sumR, sumG, sumB := 0, 0, 0
		for _, p := range box.pixels {
			sumR += int(p.r)
			sumG += int(p.g)
			sumB += int(p.b)
		}
		count := len(box.pixels)
		avgR := int(math.Round(float64(sumR) / float64(count)))
		avgG := int(math.Round(float64(sumG) / float64(count)))
		avgB := int(math.Round(float64(sumB) / float64(count)))

		swatches[i] = Swatch{
			Hex:   fmt.Sprintf("#%02X%02X%02X", avgR, avgG, avgB),
			Share: round4(float64(count) / float64(totalPixels)),
		}
	}

	sort.Slice(swatches, func(i, j int) bool {
		if swatches[i].Share != swatches[j].Share {
			return swatches[i].Share > swatches[j].Share
		}
		return swatches[i].Hex < swatches[j].Hex
	})

	return swatches
}

type swatchLCH struct {
	swatch Swatch
	lch    OKLCH
}

// RolesFromSwatches maps image swatches to generator input fields:
// - darkest high-share -> background/deep
// - mid -> surface
// - most chromatic -> baseColor/motif + accents
// - contrast nudged so text and accents meet contrast requirements.
func RolesFromSwatches(swatches []Swatch) (string, *Locked) {
	if len(swatches) == 0 {
		return "", nil
	}

	var parsed []swatchLCH
	for _, s := range swatches {
		lch, err := HexToOKLCH(s.Hex)
		if err == nil {
			parsed = append(parsed, swatchLCH{swatch: s, lch: lch})
		}
	}
	if len(parsed) == 0 {
		return "", nil
	}

	// 1. Darkest high-share -> background & deep
	// High-share: cumulative share up to 50% or at least top 2 candidates
	var highShare []swatchLCH
	cumShare := 0.0
	for i, p := range parsed {
		highShare = append(highShare, p)
		cumShare += p.swatch.Share
		if cumShare >= 0.50 && i >= 1 {
			break
		}
	}
	if len(highShare) == 0 {
		highShare = parsed
	}

	darkest := highShare[0]
	for _, p := range highShare[1:] {
		if p.lch.L < darkest.lch.L {
			darkest = p
		}
	}

	// Nudge background to dark range if needed for contrast with light text
	bgL := darkest.lch.L
	if bgL > 0.22 {
		bgL = 0.20
	} else if bgL < 0.08 {
		bgL = 0.12
	}
	bgOK := OKLCH{L: bgL, C: math.Min(0.04, darkest.lch.C), H: darkest.lch.H}
	deepOK := OKLCH{L: math.Max(0.04, bgOK.L-0.05), C: math.Min(0.03, bgOK.C), H: bgOK.H}

	// 2. Most chromatic -> baseColor, motif, accents
	mostChromatic := parsed[0]
	for _, p := range parsed[1:] {
		if p.lch.C > mostChromatic.lch.C {
			mostChromatic = p
		}
	}
	baseColor := mostChromatic.swatch.Hex

	motifL := math.Max(0.45, math.Min(0.65, mostChromatic.lch.L))
	motifOK := OKLCH{L: motifL, C: mostChromatic.lch.C, H: mostChromatic.lch.H}

	// 3. Mid -> surface
	midCandidate := parsed[0]
	bestDiff := 10.0
	targetMidL := bgOK.L + 0.10
	for _, p := range parsed {
		diff := math.Abs(p.lch.L - targetMidL)
		if diff < bestDiff {
			bestDiff = diff
			midCandidate = p
		}
	}
	surfaceL := math.Max(bgOK.L+0.06, math.Min(0.38, midCandidate.lch.L))
	surfaceOK := OKLCH{L: surfaceL, C: math.Min(0.06, midCandidate.lch.C), H: midCandidate.lch.H}

	// 4. Accents: remaining swatches sorted by chroma descending
	byChroma := make([]swatchLCH, len(parsed))
	copy(byChroma, parsed)
	sort.Slice(byChroma, func(i, j int) bool {
		return byChroma[i].lch.C > byChroma[j].lch.C
	})

	bgHex := OKLCHToHex(bgOK)
	var solidAccents []string
	for _, p := range byChroma {
		if p.swatch.Hex == darkest.swatch.Hex {
			continue
		}
		// Nudge accent lightness if contrast with background is below 3.0
		accOK := p.lch
		if accOK.L < 0.68 {
			accOK.L = 0.74
		}
		accHex := OKLCHToHex(accOK)
		ratio, _ := ContrastRatio(accHex, bgHex)
		if ratio >= 3.0 {
			solidAccents = append(solidAccents, accHex)
			if len(solidAccents) >= 3 {
				break
			}
		}
	}

	// If fewer than 3 accents, add complementary/analogous
	if len(solidAccents) < 1 {
		acc1 := OKLCH{L: 0.75, C: 0.16, H: mostChromatic.lch.H}
		solidAccents = append(solidAccents, OKLCHToHex(acc1))
	}
	if len(solidAccents) < 2 {
		compH := NormalizeHue(mostChromatic.lch.H + 180.0)
		acc2 := OKLCH{L: 0.75, C: 0.16, H: compH}
		solidAccents = append(solidAccents, OKLCHToHex(acc2))
	}
	if len(solidAccents) < 3 {
		anaH := NormalizeHue(mostChromatic.lch.H + 35.0)
		acc3 := OKLCH{L: 0.75, C: 0.16, H: anaH}
		solidAccents = append(solidAccents, OKLCHToHex(acc3))
	}

	// Text and TextMuted
	textOK := OKLCH{L: 0.95, C: 0.01, H: bgOK.H}
	textMutedOK := OKLCH{L: 0.82, C: 0.01, H: bgOK.H}

	deepHex := OKLCHToHex(deepOK)
	surfaceHex := OKLCHToHex(surfaceOK)
	textHex := OKLCHToHex(textOK)
	textMutedHex := OKLCHToHex(textMutedOK)
	motifHex := OKLCHToHex(motifOK)

	locked := &Locked{
		Background: &bgHex,
		Deep:       &deepHex,
		Surface:    &surfaceHex,
		Text:       &textHex,
		TextMuted:  &textMutedHex,
		Motif:      &motifHex,
		Accents:    solidAccents,
	}

	return baseColor, locked
}

// ApplyRolesFromSwatches maps swatches into an Input struct.
func ApplyRolesFromSwatches(in *Input, swatches []Swatch) {
	bColor, locked := RolesFromSwatches(swatches)
	if in.BaseColor == "" {
		in.BaseColor = bColor
	}
	in.Locked = locked
}
