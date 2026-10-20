package api

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/danielgtaylor/huma/v2"

	"github.com/heinthant/wallp-backend/internal/apierr"
	"github.com/heinthant/wallp-backend/internal/auth"
	"github.com/heinthant/wallp-backend/internal/model"
)

type AISuggestInput struct {
	Body struct {
		Description string `json:"description" minLength:"1" maxLength:"500" doc:"Theme, icon pack, wallpaper or font description"`
		Kind        string `json:"kind,omitempty" enum:"iconPack,theme,wallpaper,font" default:"theme" doc:"Catalog item kind"`
	}
}

type AISuggestName struct {
	En string `json:"en" example:"Autumn Whisper"`
	My string `json:"my" example:"ဆောင်းဦးတီးတိုးသံ"`
}

type AISuggestSubtitle struct {
	En string `json:"en" example:"Warm amber tones and cozy vibes"`
}

type AISuggestResult struct {
	Names     []AISuggestName   `json:"names" minItems:"1" maxItems:"5"`
	Subtitle  AISuggestSubtitle `json:"subtitle"`
	Tags      []string          `json:"tags" maxItems:"8"`
	MoodWords []string          `json:"moodWords" maxItems:"6"`
	Model     string            `json:"model" example:"openrouter/free"`
}

type AISuggestOutput struct {
	Body AISuggestResult
}

type aiSuggestCacheEntry struct {
	result    AISuggestResult
	createdAt time.Time
}

var (
	aiSuggestMu    sync.Mutex
	aiSuggestCache = make(map[string]aiSuggestCacheEntry)

	aiSuggestContextTimeout = 15 * time.Second
	aiSuggestClientTimeout  = 20 * time.Second
)

const (
	aiSuggestTTL      = 24 * time.Hour
	aiSuggestMaxCache = 200
)

func cloneAISuggestResult(r AISuggestResult) AISuggestResult {
	cp := r
	if r.Names != nil {
		cp.Names = make([]AISuggestName, len(r.Names))
		copy(cp.Names, r.Names)
	}
	if r.Tags != nil {
		cp.Tags = make([]string, len(r.Tags))
		copy(cp.Tags, r.Tags)
	}
	if r.MoodWords != nil {
		cp.MoodWords = make([]string, len(r.MoodWords))
		copy(cp.MoodWords, r.MoodWords)
	}
	return cp
}

func getAISuggestCache(key string) (AISuggestResult, bool) {
	aiSuggestMu.Lock()
	defer aiSuggestMu.Unlock()

	entry, ok := aiSuggestCache[key]
	if !ok {
		return AISuggestResult{}, false
	}
	if time.Since(entry.createdAt) > aiSuggestTTL {
		delete(aiSuggestCache, key)
		return AISuggestResult{}, false
	}
	return cloneAISuggestResult(entry.result), true
}

func putAISuggestCache(key string, res AISuggestResult) {
	aiSuggestMu.Lock()
	defer aiSuggestMu.Unlock()

	now := time.Now()
	if _, exists := aiSuggestCache[key]; exists {
		aiSuggestCache[key] = aiSuggestCacheEntry{
			result:    cloneAISuggestResult(res),
			createdAt: now,
		}
		return
	}

	for k, v := range aiSuggestCache {
		if now.Sub(v.createdAt) > aiSuggestTTL {
			delete(aiSuggestCache, k)
		}
	}

	for len(aiSuggestCache) >= aiSuggestMaxCache {
		var oldestKey string
		var oldestTime time.Time
		first := true
		for k, v := range aiSuggestCache {
			if first || v.createdAt.Before(oldestTime) {
				oldestKey = k
				oldestTime = v.createdAt
				first = false
			}
		}
		if oldestKey != "" {
			delete(aiSuggestCache, oldestKey)
		} else {
			break
		}
	}

	aiSuggestCache[key] = aiSuggestCacheEntry{
		result:    cloneAISuggestResult(res),
		createdAt: now,
	}
}

func resetAISuggestCache() {
	aiSuggestMu.Lock()
	defer aiSuggestMu.Unlock()
	aiSuggestCache = make(map[string]aiSuggestCacheEntry)
}

func aiSuggestCacheKey(kind, description string) string {
	h := sha256.Sum256([]byte(kind + "\n" + description))
	return hex.EncodeToString(h[:])
}

