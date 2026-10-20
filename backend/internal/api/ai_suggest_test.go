package api_test

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"

	"github.com/heinthant/wallp-backend/internal/api"
)

func TestAISuggest_NoKey(t *testing.T) {
	api.ResetAISuggestCache()
	t.Cleanup(api.ResetAISuggestCache)
	t.Setenv("OPENROUTER_API_KEY", "")

	s := newServer(t)
	toks := setupRoleUsers(t, s)

	status, body := s.do(t, "POST", "/admin/v1/ai/suggest", toks.designer, map[string]any{
		"description": "Cozy autumn theme with warm colors",
	})
	if status != http.StatusNotImplemented {
		t.Fatalf("status = %d, want %d; body = %v", status, http.StatusNotImplemented, body)
	}
	errObj, ok := body["error"].(map[string]any)
	if !ok || errObj["code"] != "ai_not_configured" {
		t.Fatalf("got error = %v, want code ai_not_configured", body["error"])
	}
}

func TestAISuggest_ViewerForbidden(t *testing.T) {
	api.ResetAISuggestCache()
	t.Cleanup(api.ResetAISuggestCache)
	t.Setenv("OPENROUTER_API_KEY", "test-key")

	s := newServer(t)
	toks := setupRoleUsers(t, s)

	status, _ := s.do(t, "POST", "/admin/v1/ai/suggest", toks.viewer, map[string]any{
		"description": "Cozy autumn theme with warm colors",
	})
	if status != http.StatusForbidden {
		t.Fatalf("status = %d, want 403", status)
	}
}

func TestAISuggest_Success(t *testing.T) {
	api.ResetAISuggestCache()
	t.Cleanup(api.ResetAISuggestCache)

	fakeOpenRouter := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/chat/completions" {
			http.NotFound(w, r)
			return
		}
		if r.Header.Get("Authorization") != "Bearer test-openrouter-key" {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		if r.Header.Get("Content-Type") != "application/json" {
			http.Error(w, "bad content-type", http.StatusBadRequest)
			return
		}
		if r.Header.Get("HTTP-Referer") != "https://heinthantx.github.io/wallp-platform" {
			http.Error(w, "missing referer", http.StatusBadRequest)
			return
		}
		if r.Header.Get("X-Title") != "wallp admin" {
			http.Error(w, "missing x-title", http.StatusBadRequest)
			return
		}

		bodyBytes, _ := io.ReadAll(r.Body)
		var reqMap map[string]any
		_ = json.Unmarshal(bodyBytes, &reqMap)
		if reqMap["model"] != "openrouter/free" {
			http.Error(w, "unexpected model", http.StatusBadRequest)
			return
		}

		resp := map[string]any{
			"model": "meta-llama/llama-3.2-3b-instruct:free",
			"choices": []any{
				map[string]any{
					"message": map[string]any{
						"role": "assistant",
						"content": "```json\n" + `{
							"names": [
								{"en": "Autumn Glow", "my": "ဆောင်းဦးရောင်ခြည်"},
								{"en": "Golden Leaves", "my": "ရွှေရောင်သစ်ရွက်များ"},
								{"en": "Warm Cabin", "my": "နွေးထွေးသောအိမ်လေး"}
							],
							"subtitle": {"en": "Cozy vibes and amber light"},
							"tags": ["Fall Season", "COZY_WARM", "golden-amber", "nature"],
							"moodWords": ["warm", "cozy", "peaceful"]
						}` + "\n```",
					},
				},
			},
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(resp)
	}))
	defer fakeOpenRouter.Close()

	t.Setenv("OPENROUTER_BASE_URL", fakeOpenRouter.URL)
	t.Setenv("OPENROUTER_API_KEY", "test-openrouter-key")

	s := newServer(t)
	toks := setupRoleUsers(t, s)

	status, body := s.do(t, "POST", "/admin/v1/ai/suggest", toks.designer, map[string]any{
		"description": "Autumn season with cozy lights and falling leaves",
		"kind":        "theme",
	})
	if status != http.StatusOK {
		t.Fatalf("status = %d, want 200; body = %v", status, body)
	}

	names, ok := body["names"].([]any)
	if !ok || len(names) != 3 {
		t.Fatalf("unexpected names: %v", body["names"])
	}
	n0 := names[0].(map[string]any)
	if n0["en"] != "Autumn Glow" || n0["my"] != "ဆောင်းဦးရောင်ခြည်" {
		t.Fatalf("unexpected name[0]: %v", n0)
	}

	sub, ok := body["subtitle"].(map[string]any)
	if !ok || sub["en"] != "Cozy vibes and amber light" {
		t.Fatalf("unexpected subtitle: %v", body["subtitle"])
	}

	tags, ok := body["tags"].([]any)
	if !ok || len(tags) != 4 {
		t.Fatalf("unexpected tags: %v", body["tags"])
	}
	expectedTags := []string{"fall-season", "cozy-warm", "golden-amber", "nature"}
	for i, exp := range expectedTags {
		if tags[i].(string) != exp {
			t.Fatalf("tag[%d] = %v, want %v", i, tags[i], exp)
		}
	}

	moodWords, ok := body["moodWords"].([]any)
	if !ok || len(moodWords) != 3 {
		t.Fatalf("unexpected moodWords: %v", body["moodWords"])
	}

	if body["model"] != "meta-llama/llama-3.2-3b-instruct:free" {
		t.Fatalf("model = %v, want meta-llama/llama-3.2-3b-instruct:free", body["model"])
	}
}

