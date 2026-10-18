package generator

import (
	"fmt"
	"math"
	"strconv"
	"strings"
)

// RGB represents non-linear sRGB channels in [0, 1].
type RGB struct {
	R, G, B float64
}

// OKLab represents coordinates in the Oklab color space.
type OKLab struct {
	L, A, B float64
}

// OKLCH represents coordinates in the Oklch color space:
// L in [0, 1], C >= 0, H in [0, 360).
type OKLCH struct {
	L, C, H float64
}

func clamp01(v float64) float64 {
	if v < 0 {
		return 0
	}
	if v > 1 {
		return 1
	}
	return v
}

// NormalizeHue returns hue in [0, 360).
func NormalizeHue(h float64) float64 {
	h = math.Mod(h, 360.0)
	if h < 0 {
		h += 360.0
	}
	return h
}

// sRGBToLinear converts an sRGB channel [0, 1] to linear light.
func sRGBToLinear(c float64) float64 {
	if c <= 0.04045 {
		return c / 12.92
	}
	return math.Pow((c+0.055)/1.055, 2.4)
}

// linearToSRGB converts a linear channel to sRGB [0, 1].
func linearToSRGB(c float64) float64 {
	if c <= 0.0031308 {
		return c * 12.92
	}
	return 1.055*math.Pow(c, 1.0/2.4) - 0.055
}

// LinearToOKLab converts linear sRGB channels to OKLab using Björn Ottosson's matrices.
func LinearToOKLab(r, g, b float64) OKLab {
	l := 0.4122214708*r + 0.5363325363*g + 0.0514459929*b
	m := 0.2119034982*r + 0.6806995451*g + 0.1073969566*b
	s := 0.0883024619*r + 0.2817188376*g + 0.6299787005*b

	l_ := math.Cbrt(l)
	m_ := math.Cbrt(m)
	s_ := math.Cbrt(s)

	L := 0.2104542553*l_ + 0.7936177850*m_ - 0.0040720468*s_
	a := 1.9779984951*l_ - 2.4285922050*m_ + 0.4505937099*s_
	bVal := 0.0259040371*l_ + 0.7827717662*m_ - 0.8086757660*s_

	return OKLab{L: L, A: a, B: bVal}
}

// OKLabToLinear converts OKLab to linear sRGB channels.
func OKLabToLinear(lab OKLab) (r, g, b float64) {
	l_ := lab.L + 0.3963377774*lab.A + 0.2158037573*lab.B
	m_ := lab.L - 0.1055613458*lab.A - 0.0638541728*lab.B
	s_ := lab.L - 0.0894841775*lab.A - 1.2914855480*lab.B

	l := l_ * l_ * l_
	m := m_ * m_ * m_
	s := s_ * s_ * s_

	r = +4.0767416621*l - 3.3077115913*m + 0.2309699292*s
	g = -1.2684380046*l + 2.6097574011*m - 0.3413193965*s
	b = -0.0041960863*l - 0.7034186147*m + 1.7076147010*s
	return r, g, b
}

// OKLabToOKLCH converts OKLab coordinates to OKLCH.
func OKLabToOKLCH(lab OKLab) OKLCH {
	c := math.Hypot(lab.A, lab.B)
	h := math.Atan2(lab.B, lab.A) * 180.0 / math.Pi
	if h < 0 {
		h += 360.0
	}
	return OKLCH{L: lab.L, C: c, H: h}
}

// OKLCHToOKLab converts OKLCH coordinates to OKLab.
func OKLCHToOKLab(lch OKLCH) OKLab {
	hRad := lch.H * math.Pi / 180.0
	return OKLab{
		L: lch.L,
		A: lch.C * math.Cos(hRad),
		B: lch.C * math.Sin(hRad),
	}
}

// RGBToOKLCH converts non-linear sRGB to OKLCH.
func RGBToOKLCH(rgb RGB) OKLCH {
	linR := sRGBToLinear(clamp01(rgb.R))
	linG := sRGBToLinear(clamp01(rgb.G))
	linB := sRGBToLinear(clamp01(rgb.B))
	lab := LinearToOKLab(linR, linG, linB)
	return OKLabToOKLCH(lab)
}

