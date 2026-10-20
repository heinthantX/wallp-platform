package api_test

import (
	"encoding/base64"
	"encoding/json"
	"image/color"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/heinthant/wallp-backend/internal/api"
	"github.com/heinthant/wallp-backend/internal/assets"
)

func TestAIImages_NotConfigured(t *testing.T) {
	t.Setenv("CLOUDFLARE_ACCOUNT_ID", "")
	t.Setenv("CLOUDFLARE_AI_TOKEN", "")

	s := newServer(t)
	toks := setupRoleUsers(t, s)

	status, body := s.do(t, "POST", "/admin/v1/ai/images", toks.designer, map[string]any{
		"prompt": "Cyberpunk city night",
	})
	if status != http.StatusNotImplemented {
		t.Fatalf("status = %d, want 501; body = %v", status, body)
	}
	errObj, ok := body["error"].(map[string]any)
	if !ok || errObj["code"] != "ai_not_configured" {
		t.Fatalf("expected ai_not_configured error, got %v", body["error"])
	}
}

func TestAIImages_ViewerForbidden(t *testing.T) {
	t.Setenv("CLOUDFLARE_ACCOUNT_ID", "test-account")
	t.Setenv("CLOUDFLARE_AI_TOKEN", "test-token")

	s := newServer(t)
	toks := setupRoleUsers(t, s)

	status, _ := s.do(t, "POST", "/admin/v1/ai/images", toks.viewer, map[string]any{
		"prompt": "Cyberpunk city night",
	})
	if status != http.StatusForbidden {
		t.Fatalf("status = %d, want 403", status)
	}
}

func TestAIImages_Success(t *testing.T) {
	fakePNG, err := assets.GenerateTestPNG(64, 64, color.RGBA{R: 200, G: 50, B: 50, A: 255})
	if err != nil {
		t.Fatalf("failed to generate test png: %v", err)
	}
	fakeB64 := base64.StdEncoding.EncodeToString(fakePNG)

	var receivedPrompt, receivedSize string
	fakeCF := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer test-cf-token" {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		if !strings.Contains(r.URL.Path, "/accounts/test-cf-account/ai/run/") {
			http.Error(w, "not found", http.StatusNotFound)
			return
		}

		// flux-2 models only accept multipart/form-data.
		if err := r.ParseMultipartForm(1 << 20); err != nil {
			http.Error(w, "multipart required", http.StatusBadRequest)
			return
		}
		receivedPrompt = r.FormValue("prompt")
		receivedSize = r.FormValue("width") + "x" + r.FormValue("height")

		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"result": map[string]any{
				"image": fakeB64,
			},
			"success": true,
		})
	}))
	defer fakeCF.Close()

	t.Setenv("CLOUDFLARE_API_BASE", fakeCF.URL)
	t.Setenv("CLOUDFLARE_ACCOUNT_ID", "test-cf-account")
	t.Setenv("CLOUDFLARE_AI_TOKEN", "test-cf-token")

	s := newServer(t)
	toks := setupRoleUsers(t, s)

	status, body := s.do(t, "POST", "/admin/v1/ai/images", toks.designer, map[string]any{
		"prompt":  "minimalist camera",
		"purpose": "icon",
		"steps":   4,
	})
	if status != http.StatusOK {
		t.Fatalf("status = %d, want 200; body = %v", status, body)
	}

	assetObj, ok := body["asset"].(map[string]any)
	if !ok {
		t.Fatalf("expected asset object in response, got %v", body)
	}
	urlStr, _ := assetObj["url"].(string)
	shaStr, _ := assetObj["sha256"].(string)
	if urlStr == "" || shaStr == "" {
		t.Fatalf("expected non-empty url and sha256 in asset: %v", assetObj)
	}

	if !strings.HasPrefix(receivedPrompt, "Square app icon, single centered flat glyph") {
		t.Fatalf("receivedPrompt did not have icon prefix: %q", receivedPrompt)
	}
	if body["prompt"] != receivedPrompt {
		t.Fatalf("returned prompt %v != sent prompt %v", body["prompt"], receivedPrompt)
	}
	if receivedSize != "512x512" {
		t.Fatalf("icon size = %q, want 512x512", receivedSize)
	}
	if body["model"] != "@cf/black-forest-labs/flux-2-klein-9b" {
		t.Fatalf("unexpected model: %v", body["model"])
	}

	// Verify asset is downloadable
	req, _ := http.NewRequest("GET", s.server.URL+"/"+urlStr, nil)
	resp, err := s.server.Client().Do(req)
	if err != nil || resp.StatusCode != http.StatusOK {
		t.Fatalf("failed to download asset at %s: status=%v, err=%v", urlStr, resp.StatusCode, err)
	}
	resp.Body.Close()

	// Verify asset is listed in GET /admin/v1/assets
	listStatus, listBody := s.do(t, "GET", "/admin/v1/assets", toks.designer, nil)
	if listStatus != http.StatusOK {
		t.Fatalf("failed to list assets: status=%d", listStatus)
	}
	items, _ := listBody["items"].([]any)
	found := false
	for _, it := range items {
		m, ok := it.(map[string]any)
		if ok && m["sha256"] == shaStr {
			found = true
			break
		}
	}
	if !found {
		t.Fatalf("uploaded asset %s not found in asset list: %v", shaStr, listBody)
	}
}

