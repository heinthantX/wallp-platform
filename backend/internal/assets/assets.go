package assets

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"image"
	"image/color"
	_ "image/jpeg"
	"image/png"
	"io"
	"math"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/buckket/go-blurhash"
	"github.com/gen2brain/webp"
	"golang.org/x/image/draw"
	_ "golang.org/x/image/webp"

	"github.com/heinthant/wallp-backend/internal/apierr"
	"github.com/heinthant/wallp-backend/internal/generator"
)

const (
	MaxAssetSize = 10 * 1024 * 1024 // 10 MB
	MaxDimension = 8000
)

// Sniff detects the file format and MIME type from content.
// Only png, jpg, webp, ttf, otf, and json are allowed.
// WOFF2 is rejected with a specific error message.
func Sniff(data []byte) (format, mimeType string, err error) {
	if len(data) >= 4 && string(data[:4]) == "wOF2" {
		return "", "", apierr.New(http.StatusUnprocessableEntity, "unsupported_font", "The app can't load WOFF2")
	}

	// 1. Magic bytes check
	if len(data) >= 8 && bytes.Equal(data[:8], []byte{0x89, 'P', 'N', 'G', '\r', '\n', 0x1a, '\n'}) {
		return "png", "image/png", nil
	}
	if len(data) >= 3 && data[0] == 0xff && data[1] == 0xd8 && data[2] == 0xff {
		return "jpg", "image/jpeg", nil
	}
	if len(data) >= 12 && string(data[:4]) == "RIFF" && string(data[8:12]) == "WEBP" {
		return "webp", "image/webp", nil
	}
	if len(data) >= 4 && (bytes.Equal(data[:4], []byte{0x00, 0x01, 0x00, 0x00}) || string(data[:4]) == "true") {
		return "ttf", "font/ttf", nil
	}
	if len(data) >= 4 && string(data[:4]) == "OTTO" {
		return "otf", "font/otf", nil
	}

	// 2. Check JSON
	trimmed := bytes.TrimSpace(data)
	if len(trimmed) > 0 && (trimmed[0] == '{' || trimmed[0] == '[') {
		if json.Valid(trimmed) {
			return "json", "application/json", nil
		}
	}

	// 3. Fallback to http.DetectContentType
	detected := http.DetectContentType(data)
	switch {
	case strings.HasPrefix(detected, "image/png"):
		return "png", "image/png", nil
	case strings.HasPrefix(detected, "image/jpeg"):
		return "jpg", "image/jpeg", nil
	case strings.HasPrefix(detected, "image/webp"):
		return "webp", "image/webp", nil
	}

	return "", "", apierr.New(http.StatusUnprocessableEntity, "unsupported_format", "Only png, jpg, webp, ttf, otf, and json files are allowed")
}

type ImageMeta struct {
	Width    int
	Height   int
	Blurhash string
	Dominant string
	Warnings []string
}

// ProcessImage decodes image, checks max dimension, creates thumbnail, computes blurhash,
// dominant color, and checks warnings.
// MaxPixels caps width*height so a tiny file cannot decode into gigabytes.
const MaxPixels = 25_000_000

// decodeSlots bounds concurrent decode+resize work.
var decodeSlots = make(chan struct{}, 2)

// AcquireDecode blocks until a decode slot is free; call the result when done.
func AcquireDecode() (release func()) {
	decodeSlots <- struct{}{}
	return func() { <-decodeSlots }
}

// CheckPixels rejects images over MaxPixels (call after DecodeConfig).
func CheckPixels(w, h int) error {
	if int64(w)*int64(h) > MaxPixels {
		return apierr.Invalid("file", "Image is larger than 25 megapixels")
	}
	return nil
}

