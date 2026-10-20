package api_test

import (
	"encoding/base64"
	"encoding/json"
	"image/color"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/heinthant/wallp-backend/internal/assets"
	"github.com/heinthant/wallp-backend/internal/catalog"
)

func TestAIScene_NotConfigured(t *testing.T) {
	t.Setenv("OPENROUTER_API_KEY", "")

	s := newServer(t)
	toks := setupRoleUsers(t, s)

	status, body := s.do(t, "POST", "/admin/v1/ai/scene", toks.designer, map[string]any{
		"description": "Dreamy pastel sunset",
	})
	if status != http.StatusNotImplemented {
		t.Fatalf("status = %d, want 501; body = %v", status, body)
	}
	errObj, ok := body["error"].(map[string]any)
	if !ok || errObj["code"] != "ai_not_configured" {
		t.Fatalf("expected ai_not_configured error, got %v", body["error"])
	}
}

func TestAIScene_ViewerForbidden(t *testing.T) {
	t.Setenv("OPENROUTER_API_KEY", "test-key")

	s := newServer(t)
	toks := setupRoleUsers(t, s)

	status, _ := s.do(t, "POST", "/admin/v1/ai/scene", toks.viewer, map[string]any{
		"description": "Dreamy pastel sunset",
	})
	if status != http.StatusForbidden {
		t.Fatalf("status = %d, want 403", status)
	}
}

func TestAIScene_SuccessWithArt(t *testing.T) {
	// 1. Fake OpenRouter server
	fakeOpenRouter := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		resp := map[string]any{
			"model": "meta-llama/llama-3.2-3b-instruct:free",
			"choices": []any{
				map[string]any{
					"message": map[string]any{
						"role": "assistant",
						"content": `{
							"name": "Pastel Sunset",
							"artPrompt": "Dreamy soft pastel clouds with a warm glowing sun",
							"layers": [
								{
									"type": "gradient",
									"colors": ["#FFAA88", "#553366"],
									"angle": 90,
									"opacity": "0.9"
								},
								{
									"type": "shape",
									"shape": "circle",
									"x": "0.5",
									"y": "0.4",
									"width": "0.6",
									"aspect": 1.0,
									"color": "#FFEEAA",
									"glow": true
								}
							]
						}`,
					},
				},
			},
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(resp)
	}))
	defer fakeOpenRouter.Close()

	// 2. Fake Cloudflare server for art generation
	fakePNG, err := assets.GenerateTestPNG(64, 64, color.RGBA{R: 255, G: 128, B: 64, A: 255})
	if err != nil {
		t.Fatalf("failed to generate test png: %v", err)
	}
	fakeB64 := base64.StdEncoding.EncodeToString(fakePNG)

	fakeCF := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"result": map[string]any{
				"image": fakeB64,
			},
			"success": true,
		})
	}))
	defer fakeCF.Close()

	t.Setenv("OPENROUTER_BASE_URL", fakeOpenRouter.URL)
	t.Setenv("OPENROUTER_API_KEY", "test-router-key")
	t.Setenv("CLOUDFLARE_API_BASE", fakeCF.URL)
	t.Setenv("CLOUDFLARE_ACCOUNT_ID", "test-account")
	t.Setenv("CLOUDFLARE_AI_TOKEN", "test-token")

	s := newServer(t)
	toks := setupRoleUsers(t, s)

	status, body := s.do(t, "POST", "/admin/v1/ai/scene", toks.designer, map[string]any{
		"description": "Dreamy pastel sunset",
		"palette":     []string{"#FFAA88", "#553366", "#FFEEAA"},
		"withArt":     true,
	})
	if status != http.StatusOK {
		t.Fatalf("status = %d, want 200; body = %v", status, body)
	}

	if body["artSkipped"] != false {
		t.Fatalf("expected artSkipped=false, got %v", body["artSkipped"])
	}
	if body["name"] != "Pastel Sunset" {
		t.Fatalf("expected name 'Pastel Sunset', got %v", body["name"])
	}
	if body["artPrompt"] != "Dreamy soft pastel clouds with a warm glowing sun" {
		t.Fatalf("unexpected artPrompt: %v", body["artPrompt"])
	}

	sceneMap, ok := body["scene"].(map[string]any)
	if !ok {
		t.Fatalf("missing scene in response: %v", body)
	}
	paramsMap, ok := sceneMap["params"].(map[string]any)
	if !ok {
		t.Fatalf("missing params in scene: %v", sceneMap)
	}
	layers, ok := paramsMap["layers"].([]any)
	if !ok || len(layers) != 3 {
		t.Fatalf("expected 3 layers (1 art + 2 generated), got %d (%v)", len(layers), layers)
	}

	// First layer must be the prepended image layer
	firstLayer, ok := layers[0].(map[string]any)
	if !ok || firstLayer["type"] != "image" {
		t.Fatalf("expected first layer to be type 'image', got %v", firstLayer)
	}
	imgObj, ok := firstLayer["image"].(map[string]any)
	if !ok || imgObj["url"] == "" || imgObj["sha256"] == "" {
		t.Fatalf("expected valid asset in first layer image: %v", firstLayer)
	}

	// Validate the entire scene with catalog validation
	sceneBytes, _ := json.Marshal(sceneMap)
	var catScene catalog.Scene
	if err := json.Unmarshal(sceneBytes, &catScene); err != nil {
		t.Fatalf("failed to unmarshal scene into catalog.Scene: %v", err)
	}
	fieldErrs := catScene.Validate(false, "scene")
	if len(fieldErrs) > 0 {
		t.Fatalf("catalog validation failed on generated scene: %v", fieldErrs)
	}
}

