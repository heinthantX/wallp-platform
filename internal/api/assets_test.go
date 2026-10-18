package api_test

import (
	"bytes"
	"image"
	"image/color"
	"image/png"
	"mime/multipart"
	"net/http"
	"path/filepath"
	"testing"

	"github.com/heinthant/wallp-backend/internal/assets"
	"github.com/heinthant/wallp-backend/internal/model"
)

func uploadAssetMultipart(t *testing.T, s *testServer, token, path, fieldName, filename string, data []byte) (int, map[string]any) {
	t.Helper()
	var buf bytes.Buffer
	mw := multipart.NewWriter(&buf)
	part, err := mw.CreateFormFile(fieldName, filename)
	if err != nil {
		t.Fatalf("create form file failed: %v", err)
	}
	if _, err := part.Write(data); err != nil {
		t.Fatalf("write form data failed: %v", err)
	}
	if err := mw.Close(); err != nil {
		t.Fatalf("close multipart writer failed: %v", err)
	}
	return s.doWithHeaders(t, "POST", path, token, buf.Bytes(), map[string]string{
		"Content-Type": mw.FormDataContentType(),
	})
}

func generateSolidPNG(t *testing.T, w, h int, c color.Color) []byte {
	t.Helper()
	img := image.NewRGBA(image.Rect(0, 0, w, h))
	for y := 0; y < h; y++ {
		for x := 0; x < w; x++ {
			img.Set(x, y, c)
		}
	}
	var buf bytes.Buffer
	if err := png.Encode(&buf, img); err != nil {
		t.Fatalf("failed to encode png: %v", err)
	}
	return buf.Bytes()
}

func generateSplitPNG(t *testing.T, w, h int, topColor, bottomColor color.Color) []byte {
	t.Helper()
	img := image.NewRGBA(image.Rect(0, 0, w, h))
	topH := h / 3
	for y := 0; y < h; y++ {
		c := bottomColor
		if y < topH {
			c = topColor
		}
		for x := 0; x < w; x++ {
			img.Set(x, y, c)
		}
	}
	var buf bytes.Buffer
	if err := png.Encode(&buf, img); err != nil {
		t.Fatalf("failed to encode png: %v", err)
	}
	return buf.Bytes()
}

// 1. Dedupe: Upload same bytes twice -> first deduped: false, second deduped: true, single DB row
func TestAssetUploadDedupe(t *testing.T) {
	s := newServer(t)
	toks := setupRoleUsers(t, s)

	imgBytes := generateSolidPNG(t, 200, 200, color.RGBA{R: 20, G: 30, B: 50, A: 255})

	// First upload
	status, body := uploadAssetMultipart(t, s, toks.designer, "/admin/v1/assets", "file", "test.png", imgBytes)
	if status != http.StatusOK {
		t.Fatalf("first upload failed: status=%d body=%v", status, body)
	}
	if body["deduped"] != false {
		t.Fatalf("expected deduped=false on first upload, got %v", body["deduped"])
	}
	sha := body["sha256"].(string)
	if len(sha) != 64 {
		t.Fatalf("expected 64-char sha256, got %s", sha)
	}

	// Second upload with same bytes
	status, body2 := uploadAssetMultipart(t, s, toks.designer, "/admin/v1/assets", "file", "test.png", imgBytes)
	if status != http.StatusOK {
		t.Fatalf("second upload failed: status=%d body=%v", status, body2)
	}
	if body2["deduped"] != true {
		t.Fatalf("expected deduped=true on second upload, got %v", body2["deduped"])
	}
	if body2["sha256"] != sha {
		t.Fatalf("expected same sha256 %s, got %v", sha, body2["sha256"])
	}

	// Verify only 1 row in assets table
	count, err := s.db.NewSelect().Model((*model.Asset)(nil)).Where("sha256 = ?", sha).Count(t.Context())
	if err != nil || count != 1 {
		t.Fatalf("expected 1 row in assets table, got count=%d, err=%v", count, err)
	}
}

// 2. WOFF2 Reject with message "The app can't load WOFF2"
func TestAssetUploadWOFF2Reject(t *testing.T) {
	s := newServer(t)
	toks := setupRoleUsers(t, s)

	woff2Data := []byte("wOF2\x00\x01\x00\x00dummywoff2data")
	status, body := uploadAssetMultipart(t, s, toks.designer, "/admin/v1/assets", "file", "font.woff2", woff2Data)
	if status != http.StatusUnprocessableEntity {
		t.Fatalf("expected 422 for WOFF2, got %d (body=%v)", status, body)
	}
	errObj, ok := body["error"].(map[string]any)
	if !ok {
		t.Fatalf("expected error object, got %v", body)
	}
	msg, _ := errObj["message"].(string)
	if msg != "The app can't load WOFF2" {
		t.Fatalf("expected message 'The app can't load WOFF2', got %q", msg)
	}
}