func ProcessImage(data []byte, isWallpaper bool) (image.Image, ImageMeta, error) {
	cfg, _, err := image.DecodeConfig(bytes.NewReader(data))
	if err != nil {
		return nil, ImageMeta{}, apierr.New(http.StatusUnprocessableEntity, "corrupted_image", "The image could not be read")
	}
	if err := CheckPixels(cfg.Width, cfg.Height); err != nil {
		return nil, ImageMeta{}, err
	}
	defer AcquireDecode()()
	if cfg.Width > MaxDimension || cfg.Height > MaxDimension {
		return nil, ImageMeta{}, apierr.New(http.StatusUnprocessableEntity, "image_too_large", fmt.Sprintf("Image dimensions (%dx%d) exceed maximum of %dpx", cfg.Width, cfg.Height, MaxDimension))
	}

	img, _, err := image.Decode(bytes.NewReader(data))
	if err != nil {
		return nil, ImageMeta{}, apierr.New(http.StatusUnprocessableEntity, "corrupted_image", "The image could not be read")
	}

	width := img.Bounds().Dx()
	height := img.Bounds().Dy()

	// Create thumbnail <= 64px for blurhash & dominant
	thumbW, thumbH := calcThumbnailDimensions(width, height, 64)
	thumb := image.NewRGBA(image.Rect(0, 0, thumbW, thumbH))
	draw.CatmullRom.Scale(thumb, thumb.Bounds(), img, img.Bounds(), draw.Over, nil)

	// Blurhash (4x7 components)
	xComp := min(4, thumbW)
	yComp := min(7, thumbH)
	bh, err := blurhash.Encode(xComp, yComp, thumb)
	if err != nil {
		bh = ""
	}

	// Dominant color (average OKLab -> OKLCH -> Hex)
	dominant := calcDominantColor(thumb)

	// Warnings
	var warnings []string
	if isWallpaper && (width < 1440 || height < 3120) {
		warnings = append(warnings, "too_small")
	}
	if int64(len(data)) > 1024*1024 {
		warnings = append(warnings, "too_large")
	}

	// Clock contrast check on top third
	if isClockContrastLow(thumb) {
		warnings = append(warnings, "clock_contrast")
	}

	if warnings == nil {
		warnings = []string{}
	}

	return img, ImageMeta{
		Width:    width,
		Height:   height,
		Blurhash: bh,
		Dominant: dominant,
		Warnings: warnings,
	}, nil
}

func calcThumbnailDimensions(w, h, maxDim int) (int, int) {
	if w <= maxDim && h <= maxDim {
		return w, h
	}
	if w >= h {
		tw := maxDim
		th := int(math.Round(float64(h) * float64(maxDim) / float64(w)))
		if th < 1 {
			th = 1
		}
		return tw, th
	}
	th := maxDim
	tw := int(math.Round(float64(w) * float64(maxDim) / float64(h)))
	if tw < 1 {
		tw = 1
	}
	return tw, th
}

func calcDominantColor(img *image.RGBA) string {
	bounds := img.Bounds()
	w, h := bounds.Dx(), bounds.Dy()
	count := float64(w * h)
	if count == 0 {
		return "#000000"
	}

	var sumL, sumA, sumB float64
	for y := bounds.Min.Y; y < bounds.Max.Y; y++ {
		for x := bounds.Min.X; x < bounds.Max.X; x++ {
			c := img.RGBAAt(x, y)
			rLin := generator.SRGBToLinear(float64(c.R) / 255.0)
			gLin := generator.SRGBToLinear(float64(c.G) / 255.0)
			bLin := generator.SRGBToLinear(float64(c.B) / 255.0)

			lab := generator.LinearToOKLab(rLin, gLin, bLin)
			sumL += lab.L
			sumA += lab.A
			sumB += lab.B
		}
	}

	avgLab := generator.OKLab{L: sumL / count, A: sumA / count, B: sumB / count}
	lch := generator.OKLabToOKLCH(avgLab)
	return generator.OKLCHToHex(lch)
}

// isClockContrastLow checks if the contrast ratio between white text (#FFFFFF)
// and the mean luminance of the top third of the thumbnail is < 3.0.
func isClockContrastLow(img *image.RGBA) bool {
	bounds := img.Bounds()
	w := bounds.Dx()
	h := bounds.Dy()
	topH := h / 3
	if topH < 1 {
		topH = 1
	}

	var sumLum float64
	pixelCount := float64(w * topH)
	if pixelCount == 0 {
		return false
	}

	for y := bounds.Min.Y; y < bounds.Min.Y+topH; y++ {
		for x := bounds.Min.X; x < bounds.Max.X; x++ {
			c := img.RGBAAt(x, y)
			rgb := generator.RGB{
				R: float64(c.R) / 255.0,
				G: float64(c.G) / 255.0,
				B: float64(c.B) / 255.0,
			}
			sumLum += generator.RelativeLuminance(rgb)
		}
	}

	meanLum := sumLum / pixelCount
	// White text has relative luminance 1.0
	contrast := generator.ContrastRatioLuminance(1.0, meanLum)
	return contrast < 3.0
}

