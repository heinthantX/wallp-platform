package api_test

import (
	"net/http"
	"testing"

	"github.com/heinthant/wallp-backend/internal/api"
)

// P7: /ai/status reports env presence per provider; a partial key pair is not configured.
func TestAIStatus(t *testing.T) {
	keys := []string{"OPENROUTER_API_KEY", "CLOUDFLARE_ACCOUNT_ID", "CLOUDFLARE_AI_TOKEN", "GEMINI_API_KEY"}
	cases := []struct {
		name string
		env  map[string]string
		want map[string]bool
		any  bool
	}{
		{"no env", nil, map[string]bool{"openrouter": false, "cloudflare": false, "gemini": false}, false},
		{"one key", map[string]string{"GEMINI_API_KEY": "x"}, map[string]bool{"openrouter": false, "cloudflare": false, "gemini": true}, true},
		{"partial cloudflare", map[string]string{"CLOUDFLARE_ACCOUNT_ID": "x"}, map[string]bool{"openrouter": false, "cloudflare": false, "gemini": false}, false},
	}
	s := newServer(t)
	toks := setupRoleUsers(t, s)
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			for _, k := range keys {
				t.Setenv(k, c.env[k])
			}
			status, body := s.do(t, "GET", "/admin/v1/ai/status", toks.viewer, nil)
			if status != http.StatusOK {
				t.Fatalf("status %d %v", status, body)
			}
			if body["anyConfigured"] != c.any {
				t.Fatalf("anyConfigured = %v, want %v", body["anyConfigured"], c.any)
			}
			for _, p := range body["providers"].([]any) {
				m := p.(map[string]any)
				if m["configured"] != c.want[m["id"].(string)] {
					t.Fatalf("%s configured = %v", m["id"], m["configured"])
				}
				for _, k := range m["envKeys"].([]any) {
					if v := c.env[k.(string)]; v != "" && containsValue(body, v) {
						t.Fatal("response leaks an env value")
					}
				}
			}
		})
	}

	t.Run("needs login", func(t *testing.T) {
		if status, _ := s.do(t, "GET", "/admin/v1/ai/status", "", nil); status != http.StatusUnauthorized {
			t.Fatalf("status %d, want 401", status)
		}
	})
}

func containsValue(v any, needle string) bool {
	switch x := v.(type) {
	case string:
		return x == needle
	case []any:
		for _, e := range x {
			if containsValue(e, needle) {
				return true
			}
		}
	case map[string]any:
		for _, e := range x {
			if containsValue(e, needle) {
				return true
			}
		}
	}
	return false
}

func TestAINotConfigured(t *testing.T) {
	e := api.AINotConfigured("cloudflare")
	if e.GetStatus() != http.StatusNotImplemented || e.Err.Code != "ai_not_configured" {
		t.Fatalf("got %d %s", e.GetStatus(), e.Err.Code)
	}
	if len(e.Err.Details) != 2 || e.Err.Details[0].Field != "CLOUDFLARE_ACCOUNT_ID" || e.Err.Details[1].Field != "CLOUDFLARE_AI_TOKEN" {
		t.Fatalf("details %v", e.Err.Details)
	}
}
