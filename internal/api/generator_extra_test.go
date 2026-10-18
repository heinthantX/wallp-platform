package api_test

import (
	"bytes"
	"image"
	"image/color"
	"image/png"
	"mime/multipart"
	"net/http"
	"os"
	"testing"
)

func createTwoColorPNG(t *testing.T) []byte {
	t.Helper()
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
		t.Fatalf("failed to encode 2-color png: %v", err)
	}
	return buf.Bytes()
}

func createOversizedPNG(t *testing.T) []byte {
	t.Helper()
	img := image.NewRGBA(image.Rect(0, 0, 8001, 1))
	var buf bytes.Buffer
	if err := png.Encode(&buf, img); err != nil {
		t.Fatalf("failed to encode oversized png: %v", err)
	}
	return buf.Bytes()
}

func TestFromImage_Endpoint(t *testing.T) {
	if _, err := os.Stat(mockCatalogDir); os.IsNotExist(err) {
		t.Skipf("mock catalog directory not found at %s, skipping test", mockCatalogDir)
	}

	s := newServer(t)
	toks := setupRoleUsers(t, s)

	// Import mock catalog first
	status, _ := s.do(t, "POST", "/admin/v1/import", toks.admin, map[string]any{
		"dir": mockCatalogDir,
	})
	if status != http.StatusOK {
		t.Fatalf("import failed: %d", status)
	}

	// 1. Viewer forbidden
	t.Run("ViewerForbidden", func(t *testing.T) {
		var buf bytes.Buffer
		mw := multipart.NewWriter(&buf)
		_ = mw.WriteField("festivalId", "christmas")
		part, _ := mw.CreateFormFile("image", "photo.png")
		_, _ = part.Write(createTwoColorPNG(t))
		_ = mw.Close()

		st, _ := s.doWithHeaders(t, "POST", "/admin/v1/themes/generate/from-image", toks.viewer, buf.Bytes(), map[string]string{
			"Content-Type": mw.FormDataContentType(),
		})
		if st != http.StatusForbidden {
			t.Fatalf("expected 403 for viewer on from-image, got %d", st)
		}
	})

	// 2. Reject image with side > 8000 px (422 field image)
	t.Run("RejectOversizedImage", func(t *testing.T) {
		var buf bytes.Buffer
		mw := multipart.NewWriter(&buf)
		_ = mw.WriteField("festivalId", "christmas")
		part, _ := mw.CreateFormFile("image", "huge.png")
		_, _ = part.Write(createOversizedPNG(t))
		_ = mw.Close()

		st, body := s.doWithHeaders(t, "POST", "/admin/v1/themes/generate/from-image", toks.designer, buf.Bytes(), map[string]string{
			"Content-Type": mw.FormDataContentType(),
		})
		if st != http.StatusUnprocessableEntity {
			t.Fatalf("expected 422 for image side > 8000 px, got %d; body: %v", st, body)
		}
	})

	// 3. Two-colour PNG yields those 2 colours as top swatches and generates options
	t.Run("TwoColorPNGYieldsTopSwatches", func(t *testing.T) {
		var buf bytes.Buffer
		mw := multipart.NewWriter(&buf)
		_ = mw.WriteField("festivalId", "christmas")
		_ = mw.WriteField("mood", "cozy")
		_ = mw.WriteField("count", "3")
		part, _ := mw.CreateFormFile("image", "two_color.png")
		_, _ = part.Write(createTwoColorPNG(t))
		_ = mw.Close()

		st, body := s.doWithHeaders(t, "POST", "/admin/v1/themes/generate/from-image", toks.designer, buf.Bytes(), map[string]string{
			"Content-Type": mw.FormDataContentType(),
		})
		if st != http.StatusOK {
			t.Fatalf("expected 200 on from-image, got %d; body: %v", st, body)
		}

		swatchesRaw, ok := body["swatches"].([]any)
		if !ok || len(swatchesRaw) < 2 {
			t.Fatalf("expected at least 2 swatches, got %v", body["swatches"])
		}

		s0 := swatchesRaw[0].(map[string]any)["hex"].(string)
		s1 := swatchesRaw[1].(map[string]any)["hex"].(string)

		isRedAndBlue := (s0 == "#FF0000" && s1 == "#0000FF") || (s0 == "#0000FF" && s1 == "#FF0000")
		if !isRedAndBlue {
			t.Fatalf("expected top swatches to be #FF0000 and #0000FF, got %s and %s", s0, s1)
		}

		optionsRaw, ok := body["options"].([]any)
		if !ok || len(optionsRaw) == 0 {
			t.Fatalf("expected options in from-image response, got %v", body["options"])
		}
	})
}