type Variant struct {
	Width    int
	Height   int
	Format   string
	Bytes    []byte
	SHA256   string
	Blurhash string
	Dominant string
}

// CreateWallpaperVariants generates WebP variants at widths 1080 and 1440.
func CreateWallpaperVariants(src image.Image) (map[string]Variant, error) {
	bounds := src.Bounds()
	srcW := bounds.Dx()
	srcH := bounds.Dy()
	if srcW == 0 || srcH == 0 {
		return nil, fmt.Errorf("invalid image bounds")
	}

	widths := []int{1080, 1440}
	results := make(map[string]Variant, len(widths))

	for _, targetW := range widths {
		targetH := int(math.Round(float64(srcH) * float64(targetW) / float64(srcW)))
		if targetH < 1 {
			targetH = 1
		}

		dst := image.NewRGBA(image.Rect(0, 0, targetW, targetH))
		draw.CatmullRom.Scale(dst, dst.Bounds(), src, bounds, draw.Over, nil)

		var buf bytes.Buffer
		opts := webp.Options{
			Quality: 82,
		}
		if err := webp.Encode(&buf, dst, opts); err != nil {
			return nil, fmt.Errorf("failed to encode webp variant %d: %w", targetW, err)
		}

		varBytes := buf.Bytes()
		h := sha256.Sum256(varBytes)
		shaHex := hex.EncodeToString(h[:])

		// Thumbnail for variant blurhash & dominant
		vThumbW, vThumbH := calcThumbnailDimensions(targetW, targetH, 64)
		vThumb := image.NewRGBA(image.Rect(0, 0, vThumbW, vThumbH))
		draw.CatmullRom.Scale(vThumb, vThumb.Bounds(), dst, dst.Bounds(), draw.Over, nil)

		bh, _ := blurhash.Encode(min(4, vThumbW), min(7, vThumbH), vThumb)
		dom := calcDominantColor(vThumb)

		results[fmt.Sprintf("%d", targetW)] = Variant{
			Width:    targetW,
			Height:   targetH,
			Format:   "webp",
			Bytes:    varBytes,
			SHA256:   shaHex,
			Blurhash: bh,
			Dominant: dom,
		}
	}

	return results, nil
}

// StoreAsset writes data to STORAGE_DIR/assets/<sha256>.<format> using write-to-temp + rename.
func StoreAsset(storageDir, sha256Hex, format string, data []byte) (string, error) {
	assetsDir := filepath.Join(storageDir, "assets")
	if err := os.MkdirAll(assetsDir, 0755); err != nil {
		return "", fmt.Errorf("failed to create assets directory: %w", err)
	}

	destPath := filepath.Join(assetsDir, fmt.Sprintf("%s.%s", sha256Hex, format))

	// If file already exists, dedupe
	if _, err := os.Stat(destPath); err == nil {
		return destPath, nil
	}

	tempDir := filepath.Join(storageDir, "temp")
	if err := os.MkdirAll(tempDir, 0755); err != nil {
		return "", fmt.Errorf("failed to create temp directory: %w", err)
	}

	tempFile, err := os.CreateTemp(tempDir, "upload-*."+format)
	if err != nil {
		return "", fmt.Errorf("failed to create temp file: %w", err)
	}
	tempPath := tempFile.Name()

	if _, err := io.Copy(tempFile, bytes.NewReader(data)); err != nil {
		tempFile.Close()
		_ = os.Remove(tempPath)
		return "", fmt.Errorf("failed to write temp file: %w", err)
	}
	if err := tempFile.Close(); err != nil {
		_ = os.Remove(tempPath)
		return "", fmt.Errorf("failed to close temp file: %w", err)
	}

	if err := os.Rename(tempPath, destPath); err != nil {
		_ = os.Remove(tempPath)
		return "", fmt.Errorf("failed to rename temp file to dest: %w", err)
	}

	return destPath, nil
}

// GenerateTestPNG creates an in-memory PNG image of given width, height and solid color.
func GenerateTestPNG(w, h int, c color.Color) ([]byte, error) {
	img := image.NewRGBA(image.Rect(0, 0, w, h))
	draw.Draw(img, img.Bounds(), &image.Uniform{C: c}, image.Point{}, draw.Src)
	var buf bytes.Buffer
	if err := png.Encode(&buf, img); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