func oklchToRawSRGB(lch OKLCH) RGB {
	lab := OKLCHToOKLab(lch)
	linR, linG, linB := OKLabToLinear(lab)
	return RGB{
		R: linearToSRGB(linR),
		G: linearToSRGB(linG),
		B: linearToSRGB(linB),
	}
}

func isInSRGB(rgb RGB) bool {
	const eps = 1e-5
	return rgb.R >= -eps && rgb.R <= 1.0+eps &&
		rgb.G >= -eps && rgb.G <= 1.0+eps &&
		rgb.B >= -eps && rgb.B <= 1.0+eps
}

// ClampOKLCH clamps an OKLCH color to the sRGB gamut by reducing chroma.
func ClampOKLCH(lch OKLCH) OKLCH {
	if lch.L <= 0 {
		return OKLCH{L: 0, C: 0, H: NormalizeHue(lch.H)}
	}
	if lch.L >= 1 {
		return OKLCH{L: 1, C: 0, H: NormalizeHue(lch.H)}
	}
	lch.H = NormalizeHue(lch.H)
	if lch.C <= 0 {
		return OKLCH{L: lch.L, C: 0, H: lch.H}
	}

	raw := oklchToRawSRGB(lch)
	if isInSRGB(raw) {
		return lch
	}

	low := 0.0
	high := lch.C
	for i := 0; i < 32; i++ {
		mid := (low + high) / 2.0
		testLCH := OKLCH{L: lch.L, C: mid, H: lch.H}
		if isInSRGB(oklchToRawSRGB(testLCH)) {
			low = mid
		} else {
			high = mid
		}
	}
	return OKLCH{L: lch.L, C: low, H: lch.H}
}

// OKLCHToRGB converts OKLCH to in-gamut sRGB [0, 1].
func OKLCHToRGB(lch OKLCH) RGB {
	clamped := ClampOKLCH(lch)
	raw := oklchToRawSRGB(clamped)
	return RGB{
		R: clamp01(raw.R),
		G: clamp01(raw.G),
		B: clamp01(raw.B),
	}
}

// HexToRGB parses a hex string like "#RRGGBB", "RRGGBB", "#RGB", or "RGB" into sRGB channels [0, 1].
func HexToRGB(hex string) (RGB, error) {
	s := strings.TrimPrefix(hex, "#")
	if len(s) == 3 {
		s = string([]byte{s[0], s[0], s[1], s[1], s[2], s[2]})
	}
	if len(s) != 6 {
		return RGB{}, fmt.Errorf("invalid hex color %q: must be 3 or 6 hex digits", hex)
	}
	val, err := strconv.ParseUint(s, 16, 32)
	if err != nil {
		return RGB{}, fmt.Errorf("invalid hex color %q: %w", hex, err)
	}
	r := float64((val>>16)&0xFF) / 255.0
	g := float64((val>>8)&0xFF) / 255.0
	b := float64(val&0xFF) / 255.0
	return RGB{R: r, G: g, B: b}, nil
}

// RGBToHex formats sRGB channels into an uppercase "#RRGGBB" string.
func RGBToHex(rgb RGB) string {
	r := int(math.Round(clamp01(rgb.R) * 255.0))
	g := int(math.Round(clamp01(rgb.G) * 255.0))
	b := int(math.Round(clamp01(rgb.B) * 255.0))
	return fmt.Sprintf("#%02X%02X%02X", r, g, b)
}

// HexToOKLCH parses a hex color string and converts it to OKLCH.
func HexToOKLCH(hex string) (OKLCH, error) {
	rgb, err := HexToRGB(hex)
	if err != nil {
		return OKLCH{}, err
	}
	return RGBToOKLCH(rgb), nil
}

// OKLCHToHex converts an OKLCH color into a gamut-clamped "#RRGGBB" string.
func OKLCHToHex(lch OKLCH) string {
	return RGBToHex(OKLCHToRGB(lch))
}