func TestAISuggest_Upstream429(t *testing.T) {
	api.ResetAISuggestCache()
	t.Cleanup(api.ResetAISuggestCache)

	fakeOpenRouter := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, `{"error":{"message":"Rate limit exceeded"}}`, http.StatusTooManyRequests)
	}))
	defer fakeOpenRouter.Close()

	t.Setenv("OPENROUTER_BASE_URL", fakeOpenRouter.URL)
	t.Setenv("OPENROUTER_API_KEY", "test-key")

	s := newServer(t)
	toks := setupRoleUsers(t, s)

	status, body := s.do(t, "POST", "/admin/v1/ai/suggest", toks.designer, map[string]any{
		"description": "Any theme description",
	})
	if status != http.StatusTooManyRequests {
		t.Fatalf("status = %d, want 429; body = %v", status, body)
	}
	errObj, ok := body["error"].(map[string]any)
	if !ok || errObj["code"] != "ai_rate_limited" {
		t.Fatalf("got error = %v, want code ai_rate_limited", body["error"])
	}
	if errObj["message"] != "OpenRouter free limit reached. Free keys allow about 50 requests a day; try again after 00:00 UTC." {
		t.Fatalf("unexpected message: %v", errObj["message"])
	}
}

func TestAISuggest_Cache(t *testing.T) {
	api.ResetAISuggestCache()
	t.Cleanup(api.ResetAISuggestCache)

	var calls int64
	fakeOpenRouter := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt64(&calls, 1)
		resp := map[string]any{
			"model": "meta-llama/llama-3.2-3b-instruct:free",
			"choices": []any{
				map[string]any{
					"message": map[string]any{
						"role": "assistant",
						"content": `{"names":[{"en":"Cyber City","my":"ဆိုက်ဘာမြို့တော်"}],"subtitle":{"en":"Neon vibe"},"tags":["cyberpunk"],"moodWords":["electric"]}`,
					},
				},
			},
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(resp)
	}))
	defer fakeOpenRouter.Close()

	t.Setenv("OPENROUTER_BASE_URL", fakeOpenRouter.URL)
	t.Setenv("OPENROUTER_API_KEY", "test-key")

	s := newServer(t)
	toks := setupRoleUsers(t, s)

	reqPayload := map[string]any{
		"description": "Cyberpunk neon city night",
		"kind":        "theme",
	}

	// 1st request -> calls upstream
	status1, body1 := s.do(t, "POST", "/admin/v1/ai/suggest", toks.designer, reqPayload)
	if status1 != http.StatusOK {
		t.Fatalf("status1 = %d, want 200; body = %v", status1, body1)
	}
	if atomic.LoadInt64(&calls) != 1 {
		t.Fatalf("upstream calls = %d, want 1", atomic.LoadInt64(&calls))
	}

	// 2nd request with same input -> returns cached result without calling upstream
	status2, body2 := s.do(t, "POST", "/admin/v1/ai/suggest", toks.reviewer, reqPayload)
	if status2 != http.StatusOK {
		t.Fatalf("status2 = %d, want 200; body = %v", status2, body2)
	}
	if atomic.LoadInt64(&calls) != 1 {
		t.Fatalf("upstream calls after 2nd request = %d, want 1 (cache hit)", atomic.LoadInt64(&calls))
	}

	// Verify bodies match
	if body1["model"] != body2["model"] {
		t.Fatalf("body1 model %v != body2 model %v", body1["model"], body2["model"])
	}
}