// 3. Oversize rejects (byte size > 10MB, side > 8000px)
func TestAssetUploadOversize(t *testing.T) {
	s := newServer(t)
	toks := setupRoleUsers(t, s)

	// Side > 8000px
	hugeDimImg := generateSolidPNG(t, 8001, 10, color.RGBA{R: 10, G: 10, B: 10, A: 255})
	status, body := uploadAssetMultipart(t, s, toks.designer, "/admin/v1/assets", "file", "huge_dim.png", hugeDimImg)
	if status != http.StatusUnprocessableEntity {
		t.Fatalf("expected 422 for dimensions > 8000, got %d (body=%v)", status, body)
	}

	// Bytes > 10MB
	largeData := make([]byte, assets.MaxAssetSize+1024)
	copy(largeData, []byte{0x89, 'P', 'N', 'G', '\r', '\n', 0x1a, '\n'})
	status, _ = uploadAssetMultipart(t, s, toks.designer, "/admin/v1/assets", "file", "huge_file.png", largeData)
	if status != http.StatusUnprocessableEntity && status != http.StatusRequestEntityTooLarge {
		t.Fatalf("expected 422 or 413 for bytes > 10MB, got %d", status)
	}
}

// 4. Wallpaper variants exist with widths 1080/1440 and blurhash
func TestAssetWallpaperVariantsAndBlurhash(t *testing.T) {
	s := newServer(t)
	toks := setupRoleUsers(t, s)

	// Large enough image for wallpaper: 1500 x 3200, dark color
	imgBytes := generateSolidPNG(t, 1500, 3200, color.RGBA{R: 15, G: 20, B: 35, A: 255})

	status, body := uploadAssetMultipart(t, s, toks.designer, "/admin/v1/assets?variants=wallpaper", "file", "wp.png", imgBytes)
	if status != http.StatusOK {
		t.Fatalf("upload failed: status=%d body=%v", status, body)
	}

	// Check blurhash & dominant on primary
	bh, ok := body["blurhash"].(string)
	if !ok || bh == "" {
		t.Fatalf("expected non-empty blurhash, got %v", body["blurhash"])
	}
	dom, ok := body["dominant"].(string)
	if !ok || dom == "" || dom[0] != '#' {
		t.Fatalf("expected valid dominant hex color, got %v", body["dominant"])
	}

	// Check variants
	vars, ok := body["variants"].(map[string]any)
	if !ok {
		t.Fatalf("expected variants map, got %v", body["variants"])
	}
	v1080, ok := vars["1080"].(map[string]any)
	if !ok {
		t.Fatalf("missing 1080 variant, got %v", vars)
	}
	if v1080["width"] != float64(1080) {
		t.Fatalf("expected 1080 width, got %v", v1080["width"])
	}
	if v1080["format"] != "webp" {
		t.Fatalf("expected webp format, got %v", v1080["format"])
	}

	v1440, ok := vars["1440"].(map[string]any)
	if !ok {
		t.Fatalf("missing 1440 variant, got %v", vars)
	}
	if v1440["width"] != float64(1440) {
		t.Fatalf("expected 1440 width, got %v", v1440["width"])
	}
	if v1440["format"] != "webp" {
		t.Fatalf("expected webp format, got %v", v1440["format"])
	}

	// Verify variants exist in DB
	sha1080 := v1080["sha256"].(string)
	status, bodyGet := s.do(t, "GET", "/admin/v1/assets/"+sha1080, toks.viewer, nil)
	if status != http.StatusOK || bodyGet["sha256"] != sha1080 {
		t.Fatalf("get 1080 variant failed: status=%d body=%v", status, bodyGet)
	}
}

// 5. Warnings: too_small and clock_contrast
func TestAssetWarnings(t *testing.T) {
	s := newServer(t)
	toks := setupRoleUsers(t, s)

	// Small wallpaper -> too_small
	smallImg := generateSolidPNG(t, 800, 1000, color.RGBA{R: 20, G: 20, B: 20, A: 255})
	status, body := uploadAssetMultipart(t, s, toks.designer, "/admin/v1/assets?variants=wallpaper", "file", "small.png", smallImg)
	if status != http.StatusOK {
		t.Fatalf("small upload failed: %d", status)
	}
	warnings, _ := body["warnings"].([]any)
	hasTooSmall := false
	for _, w := range warnings {
		if w == "too_small" {
			hasTooSmall = true
		}
	}
	if !hasTooSmall {
		t.Fatalf("expected too_small warning, got %v", warnings)
	}

	// Bright top third -> clock_contrast (< 3 vs #FFFFFF)
	brightTopImg := generateSplitPNG(t, 1500, 3200, color.RGBA{R: 255, G: 255, B: 255, A: 255}, color.RGBA{R: 10, G: 10, B: 10, A: 255})
	status, body = uploadAssetMultipart(t, s, toks.designer, "/admin/v1/assets?variants=wallpaper", "file", "bright.png", brightTopImg)
	if status != http.StatusOK {
		t.Fatalf("bright upload failed: %d", status)
	}
	warnings, _ = body["warnings"].([]any)
	hasContrast := false
	for _, w := range warnings {
		if w == "clock_contrast" {
			hasContrast = true
		}
	}
	if !hasContrast {
		t.Fatalf("expected clock_contrast warning, got %v", warnings)
	}
}