func TestFeedback_Endpoint(t *testing.T) {
	s := newServer(t)
	toks := setupRoleUsers(t, s)

	validPayload := map[string]any{
		"festivalId": "christmas",
		"mood":       "cozy",
		"seed":       12345,
		"palette": map[string]any{
			"background": "#1A1520",
			"deep":       "#120E18",
			"surface":    "#2C2436",
			"text":       "#F5F0FA",
			"textMuted":  "#C8BCD4",
			"motif":      "#FF5500",
		},
		"action": "accepted",
	}

	// 1. Viewer forbidden -> 403
	t.Run("ViewerForbidden", func(t *testing.T) {
		status, _ := s.do(t, "POST", "/admin/v1/generator/feedback", toks.viewer, validPayload)
		if status != http.StatusForbidden {
			t.Fatalf("expected 403 for viewer, got %d", status)
		}
	})

	// 2. Bad action -> 422
	t.Run("BadAction422", func(t *testing.T) {
		badPayload := map[string]any{
			"festivalId": "christmas",
			"mood":       "cozy",
			"palette": map[string]any{
				"background": "#1A1520",
			},
			"action": "invalid_action",
		}
		status, body := s.do(t, "POST", "/admin/v1/generator/feedback", toks.designer, badPayload)
		if status != http.StatusUnprocessableEntity {
			t.Fatalf("expected 422 for bad action, got %d; body: %v", status, body)
		}
	})

	// 3. Designer success -> 201 Created
	t.Run("DesignerSuccess201", func(t *testing.T) {
		status, body := s.do(t, "POST", "/admin/v1/generator/feedback", toks.designer, validPayload)
		if status != http.StatusCreated {
			t.Fatalf("expected 201 for designer on feedback, got %d; body: %v", status, body)
		}
		if body["id"] == nil {
			t.Fatalf("expected generated feedback ID in response, got %v", body)
		}
	})
}

func TestBreed_Endpoint(t *testing.T) {
	if _, err := os.Stat(mockCatalogDir); os.IsNotExist(err) {
		t.Skipf("mock catalog directory not found at %s, skipping test", mockCatalogDir)
	}

	s := newServer(t)
	toks := setupRoleUsers(t, s)

	// Import mock catalog first
	status, _ := s.do(t, "POST", "/admin/v1/import", toks.admin, map[string]any{
		"dir": mockCatalogDir,
	})
	if status != http.StatusOK {
		t.Fatalf("import failed: %d", status)
	}

	// Generate two themes to use as parents
	genStatus, genBody := s.do(t, "POST", "/admin/v1/themes/generate", toks.designer, map[string]any{
		"festivalId": "christmas",
		"mood":       "cozy",
		"count":      2,
		"seed":       12345,
	})
	if genStatus != http.StatusOK {
		t.Fatalf("failed to generate parent themes: %d; body: %v", genStatus, genBody)
	}

	opts := genBody["options"].([]any)
	parentA := opts[0].(map[string]any)["data"]
	parentB := opts[1].(map[string]any)["data"]

	payload := map[string]any{
		"a":    parentA,
		"b":    parentB,
		"seed": int64(777),
	}

	// 1. Viewer forbidden -> 403
	t.Run("ViewerForbidden", func(t *testing.T) {
		st, _ := s.do(t, "POST", "/admin/v1/themes/generate/breed", toks.viewer, payload)
		if st != http.StatusForbidden {
			t.Fatalf("expected 403 for viewer on breed, got %d", st)
		}
	})

	// 2. Designer success -> 200 with 6 options
	t.Run("DesignerSuccessSixOptions", func(t *testing.T) {
		st, body := s.do(t, "POST", "/admin/v1/themes/generate/breed", toks.designer, payload)
		if st != http.StatusOK {
			t.Fatalf("expected 200 for designer on breed, got %d; body: %v", st, body)
		}

		bOptions, ok := body["options"].([]any)
		if !ok || len(bOptions) != 6 {
			t.Fatalf("expected 6 options in breed response, got %v", body["options"])
		}

		// Fixed seed determinism
		status1, resp1 := s.doRaw(t, "POST", "/admin/v1/themes/generate/breed", toks.designer, payload, nil)
		if status1 != http.StatusOK {
			t.Fatalf("first breed call failed: %d", status1)
		}
		status2, resp2 := s.doRaw(t, "POST", "/admin/v1/themes/generate/breed", toks.designer, payload, nil)
		if status2 != http.StatusOK {
			t.Fatalf("second breed call failed: %d", status2)
		}
		if !semanticJSONEqual(t, resp1, resp2) {
			t.Fatalf("breed with fixed seed produced different outputs across calls")
		}

		// Verify all children pass error-level checks
		for i, optRaw := range bOptions {
			optMap := optRaw.(map[string]any)
			checks := optMap["checks"].([]any)
			for _, chkRaw := range checks {
				chk := chkRaw.(map[string]any)
				if chk["level"] == "error" && chk["pass"] != true {
					t.Fatalf("child option %d failed error-level check %s (%s)", i, chk["name"], chk["field"])
				}
			}
		}
	})
}