func TestAIImages_RateLimited(t *testing.T) {
	fakeCF := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, `{"success":false,"errors":[{"code":1000,"message":"Rate limit"}]}`, http.StatusTooManyRequests)
	}))
	defer fakeCF.Close()

	t.Setenv("CLOUDFLARE_API_BASE", fakeCF.URL)
	t.Setenv("CLOUDFLARE_ACCOUNT_ID", "test-account")
	t.Setenv("CLOUDFLARE_AI_TOKEN", "test-token")

	s := newServer(t)
	toks := setupRoleUsers(t, s)

	status, body := s.do(t, "POST", "/admin/v1/ai/images", toks.designer, map[string]any{
		"prompt": "A lovely flower",
	})
	if status != http.StatusTooManyRequests {
		t.Fatalf("status = %d, want 429; body = %v", status, body)
	}
	errObj, ok := body["error"].(map[string]any)
	if !ok || errObj["code"] != "ai_rate_limited" {
		t.Fatalf("expected ai_rate_limited error, got %v", body["error"])
	}
	if errObj["message"] != "Cloudflare free image limit reached for today (resets 00:00 UTC)." {
		t.Fatalf("unexpected message: %v", errObj["message"])
	}
}

func TestAIImages_DailyNeuronLimit4006(t *testing.T) {
	fakeCF := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusBadRequest)
		_ = json.NewEncoder(w).Encode(map[string]any{
			"success": false,
			"errors": []any{
				map[string]any{
					"code":    4006,
					"message": "Daily neuron limit reached",
				},
			},
		})
	}))
	defer fakeCF.Close()

	t.Setenv("CLOUDFLARE_API_BASE", fakeCF.URL)
	t.Setenv("CLOUDFLARE_ACCOUNT_ID", "test-account")
	t.Setenv("CLOUDFLARE_AI_TOKEN", "test-token")

	s := newServer(t)
	toks := setupRoleUsers(t, s)

	status, body := s.do(t, "POST", "/admin/v1/ai/images", toks.designer, map[string]any{
		"prompt": "A lovely flower",
	})
	if status != http.StatusTooManyRequests {
		t.Fatalf("status = %d, want 429; body = %v", status, body)
	}
	errObj, ok := body["error"].(map[string]any)
	if !ok || errObj["code"] != "ai_rate_limited" {
		t.Fatalf("expected ai_rate_limited error, got %v", body["error"])
	}
}

func TestAIImages_UpstreamAuth(t *testing.T) {
	fakeCF := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
	}))
	defer fakeCF.Close()

	t.Setenv("CLOUDFLARE_API_BASE", fakeCF.URL)
	t.Setenv("CLOUDFLARE_ACCOUNT_ID", "test-account")
	t.Setenv("CLOUDFLARE_AI_TOKEN", "test-token")

	s := newServer(t)
	toks := setupRoleUsers(t, s)

	status, body := s.do(t, "POST", "/admin/v1/ai/images", toks.designer, map[string]any{
		"prompt": "A lovely flower",
	})
	if status != http.StatusBadGateway {
		t.Fatalf("status = %d, want 502; body = %v", status, body)
	}
	errObj, ok := body["error"].(map[string]any)
	if !ok || errObj["code"] != "ai_upstream_auth" {
		t.Fatalf("expected ai_upstream_auth error, got %v", body["error"])
	}
}

func TestAIImages_BadOutput(t *testing.T) {
	fakeCF := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewEncoder(w).Encode(map[string]any{
			"result": map[string]any{
				"image": "not-a-valid-base64-string!@#$",
			},
			"success": true,
		})
	}))
	defer fakeCF.Close()

	t.Setenv("CLOUDFLARE_API_BASE", fakeCF.URL)
	t.Setenv("CLOUDFLARE_ACCOUNT_ID", "test-account")
	t.Setenv("CLOUDFLARE_AI_TOKEN", "test-token")

	s := newServer(t)
	toks := setupRoleUsers(t, s)

	status, body := s.do(t, "POST", "/admin/v1/ai/images", toks.designer, map[string]any{
		"prompt": "A lovely flower",
	})
	if status != http.StatusBadGateway {
		t.Fatalf("status = %d, want 502; body = %v", status, body)
	}
	errObj, ok := body["error"].(map[string]any)
	if !ok || errObj["code"] != "ai_bad_output" {
		t.Fatalf("expected ai_bad_output error, got %v", body["error"])
	}
}

func TestCloudflareImageBody_Flux1UsesJSON(t *testing.T) {
	body, ct, err := api.CloudflareImageBody("@cf/black-forest-labs/flux-1-schnell", "a cat", "wallpaper", 4, nil)
	if err != nil || ct != "application/json" {
		t.Fatalf("ct=%q err=%v", ct, err)
	}
	b, _ := io.ReadAll(body)
	var m map[string]any
	if json.Unmarshal(b, &m) != nil || m["prompt"] != "a cat" || m["width"] != nil {
		t.Fatalf("unexpected json body %s", b)
	}
}