// 6. In-use 409
func TestAssetInUse409(t *testing.T) {
	s := newServer(t)
	toks := setupRoleUsers(t, s)

	// Create festival
	s.do(t, "POST", "/admin/v1/festivals", toks.admin, validFestivalPayload("halloween", 10))

	// Upload asset
	imgBytes := generateSolidPNG(t, 300, 300, color.RGBA{R: 50, G: 60, B: 70, A: 255})
	status, body := uploadAssetMultipart(t, s, toks.designer, "/admin/v1/assets", "file", "icon.png", imgBytes)
	if status != http.StatusOK {
		t.Fatalf("asset upload failed: %d", status)
	}
	sha := body["sha256"].(string)
	assetURL := body["url"].(string)

	// Create theme that references assetURL in previewImage
	th := validThemePayload("theme-using-asset", "halloween")
	th["previewImage"] = map[string]any{
		"url":    assetURL,
		"sha256": sha,
		"bytes":  len(imgBytes),
		"format": "png",
	}
	status, body = s.do(t, "POST", "/admin/v1/themes", toks.designer, th)
	if status != http.StatusCreated {
		t.Fatalf("create theme failed: %d %v", status, body)
	}

	// Try to DELETE asset -> 409 asset_in_use
	status, body = s.do(t, "DELETE", "/admin/v1/assets/"+sha, toks.admin, nil)
	if status != http.StatusConflict {
		t.Fatalf("expected 409 asset_in_use, got %d (body=%v)", status, body)
	}
	errObj := body["error"].(map[string]any)
	if errObj["code"] != "asset_in_use" {
		t.Fatalf("expected error code asset_in_use, got %v", errObj["code"])
	}

	// Remove theme reference by archiving/updating theme
	th["previewImage"] = nil
	s.do(t, "PATCH", "/admin/v1/themes/theme-using-asset", toks.designer, th)

	// Delete asset now -> succeeds with 200
	status, _ = s.do(t, "DELETE", "/admin/v1/assets/"+sha, toks.admin, nil)
	if status != http.StatusOK {
		t.Fatalf("expected 200 after removing reference, got %d", status)
	}

	// Verify asset is gone (404)
	status, _ = s.do(t, "GET", "/admin/v1/assets/"+sha, toks.viewer, nil)
	if status != http.StatusNotFound {
		t.Fatalf("expected 404 for deleted asset, got %d", status)
	}
}

// 7. Static route serving and path traversal rejection
func TestStaticAssetServingAndTraversal(t *testing.T) {
	s := newServer(t)
	toks := setupRoleUsers(t, s)

	imgBytes := generateSolidPNG(t, 100, 100, color.RGBA{R: 100, G: 150, B: 200, A: 255})
	status, body := uploadAssetMultipart(t, s, toks.designer, "/admin/v1/assets", "file", "static.png", imgBytes)
	if status != http.StatusOK {
		t.Fatalf("upload failed: %d", status)
	}
	sha := body["sha256"].(string)

	// Valid static GET /assets/<sha256>.png
	req, _ := http.NewRequest("GET", s.server.URL+"/assets/"+sha+".png", nil)
	resp, err := s.server.Client().Do(req)
	if err != nil {
		t.Fatalf("static request failed: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200 for static asset, got %d", resp.StatusCode)
	}
	if resp.Header.Get("Cache-Control") != "public, max-age=31536000, immutable" {
		t.Fatalf("expected immutable cache header, got %q", resp.Header.Get("Cache-Control"))
	}
	if resp.Header.Get("Content-Type") != "image/png" {
		t.Fatalf("expected image/png content type, got %q", resp.Header.Get("Content-Type"))
	}

	// Traversal / bad filenames -> 404
	badPaths := []string{
		"/assets/../storage/assets/" + sha + ".png",
		"/assets/bad-filename.png",
		"/assets/1234.png",
		"/assets/" + sha + ".exe",
		"/assets/" + filepath.Join("..", "etc", "passwd"),
	}
	for _, bp := range badPaths {
		req, _ := http.NewRequest("GET", s.server.URL+bp, nil)
		resp, err := s.server.Client().Do(req)
		if err != nil {
			continue
		}
		resp.Body.Close()
		if resp.StatusCode != http.StatusNotFound && resp.StatusCode != http.StatusBadRequest {
			t.Fatalf("expected 404 for bad path %s, got %d", bp, resp.StatusCode)
		}
	}
}