func TestAISuggest_Upstream402(t *testing.T) {
	api.ResetAISuggestCache()
	t.Cleanup(api.ResetAISuggestCache)

	fakeOpenRouter := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, `{"error":{"message":"No credit"}}`, http.StatusPaymentRequired)
	}))
	defer fakeOpenRouter.Close()

	t.Setenv("OPENROUTER_BASE_URL", fakeOpenRouter.URL)
	t.Setenv("OPENROUTER_API_KEY", "test-key")

	s := newServer(t)
	toks := setupRoleUsers(t, s)

	status, body := s.do(t, "POST", "/admin/v1/ai/suggest", toks.designer, map[string]any{
		"description": "A minimalist theme",
	})
	if status != http.StatusPaymentRequired {
		t.Fatalf("status = %d, want 402; body = %v", status, body)
	}
	errObj, ok := body["error"].(map[string]any)
	if !ok || errObj["code"] != "ai_no_credit" {
		t.Fatalf("got error = %v, want code ai_no_credit", body["error"])
	}
	if errObj["message"] != "OpenRouter says the account has no credit (a negative balance blocks free models too)." {
		t.Fatalf("unexpected message: %v", errObj["message"])
	}
}

func TestAISuggest_BadOutput(t *testing.T) {
	api.ResetAISuggestCache()
	t.Cleanup(api.ResetAISuggestCache)

	fakeOpenRouter := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		resp := map[string]any{
			"model": "meta-llama/llama-3.2-3b-instruct:free",
			"choices": []any{
				map[string]any{
					"message": map[string]any{
						"role":    "assistant",
						"content": "I am an AI and I cannot generate names for this.",
					},
				},
			},
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(resp)
	}))
	defer fakeOpenRouter.Close()

	t.Setenv("OPENROUTER_BASE_URL", fakeOpenRouter.URL)
	t.Setenv("OPENROUTER_API_KEY", "test-key")

	s := newServer(t)
	toks := setupRoleUsers(t, s)

	status, body := s.do(t, "POST", "/admin/v1/ai/suggest", toks.designer, map[string]any{
		"description": "Something with bad response",
	})
	if status != http.StatusBadGateway {
		t.Fatalf("status = %d, want 502; body = %v", status, body)
	}
	errObj, ok := body["error"].(map[string]any)
	if !ok || errObj["code"] != "ai_bad_output" {
		t.Fatalf("got error = %v, want code ai_bad_output", body["error"])
	}
	if errObj["message"] != "The model did not return usable JSON, try again." {
		t.Fatalf("unexpected message: %v", errObj["message"])
	}
}

func TestAISuggest_Timeout(t *testing.T) {
	api.ResetAISuggestCache()
	t.Cleanup(api.ResetAISuggestCache)

	orig := *api.AISuggestContextTimeout
	*api.AISuggestContextTimeout = 30 * time.Millisecond
	t.Cleanup(func() { *api.AISuggestContextTimeout = orig })

	fakeOpenRouter := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		time.Sleep(100 * time.Millisecond)
		w.WriteHeader(http.StatusOK)
	}))
	defer fakeOpenRouter.Close()

	t.Setenv("OPENROUTER_BASE_URL", fakeOpenRouter.URL)
	t.Setenv("OPENROUTER_API_KEY", "test-key")

	s := newServer(t)
	toks := setupRoleUsers(t, s)

	status, body := s.do(t, "POST", "/admin/v1/ai/suggest", toks.designer, map[string]any{
		"description": "Timeout trigger test",
	})
	if status != http.StatusGatewayTimeout {
		t.Fatalf("status = %d, want 504; body = %v", status, body)
	}
	errObj, ok := body["error"].(map[string]any)
	if !ok || errObj["code"] != "ai_timeout" {
		t.Fatalf("got error = %v, want code ai_timeout", body["error"])
	}
	if errObj["message"] != "OpenRouter took too long, try again." {
		t.Fatalf("unexpected message: %v", errObj["message"])
	}
}

