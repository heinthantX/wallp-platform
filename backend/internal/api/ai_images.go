package api

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mime/multipart"
	"net"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/danielgtaylor/huma/v2"

	"github.com/heinthant/wallp-backend/internal/apierr"
	"github.com/heinthant/wallp-backend/internal/auth"
	"github.com/heinthant/wallp-backend/internal/model"
)

var (
	aiImageContextTimeout = 90 * time.Second
	aiImageClientTimeout  = 95 * time.Second
)

type AIImagesInput struct {
	Body struct {
		Prompt  string `json:"prompt" minLength:"1" maxLength:"1000" doc:"Image generation prompt"`
		Purpose string `json:"purpose,omitempty" enum:"icon,wallpaper,art" default:"art" doc:"Image purpose"`
		Steps   int    `json:"steps,omitempty" minimum:"1" maximum:"8" default:"4" doc:"Inference steps"`
		Seed    *int   `json:"seed,omitempty" doc:"Random seed"`
	}
}

type AIImagesResult struct {
	Asset  UploadAssetResult `json:"asset"`
	Model  string            `json:"model" example:"@cf/black-forest-labs/flux-2-klein-9b"`
	Prompt string            `json:"prompt"`
}

type AIImagesOutput struct {
	Body AIImagesResult
}

type cloudflareImageReq struct {
	Prompt string `json:"prompt"`
	Steps  int    `json:"steps"`
	Seed   *int   `json:"seed,omitempty"`
}

type cloudflareError struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
}

type cloudflareImageResp struct {
	Result struct {
		Image string `json:"image"`
	} `json:"result"`
	Success bool              `json:"success"`
	Errors  []cloudflareError `json:"errors"`
}

func registerAIImages(h huma.API, d *Deps) {
	huma.Register(h, auth.Admin(huma.Operation{
		OperationID: "ai-images",
		Method:      http.MethodPost,
		Path:        adminPrefix + "/ai/images",
		Summary:     "Generate an image via Cloudflare Workers AI",
		Tags:        []string{"AI"},
	}, model.RoleDesigner), func(ctx context.Context, input *AIImagesInput) (*AIImagesOutput, error) {
		actor := "system"
		if me := auth.From(ctx); me != nil {
			actor = me.Name
		}

		res, err := generateAIImage(ctx, d, input.Body.Prompt, input.Body.Purpose, input.Body.Steps, input.Body.Seed, actor)
		if err != nil {
			return nil, err
		}
		return &AIImagesOutput{Body: *res}, nil
	})
}