func TestAIScene_DropsInvalidLayer(t *testing.T) {
	fakeOpenRouter := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		resp := map[string]any{
			"model": "meta-llama/llama-3.2-3b-instruct:free",
			"choices": []any{
				map[string]any{
					"message": map[string]any{
						"role": "assistant",
						"content": `{
							"name": "Winter Forest",
							"artPrompt": "Snow covered pines",
							"layers": [
								{
									"type": "gradient",
									"colors": ["#112233", "#445566"],
									"angle": 180
								},
								{
									"type": "particles",
									"effect": "alien_blaster",
									"count": 50,
									"color": "#FFFFFF"
								},
								{
									"type": "particles",
									"effect": "snow",
									"count": 80,
									"color": "#FFFFFF",
									"speed": 0.3
								}
							]
						}`,
					},
				},
			},
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(resp)
	}))
	defer fakeOpenRouter.Close()

	t.Setenv("OPENROUTER_BASE_URL", fakeOpenRouter.URL)
	t.Setenv("OPENROUTER_API_KEY", "test-router-key")
	t.Setenv("CLOUDFLARE_ACCOUNT_ID", "")
	t.Setenv("CLOUDFLARE_AI_TOKEN", "")

	s := newServer(t)
	toks := setupRoleUsers(t, s)

	status, body := s.do(t, "POST", "/admin/v1/ai/scene", toks.reviewer, map[string]any{
		"description": "Winter forest snow",
		"withArt":     false,
	})
	if status != http.StatusOK {
		t.Fatalf("status = %d, want 200; body = %v", status, body)
	}

	sceneMap := body["scene"].(map[string]any)
	paramsMap := sceneMap["params"].(map[string]any)
	layers := paramsMap["layers"].([]any)

	// alien_blaster was invalid and dropped, keeping gradient and snow particles -> exactly 2 layers
	if len(layers) != 2 {
		t.Fatalf("expected 2 layers after dropping invalid one, got %d (%v)", len(layers), layers)
	}

	l0 := layers[0].(map[string]any)
	if l0["type"] != "gradient" {
		t.Fatalf("expected layer 0 to be gradient, got %v", l0["type"])
	}
	l1 := layers[1].(map[string]any)
	if l1["type"] != "particles" || l1["effect"] != "snow" {
		t.Fatalf("expected layer 1 to be snow particles, got %v", l1)
	}

	// Verify catalog validation passes
	sceneBytes, _ := json.Marshal(sceneMap)
	var catScene catalog.Scene
	if err := json.Unmarshal(sceneBytes, &catScene); err != nil {
		t.Fatalf("failed to unmarshal scene into catalog.Scene: %v", err)
	}
	fieldErrs := catScene.Validate(false, "scene")
	if len(fieldErrs) > 0 {
		t.Fatalf("catalog validation failed on dropped-layer scene: %v", fieldErrs)
	}
}

func TestAIScene_WithArtCloudflareUnset(t *testing.T) {
	fakeOpenRouter := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		resp := map[string]any{
			"model": "openrouter/free",
			"choices": []any{
				map[string]any{
					"message": map[string]any{
						"role": "assistant",
						"content": `{
							"name": "Amber Glow",
							"artPrompt": "Warm autumn embers",
							"layers": [
								{
									"type": "gradient",
									"colors": ["#331100", "#AA4400"]
								}
							]
						}`,
					},
				},
			},
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(resp)
	}))
	defer fakeOpenRouter.Close()

	t.Setenv("OPENROUTER_BASE_URL", fakeOpenRouter.URL)
	t.Setenv("OPENROUTER_API_KEY", "test-router-key")
	t.Setenv("CLOUDFLARE_ACCOUNT_ID", "")
	t.Setenv("CLOUDFLARE_AI_TOKEN", "")

	s := newServer(t)
	toks := setupRoleUsers(t, s)

	status, body := s.do(t, "POST", "/admin/v1/ai/scene", toks.designer, map[string]any{
		"description": "Warm autumn embers",
		"withArt":     true,
	})
	if status != http.StatusOK {
		t.Fatalf("status = %d, want 200; body = %v", status, body)
	}

	if body["artSkipped"] != true {
		t.Fatalf("expected artSkipped=true when cloudflare is unset, got %v", body["artSkipped"])
	}

	sceneMap := body["scene"].(map[string]any)
	paramsMap := sceneMap["params"].(map[string]any)
	layers := paramsMap["layers"].([]any)
	if len(layers) != 1 {
		t.Fatalf("expected 1 layer (no art image layer prepended), got %d", len(layers))
	}
	if layers[0].(map[string]any)["type"] != "gradient" {
		t.Fatalf("expected gradient layer, got %v", layers[0])
	}
}
