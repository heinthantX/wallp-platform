package api

import (
	"context"
	"net/http"
	"os"
	"strings"

	"github.com/danielgtaylor/huma/v2"

	"github.com/heinthant/wallp-backend/internal/apierr"
	"github.com/heinthant/wallp-backend/internal/auth"
)

// AIProvider says whether one optional AI provider has its env keys. Values are never read out.
type AIProvider struct {
	ID         string   `json:"id" example:"cloudflare"`
	Kind       string   `json:"kind" enum:"text,image"`
	Configured bool     `json:"configured"`
	EnvKeys    []string `json:"envKeys"`
}

type AIStatus struct {
	AnyConfigured bool         `json:"anyConfigured"`
	Providers     []AIProvider `json:"providers"`
}

type AIStatusOutput struct{ Body AIStatus }

var aiProviders = []AIProvider{
	{ID: "openrouter", Kind: "text", EnvKeys: []string{"OPENROUTER_API_KEY"}},
	{ID: "cloudflare", Kind: "image", EnvKeys: []string{"CLOUDFLARE_ACCOUNT_ID", "CLOUDFLARE_AI_TOKEN"}},
	{ID: "gemini", Kind: "text", EnvKeys: []string{"GEMINI_API_KEY"}},
}

// aiConfigured is true only when every key of the provider is non-empty.
func aiConfigured(p AIProvider) bool {
	for _, k := range p.EnvKeys {
		if strings.TrimSpace(os.Getenv(k)) == "" {
			return false
		}
	}
	return true
}

func isProviderConfigured(id string) bool {
	for _, p := range aiProviders {
		if p.ID == id {
			return aiConfigured(p)
		}
	}
	return false
}

func aiStatus() AIStatus {
	st := AIStatus{Providers: make([]AIProvider, len(aiProviders))}
	for i, p := range aiProviders {
		p.Configured = aiConfigured(p)
		st.AnyConfigured = st.AnyConfigured || p.Configured
		st.Providers[i] = p
	}
	return st
}

// aiNotConfigured is the 501 every AI endpoint returns while its provider has no keys.
// Unused until the first provider ships (docs/specs/ai-creation.md).
func aiNotConfigured(id string) *apierr.Error {
	e := apierr.New(http.StatusNotImplemented, "ai_not_configured", "AI is off. Use Copy prompt kit, or set these keys.")
	for _, p := range aiProviders {
		if p.ID == id {
			if p.Kind == "image" {
				e.Err.Message = "Image generation is off. Use Copy prompt kit, or set these keys."
			}
			for _, k := range p.EnvKeys {
				e.Err.Details = append(e.Err.Details, apierr.Detail{Field: k, Message: k + " is not set"})
			}
		}
	}
	return e
}

func registerAI(h huma.API, d *Deps) {
	huma.Register(h, auth.Admin(huma.Operation{
		OperationID: "ai-status",
		Method:      http.MethodGet,
		Path:        adminPrefix + "/ai/status",
		Summary:     "Which optional AI providers have their env keys",
		Description: "Booleans and env key names only, never values. Any dashboard role may read it.",
		Tags:        []string{"AI"},
	}), func(ctx context.Context, _ *struct{}) (*AIStatusOutput, error) {
		return &AIStatusOutput{Body: aiStatus()}, nil
	})
	registerAISuggest(h)
	registerAIImages(h, d)
	registerAIScene(h, d)
}
