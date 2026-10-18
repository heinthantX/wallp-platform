package generator

// RelativeLuminance calculates WCAG 2 relative luminance from an sRGB color.
// https://www.w3.org/TR/WCAG21/#dfn-relative-luminance
func RelativeLuminance(rgb RGB) float64 {
	rLin := sRGBToLinear(clamp01(rgb.R))
	gLin := sRGBToLinear(clamp01(rgb.G))
	bLin := sRGBToLinear(clamp01(rgb.B))
	return 0.2126*rLin + 0.7152*gLin + 0.0722*bLin
}

// LuminanceFromHex calculates WCAG 2 relative luminance from a hex color string.
func LuminanceFromHex(hex string) (float64, error) {
	rgb, err := HexToRGB(hex)
	if err != nil {
		return 0, err
	}
	return RelativeLuminance(rgb), nil
}

// ContrastRatio calculates the WCAG 2 contrast ratio between two hex colors.
// Result is in [1, 21].
func ContrastRatio(hex1, hex2 string) (float64, error) {
	l1, err := LuminanceFromHex(hex1)
	if err != nil {
		return 0, err
	}
	l2, err := LuminanceFromHex(hex2)
	if err != nil {
		return 0, err
	}
	return ContrastRatioLuminance(l1, l2), nil
}

// ContrastRatioRGB calculates the WCAG 2 contrast ratio between two RGB colors.
func ContrastRatioRGB(c1, c2 RGB) float64 {
	l1 := RelativeLuminance(c1)
	l2 := RelativeLuminance(c2)
	return ContrastRatioLuminance(l1, l2)
}

// ContrastRatioLuminance calculates contrast ratio from two relative luminance values.
func ContrastRatioLuminance(l1, l2 float64) float64 {
	if l1 < l2 {
		l1, l2 = l2, l1
	}
	return (l1 + 0.05) / (l2 + 0.05)
}