func generateAIImage(ctx context.Context, d *Deps, prompt, purpose string, steps int, seed *int, actor string) (*AIImagesResult, error) {
	accountID := strings.TrimSpace(os.Getenv("CLOUDFLARE_ACCOUNT_ID"))
	aiToken := strings.TrimSpace(os.Getenv("CLOUDFLARE_AI_TOKEN"))
	if accountID == "" || aiToken == "" {
		return nil, aiNotConfigured("cloudflare")
	}

	purpose = strings.TrimSpace(purpose)
	if purpose == "" {
		purpose = "art"
	}
	if steps <= 0 {
		steps = 4
	}

	finalPrompt := strings.TrimSpace(prompt)
	switch purpose {
	case "icon":
		finalPrompt = "Square app icon, single centered flat glyph, no text, no letters, no logos, solid background, 66% safe area. " + finalPrompt
	case "wallpaper":
		finalPrompt = "Phone wallpaper art, rich, no text, no logos, keep the middle third calm for a clock. " + finalPrompt
	}

	baseURL := strings.TrimRight(strings.TrimSpace(os.Getenv("CLOUDFLARE_API_BASE")), "/")
	if baseURL == "" {
		baseURL = "https://api.cloudflare.com/client/v4"
	}

	modelName := strings.TrimSpace(os.Getenv("CLOUDFLARE_IMAGE_MODEL"))
	if modelName == "" {
		modelName = "@cf/black-forest-labs/flux-2-klein-9b"
	}

	body, contentType, err := cloudflareImageBody(modelName, finalPrompt, purpose, steps, seed)
	if err != nil {
		return nil, apierr.New(http.StatusBadGateway, "ai_upstream_error", "Failed to encode upstream request")
	}

	url := fmt.Sprintf("%s/accounts/%s/ai/run/%s", baseURL, accountID, modelName)

	reqCtx, cancel := context.WithTimeout(ctx, aiImageContextTimeout)
	defer cancel()

	httpClient := &http.Client{
		Timeout: aiImageClientTimeout,
	}

	req, err := http.NewRequestWithContext(reqCtx, http.MethodPost, url, body)
	if err != nil {
		return nil, apierr.New(http.StatusBadGateway, "ai_upstream_error", "Failed to create upstream request")
	}

	req.Header.Set("Authorization", "Bearer "+aiToken)
	req.Header.Set("Content-Type", contentType)

	resp, err := httpClient.Do(req)
	if err != nil {
		if errors.Is(err, context.DeadlineExceeded) || errors.Is(reqCtx.Err(), context.DeadlineExceeded) || os.IsTimeout(err) {
			return nil, apierr.New(http.StatusGatewayTimeout, "ai_timeout", "Cloudflare took too long, try again.")
		}
		var netErr net.Error
		if errors.As(err, &netErr) && netErr.Timeout() {
			return nil, apierr.New(http.StatusGatewayTimeout, "ai_timeout", "Cloudflare took too long, try again.")
		}
		return nil, apierr.New(http.StatusBadGateway, "ai_upstream_error", "Cloudflare connection failed")
	}
	defer resp.Body.Close()

	respBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		if errors.Is(err, context.DeadlineExceeded) || errors.Is(reqCtx.Err(), context.DeadlineExceeded) || os.IsTimeout(err) {
			return nil, apierr.New(http.StatusGatewayTimeout, "ai_timeout", "Cloudflare took too long, try again.")
		}
		var netErr net.Error
		if errors.As(err, &netErr) && netErr.Timeout() {
			return nil, apierr.New(http.StatusGatewayTimeout, "ai_timeout", "Cloudflare took too long, try again.")
		}
		return nil, apierr.New(http.StatusBadGateway, "ai_upstream_error", "Failed to read Cloudflare response")
	}

	if resp.StatusCode == http.StatusTooManyRequests {
		return nil, apierr.New(http.StatusTooManyRequests, "ai_rate_limited", "Cloudflare free image limit reached for today (resets 00:00 UTC).")
	}
	if resp.StatusCode == http.StatusUnauthorized || resp.StatusCode == http.StatusForbidden {
		return nil, apierr.New(http.StatusBadGateway, "ai_upstream_auth", "Cloudflare rejected the token: check CLOUDFLARE_AI_TOKEN has Workers AI permission.")
	}

	var cfResp cloudflareImageResp
	_ = json.Unmarshal(respBytes, &cfResp)

	for _, e := range cfResp.Errors {
		if e.Code == 4006 {
			return nil, apierr.New(http.StatusTooManyRequests, "ai_rate_limited", "Cloudflare free image limit reached for today (resets 00:00 UTC).")
		}
	}

	if resp.StatusCode < 200 || resp.StatusCode >= 300 || !cfResp.Success {
		return nil, apierr.New(http.StatusBadGateway, "ai_upstream_error", fmt.Sprintf("Cloudflare returned %d", resp.StatusCode))
	}

	trimmedImage := strings.TrimSpace(cfResp.Result.Image)
	if trimmedImage == "" {
		return nil, apierr.New(http.StatusBadGateway, "ai_bad_output", "The model did not return usable image data, try again.")
	}

	imgData, err := base64.StdEncoding.DecodeString(trimmedImage)
	if err != nil || len(imgData) == 0 {
		return nil, apierr.New(http.StatusBadGateway, "ai_bad_output", "The model did not return usable image data, try again.")
	}

	assetRes, err := ingestAssetBytes(ctx, d, imgData, purpose == "wallpaper", actor)
	if err != nil {
		return nil, err
	}

	return &AIImagesResult{
		Asset:  assetRes,
		Model:  modelName,
		Prompt: finalPrompt,
	}, nil
}

// aiImageSizes is the output size per purpose; wallpapers are portrait phone screens.
var aiImageSizes = map[string][2]int{"icon": {512, 512}, "wallpaper": {768, 1664}, "art": {1024, 1024}}

// cloudflareImageBody builds the request: FLUX.2 models take a multipart form
// with a size, older ones (flux-1-schnell) take JSON and always return 1024².
func cloudflareImageBody(model, prompt, purpose string, steps int, seed *int) (io.Reader, string, error) {
	if !strings.HasPrefix(model, "@cf/black-forest-labs/flux-2") {
		b, err := json.Marshal(cloudflareImageReq{Prompt: prompt, Steps: steps, Seed: seed})
		return bytes.NewReader(b), "application/json", err
	}
	size := aiImageSizes[purpose]
	var buf bytes.Buffer
	w := multipart.NewWriter(&buf)
	fields := [][2]string{{"prompt", prompt}, {"width", strconv.Itoa(size[0])}, {"height", strconv.Itoa(size[1])}, {"steps", strconv.Itoa(steps)}}
	if seed != nil {
		fields = append(fields, [2]string{"seed", strconv.Itoa(*seed)})
	}
	for _, f := range fields {
		if err := w.WriteField(f[0], f[1]); err != nil {
			return nil, "", err
		}
	}
	if err := w.Close(); err != nil {
		return nil, "", err
	}
	return &buf, w.FormDataContentType(), nil
}