func stripCodeFences(s string) string {
	s = strings.TrimSpace(s)
	if start := strings.Index(s, "```"); start != -1 {
		rest := s[start+3:]
		if nl := strings.Index(rest, "\n"); nl != -1 {
			rest = rest[nl+1:]
		} else if idx := strings.Index(rest, "{"); idx != -1 {
			rest = rest[idx:]
		}
		if end := strings.LastIndex(rest, "```"); end != -1 {
			rest = rest[:end]
		}
		return strings.TrimSpace(rest)
	}
	return s
}

const aiSuggestSystemPrompt = `you name phone themes / icon packs for the wallp Android app; reply with ONLY a JSON object of the exact output shape (without model); names short (1-3 words), "my" is the Burmese name; tags kebab-case; never use brand or trademark names.`

type openRouterReqMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type openRouterReqBody struct {
	Model          string                 `json:"model"`
	Messages       []openRouterReqMessage `json:"messages"`
	ResponseFormat struct {
		Type string `json:"type"`
	} `json:"response_format"`
	Temperature float64 `json:"temperature"`
}

type openRouterRespChoice struct {
	Message struct {
		Role    string `json:"role"`
		Content string `json:"content"`
	} `json:"message"`
}

type openRouterRespBody struct {
	Model   string                 `json:"model"`
	Choices []openRouterRespChoice `json:"choices"`
}

type rawSuggestOutput struct {
	Names []struct {
		En string `json:"en"`
		My string `json:"my"`
	} `json:"names"`
	Subtitle struct {
		En string `json:"en"`
	} `json:"subtitle"`
	Tags      []string `json:"tags"`
	MoodWords []string `json:"moodWords"`
}