func TestAISuggest_UpstreamError(t *testing.T) {
	api.ResetAISuggestCache()
	t.Cleanup(api.ResetAISuggestCache)

	fakeOpenRouter := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "internal server error", http.StatusInternalServerError)
	}))
	defer fakeOpenRouter.Close()

	t.Setenv("OPENROUTER_BASE_URL", fakeOpenRouter.URL)
	t.Setenv("OPENROUTER_API_KEY", "test-key")

	s := newServer(t)
	toks := setupRoleUsers(t, s)

	status, body := s.do(t, "POST", "/admin/v1/ai/suggest", toks.designer, map[string]any{
		"description": "Server error trigger",
	})
	if status != http.StatusBadGateway {
		t.Fatalf("status = %d, want 502; body = %v", status, body)
	}
	errObj, ok := body["error"].(map[string]any)
	if !ok || errObj["code"] != "ai_upstream_error" {
		t.Fatalf("got error = %v, want code ai_upstream_error", body["error"])
	}
	if errObj["message"] != "OpenRouter returned 500" {
		t.Fatalf("unexpected message: %v, want 'OpenRouter returned 500'", errObj["message"])
	}
}

func TestAISuggest_RolesAndFiltering(t *testing.T) {
	api.ResetAISuggestCache()
	t.Cleanup(api.ResetAISuggestCache)

	fakeOpenRouter := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		resp := map[string]any{
			"model": "openrouter/free",
			"choices": []any{
				map[string]any{
					"message": map[string]any{
						"role": "assistant",
						"content": `{
							"names": [
								{"en": "One", "my": "၁"},
								{"en": "", "my": ""},
								{"en": "  ", "my": ""},
								{"en": "Two", "my": "၂"},
								{"en": "Three", "my": "၃"},
								{"en": "Four", "my": "၄"},
								{"en": "Five", "my": "၅"},
								{"en": "Six", "my": "၆"}
							],
							"subtitle": {"en": "Filtered subtitle"},
							"tags": ["tag1", "tag2", "tag3", "tag4", "tag5", "tag6", "tag7", "tag8", "tag9", "tag10"],
							"moodWords": ["m1", "m2", "m3", "m4", "m5", "m6", "m7"]
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
	t.Setenv("OPENROUTER_API_KEY", "test-key")

	s := newServer(t)
	toks := setupRoleUsers(t, s)

	// Reviewer role should succeed (200)
	status, body := s.do(t, "POST", "/admin/v1/ai/suggest", toks.reviewer, map[string]any{
		"description": "Capping test",
	})
	if status != http.StatusOK {
		t.Fatalf("reviewer status = %d, want 200; body = %v", status, body)
	}

	// Verify names capped at 5 and empty names dropped
	names := body["names"].([]any)
	if len(names) != 5 {
		t.Fatalf("names count = %d, want 5", len(names))
	}
	if names[0].(map[string]any)["en"] != "One" || names[1].(map[string]any)["en"] != "Two" {
		t.Fatalf("unexpected names: %v", names)
	}

	// Verify tags capped at 8
	tags := body["tags"].([]any)
	if len(tags) != 8 {
		t.Fatalf("tags count = %d, want 8", len(tags))
	}

	// Verify moodWords capped at 6
	moodWords := body["moodWords"].([]any)
	if len(moodWords) != 6 {
		t.Fatalf("moodWords count = %d, want 6", len(moodWords))
	}

	// Admin role should also succeed (200)
	statusAdmin, _ := s.do(t, "POST", "/admin/v1/ai/suggest", toks.admin, map[string]any{
		"description": "Admin test",
	})
	if statusAdmin != http.StatusOK {
		t.Fatalf("admin status = %d, want 200", statusAdmin)
	}
}