func registerAISuggest(h huma.API) {
	huma.Register(h, auth.Admin(huma.Operation{
		OperationID: "ai-suggest",
		Method:      http.MethodPost,
		Path:        adminPrefix + "/ai/suggest",
		Summary:     "Suggest names, subtitle, tags and mood words from a description",
		Tags:        []string{"AI"},
	}, model.RoleDesigner, model.RoleReviewer), func(ctx context.Context, input *AISuggestInput) (*AISuggestOutput, error) {
		apiKey := strings.TrimSpace(os.Getenv("OPENROUTER_API_KEY"))
		if apiKey == "" {
			return nil, aiNotConfigured("openrouter")
		}

		kind := strings.TrimSpace(input.Body.Kind)
		if kind == "" {
			kind = "theme"
		}
		description := strings.TrimSpace(input.Body.Description)

		cacheKey := aiSuggestCacheKey(kind, description)
		if cached, ok := getAISuggestCache(cacheKey); ok {
			return &AISuggestOutput{Body: cached}, nil
		}

		baseURL := strings.TrimRight(strings.TrimSpace(os.Getenv("OPENROUTER_BASE_URL")), "/")
		if baseURL == "" {
			baseURL = "https://openrouter.ai/api/v1"
		}

		modelName := strings.TrimSpace(os.Getenv("OPENROUTER_MODEL"))
		if modelName == "" {
			modelName = "openrouter/free"
		}

		reqBody := openRouterReqBody{
			Model: modelName,
			Messages: []openRouterReqMessage{
				{Role: "system", Content: aiSuggestSystemPrompt},
				{Role: "user", Content: fmt.Sprintf("Kind: %s\nDescription: %s", kind, description)},
			},
			Temperature: 0.8,
		}
		reqBody.ResponseFormat.Type = "json_object"

		reqBytes, err := json.Marshal(reqBody)
		if err != nil {
			return nil, apierr.New(http.StatusBadGateway, "ai_upstream_error", "Failed to encode upstream request")
		}

		reqCtx, cancel := context.WithTimeout(ctx, aiSuggestContextTimeout)
		defer cancel()

		httpClient := &http.Client{
			Timeout: aiSuggestClientTimeout,
		}

		req, err := http.NewRequestWithContext(reqCtx, http.MethodPost, baseURL+"/chat/completions", bytes.NewReader(reqBytes))
		if err != nil {
			return nil, apierr.New(http.StatusBadGateway, "ai_upstream_error", "Failed to create upstream request")
		}

		req.Header.Set("Authorization", "Bearer "+apiKey)
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("HTTP-Referer", "https://heinthantx.github.io/wallp-platform")
		req.Header.Set("X-Title", "wallp admin")

		resp, err := httpClient.Do(req)
		if err != nil {
			if errors.Is(err, context.DeadlineExceeded) || errors.Is(reqCtx.Err(), context.DeadlineExceeded) || os.IsTimeout(err) {
				return nil, apierr.New(http.StatusGatewayTimeout, "ai_timeout", "OpenRouter took too long, try again.")
			}
			var netErr net.Error
			if errors.As(err, &netErr) && netErr.Timeout() {
				return nil, apierr.New(http.StatusGatewayTimeout, "ai_timeout", "OpenRouter took too long, try again.")
			}
			return nil, apierr.New(http.StatusBadGateway, "ai_upstream_error", "OpenRouter connection failed")
		}
		defer resp.Body.Close()

		respBytes, err := io.ReadAll(resp.Body)
		if err != nil {
			if errors.Is(err, context.DeadlineExceeded) || errors.Is(reqCtx.Err(), context.DeadlineExceeded) || os.IsTimeout(err) {
				return nil, apierr.New(http.StatusGatewayTimeout, "ai_timeout", "OpenRouter took too long, try again.")
			}
			var netErr net.Error
			if errors.As(err, &netErr) && netErr.Timeout() {
				return nil, apierr.New(http.StatusGatewayTimeout, "ai_timeout", "OpenRouter took too long, try again.")
			}
			return nil, apierr.New(http.StatusBadGateway, "ai_upstream_error", "Failed to read OpenRouter response")
		}

		if resp.StatusCode == http.StatusTooManyRequests {
			return nil, apierr.New(http.StatusTooManyRequests, "ai_rate_limited", "OpenRouter free limit reached. Free keys allow about 50 requests a day; try again after 00:00 UTC.")
		}
		if resp.StatusCode == http.StatusPaymentRequired {
			return nil, apierr.New(http.StatusPaymentRequired, "ai_no_credit", "OpenRouter says the account has no credit (a negative balance blocks free models too).")
		}
		if resp.StatusCode < 200 || resp.StatusCode >= 300 {
			return nil, apierr.New(http.StatusBadGateway, "ai_upstream_error", fmt.Sprintf("OpenRouter returned %d", resp.StatusCode))
		}

		var orResp openRouterRespBody
		if err := json.Unmarshal(respBytes, &orResp); err != nil {
			return nil, apierr.New(http.StatusBadGateway, "ai_bad_output", "The model did not return usable JSON, try again.")
		}
		if len(orResp.Choices) == 0 {
			return nil, apierr.New(http.StatusBadGateway, "ai_bad_output", "The model did not return usable JSON, try again.")
		}

		cleaned := stripCodeFences(orResp.Choices[0].Message.Content)

		var raw rawSuggestOutput
		if err := json.Unmarshal([]byte(cleaned), &raw); err != nil {
			return nil, apierr.New(http.StatusBadGateway, "ai_bad_output", "The model did not return usable JSON, try again.")
		}

		var names []AISuggestName
		for _, n := range raw.Names {
			en := strings.TrimSpace(n.En)
			my := strings.TrimSpace(n.My)
			if en == "" && my == "" {
				continue
			}
			if en == "" {
				en = my
			}
			names = append(names, AISuggestName{En: en, My: my})
		}
		if len(names) < 1 {
			return nil, apierr.New(http.StatusBadGateway, "ai_bad_output", "The model did not return usable JSON, try again.")
		}
		if len(names) > 5 {
			names = names[:5]
		}

		var tags []string
		seenTags := make(map[string]bool)
		for _, t := range raw.Tags {
			k := toKebabCase(t)
			if k == "" || seenTags[k] {
				continue
			}
			seenTags[k] = true
			tags = append(tags, k)
			if len(tags) == 8 {
				break
			}
		}
		if tags == nil {
			tags = []string{}
		}

		var moodWords []string
		for _, mw := range raw.MoodWords {
			trimmed := strings.TrimSpace(mw)
			if trimmed == "" {
				continue
			}
			moodWords = append(moodWords, trimmed)
			if len(moodWords) == 6 {
				break
			}
		}
		if moodWords == nil {
			moodWords = []string{}
		}

		respModel := strings.TrimSpace(orResp.Model)
		if respModel == "" {
			respModel = modelName
		}

		result := AISuggestResult{
			Names:     names,
			Subtitle:  AISuggestSubtitle{En: strings.TrimSpace(raw.Subtitle.En)},
			Tags:      tags,
			MoodWords: moodWords,
			Model:     respModel,
		}

		putAISuggestCache(cacheKey, result)

		return &AISuggestOutput{Body: result}, nil
	})
}
