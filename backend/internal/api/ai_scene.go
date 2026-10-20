package api

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/danielgtaylor/huma/v2"

	"github.com/heinthant/wallp-backend/internal/apierr"
	"github.com/heinthant/wallp-backend/internal/auth"
	"github.com/heinthant/wallp-backend/internal/catalog"
	"github.com/heinthant/wallp-backend/internal/model"
)

var (
	aiSceneContextTimeout = 30 * time.Second
)

const aiSceneSystemPrompt = `You design phone wallpaper scenes using the "layers" engine for wallp, an Android launcher app.
Reply with ONLY one JSON object, no prose, in exactly this shape:
{"name":"Scene Name","artPrompt":"descriptive prompt for background wallpaper art","layers":[...]}

Rules:
- 2 to 6 layers total, ordered from bottom to top.
- When a palette is given, choose colors from that palette. Every color must be in "#RRGGBB" hex format.
- Do NOT generate any "image" layers (art is generated and added separately).
- Allowed layer types and their fields:
  1. "gradient":
     - type: "gradient" (required)
     - colors: array of at least 2 "#RRGGBB" hex strings (required)
     - angle: integer degrees (optional, e.g. 0, 45, 90, 180)
     - opacity: float 0.0 to 1.0 (optional)
  2. "shape":
     - type: "shape" (required)
     - shape: "circle" | "ellipse" | "rect" | "polygon" (required)
     - x: float between -0.5 and 1.5 (required)
     - y: float between -0.5 and 1.5 (required)
     - width: float > 0 and <= 3.0 (required)
     - aspect: float > 0 and <= 10.0 (optional)
     - color: "#RRGGBB" hex string (required)
     - glow: boolean (optional)
     - motion: "none" | "float" | "pulse" | "sway" (optional)
     - points: array of [x, y] in 0.0 to 1.0 (optional; if shape is "polygon", at least 3 points required)
     - opacity: float 0.0 to 1.0 (optional)
  3. "particles":
     - type: "particles" (required)
     - effect: "snow" | "rain" | "drops" | "bats" | "lanterns" | "petals" | "sparkles" | "stars" (required)
     - count: integer between 1 and 150 (required)
     - color: "#RRGGBB" hex string (required)
     - speed: float between 0.0 and 1.0 (optional)
     - size: float > 0 and <= 1.0 (optional)
     - opacity: float 0.0 to 1.0 (optional)`

type AISceneInput struct {
	Body struct {
		Description string   `json:"description" minLength:"1" maxLength:"500" doc:"Theme or wallpaper description"`
		Palette     []string `json:"palette,omitempty" maxItems:"6" doc:"Up to 6 #RRGGBB hex colors"`
		WithArt     *bool    `json:"withArt,omitempty" default:"true" doc:"Generate wallpaper art via Cloudflare if configured"`
	}
}

type AISceneResult struct {
	Scene      catalog.Scene `json:"scene"`
	Name       string        `json:"name"`
	ArtPrompt  string        `json:"artPrompt"`
	ArtSkipped bool          `json:"artSkipped"`
	Model      string        `json:"model"`
}

type AISceneOutput struct {
	Body AISceneResult
}

type looseFloat struct {
	val   float64
	isSet bool
}

func (f *looseFloat) UnmarshalJSON(b []byte) error {
	f.isSet = true
	var fl float64
	if err := json.Unmarshal(b, &fl); err == nil {
		f.val = fl
		return nil
	}
	var s string
	if err := json.Unmarshal(b, &s); err == nil {
		s = strings.TrimSpace(s)
		if fl, err := strconv.ParseFloat(s, 64); err == nil {
			f.val = fl
			return nil
		}
	}
	return nil
}

type looseInt struct {
	val   int
	isSet bool
}

func (i *looseInt) UnmarshalJSON(b []byte) error {
	i.isSet = true
	var n int
	if err := json.Unmarshal(b, &n); err == nil {
		i.val = n
		return nil
	}
	var fl float64
	if err := json.Unmarshal(b, &fl); err == nil {
		i.val = int(fl)
		return nil
	}
	var s string
	if err := json.Unmarshal(b, &s); err == nil {
		s = strings.TrimSpace(s)
		if n, err := strconv.Atoi(s); err == nil {
			i.val = n
			return nil
		}
		if fl, err := strconv.ParseFloat(s, 64); err == nil {
			i.val = int(fl)
			return nil
		}
	}
	return nil
}

type looseBool struct {
	val   bool
	isSet bool
}

func (lb *looseBool) UnmarshalJSON(b []byte) error {
	lb.isSet = true
	var val bool
	if err := json.Unmarshal(b, &val); err == nil {
		lb.val = val
		return nil
	}
	var s string
	if err := json.Unmarshal(b, &s); err == nil {
		s = strings.ToLower(strings.TrimSpace(s))
		lb.val = s == "true" || s == "1"
		return nil
	}
	return nil
}

type loosePoint []float64

func (lp *loosePoint) UnmarshalJSON(b []byte) error {
	var arr []float64
	if err := json.Unmarshal(b, &arr); err == nil {
		*lp = arr
		return nil
	}
	var sArr []any
	if err := json.Unmarshal(b, &sArr); err == nil {
		for _, item := range sArr {
			switch v := item.(type) {
			case float64:
				*lp = append(*lp, v)
			case string:
				if f, err := strconv.ParseFloat(strings.TrimSpace(v), 64); err == nil {
					*lp = append(*lp, f)
				}
			}
		}
	}
	return nil
}

type rawLayer struct {
	Type    string       `json:"type"`
	Opacity looseFloat   `json:"opacity"`
	Colors  []string     `json:"colors"`
	Angle   looseInt     `json:"angle"`
	Shape   *string      `json:"shape"`
	X       looseFloat   `json:"x"`
	Y       looseFloat   `json:"y"`
	Width   looseFloat   `json:"width"`
	Aspect  looseFloat   `json:"aspect"`
	Color   *string      `json:"color"`
	Points  []loosePoint `json:"points"`
	Glow    looseBool    `json:"glow"`
	Motion  *string      `json:"motion"`
	Effect  *string      `json:"effect"`
	Count   looseInt     `json:"count"`
	Speed   looseFloat   `json:"speed"`
	Size    looseFloat   `json:"size"`
}

func (rl rawLayer) toCatalogLayer() catalog.Layer {
	l := catalog.Layer{
		Type: rl.Type,
	}
	if rl.Opacity.isSet {
		op := rl.Opacity.val
		l.Opacity = &op
	}
	if len(rl.Colors) > 0 {
		l.Colors = rl.Colors
	}
	if rl.Angle.isSet {
		ang := rl.Angle.val
		l.Angle = &ang
	}
	if rl.Shape != nil {
		l.Shape = rl.Shape
	}
	if rl.X.isSet {
		x := rl.X.val
		l.X = &x
	}
	if rl.Y.isSet {
		y := rl.Y.val
		l.Y = &y
	}
	if rl.Width.isSet {
		w := rl.Width.val
		l.Width = &w
	}
	if rl.Aspect.isSet {
		asp := rl.Aspect.val
		l.Aspect = &asp
	}
	if rl.Color != nil {
		l.Color = rl.Color
	}
	if len(rl.Points) > 0 {
		pts := make([][]float64, len(rl.Points))
		for i, p := range rl.Points {
			pts[i] = p
		}
		l.Points = pts
	}
	if rl.Glow.isSet {
		glow := rl.Glow.val
		l.Glow = &glow
	}
	if rl.Motion != nil {
		l.Motion = rl.Motion
	}
	if rl.Effect != nil {
		l.Effect = rl.Effect
	}
	if rl.Count.isSet {
		cnt := rl.Count.val
		l.Count = &cnt
	}
	if rl.Speed.isSet {
		spd := rl.Speed.val
		l.Speed = &spd
	}
	if rl.Size.isSet {
		sz := rl.Size.val
		l.Size = &sz
	}
	return l
}

type rawSceneOutput struct {
	Name      string     `json:"name"`
	ArtPrompt string     `json:"artPrompt"`
	Layers    []rawLayer `json:"layers"`
}

func registerAIScene(h huma.API, d *Deps) {
	huma.Register(h, auth.Admin(huma.Operation{
		OperationID: "ai-scene",
		Method:      http.MethodPost,
		Path:        adminPrefix + "/ai/scene",
		Summary:     "Generate layers scene definition from a description",
		Tags:        []string{"AI"},
	}, model.RoleDesigner, model.RoleReviewer), func(ctx context.Context, input *AISceneInput) (*AISceneOutput, error) {
		apiKey := strings.TrimSpace(os.Getenv("OPENROUTER_API_KEY"))
		if apiKey == "" {
			return nil, aiNotConfigured("openrouter")
		}

		description := strings.TrimSpace(input.Body.Description)
		if len(input.Body.Palette) > 6 {
			return nil, apierr.Invalid("palette", "At most 6 colors allowed")
		}
		for _, c := range input.Body.Palette {
			if !hexColorRegex.MatchString(c) {
				return nil, apierr.Invalid("palette", fmt.Sprintf("Invalid hex color %q, expected #RRGGBB", c))
			}
		}

		userPrompt := fmt.Sprintf("Description: %s", description)
		if len(input.Body.Palette) > 0 {
			userPrompt += fmt.Sprintf("\nPalette: %s", strings.Join(input.Body.Palette, ", "))
		}

		reqCtx, cancel := context.WithTimeout(ctx, aiSceneContextTimeout)
		defer cancel()

		var parsed rawSceneOutput
		var validLayers []catalog.Layer
		var usedModel string
		var err error

		for attempt := 0; ; attempt++ {
			var rawContent string
			rawContent, usedModel, err = openRouterJSON(reqCtx, aiSceneSystemPrompt, userPrompt)
			if err == nil {
				cleaned := jsonObject(rawContent)
				if uErr := json.Unmarshal([]byte(cleaned), &parsed); uErr != nil {
					err = apierr.New(http.StatusBadGateway, "ai_bad_output", "The model did not return usable JSON, try again.")
				} else {
					validLayers = nil
					for _, rl := range parsed.Layers {
						if rl.Type == "image" {
							continue
						}
						l := rl.toCatalogLayer()
						if errs := l.Validate(false, "layer"); len(errs) == 0 {
							validLayers = append(validLayers, l)
						}
					}
					if len(validLayers) == 0 {
						err = apierr.New(http.StatusBadGateway, "ai_bad_output", "The model did not return usable scene data, try again.")
					}
				}
			}

			var ae *apierr.Error
			if err == nil || attempt == 1 || !errors.As(err, &ae) || ae.Err.Code != "ai_bad_output" {
				if err != nil {
					return nil, err
				}
				break
			}
		}

		actor := "system"
		if me := auth.From(ctx); me != nil {
			actor = me.Name
		}

		withArt := true
		if input.Body.WithArt != nil {
			withArt = *input.Body.WithArt
		}

		artSkipped := false
		if withArt {
			if isProviderConfigured("cloudflare") {
				artPrompt := strings.TrimSpace(parsed.ArtPrompt)
				if artPrompt == "" {
					artPrompt = description
				}
				imgRes, imgErr := generateAIImage(ctx, d, artPrompt, "wallpaper", 4, nil, actor)
				if imgErr != nil {
					return nil, imgErr
				}
				fitCover := "cover"
				imgLayer := catalog.Layer{
					Type: "image",
					Image: &catalog.Asset{
						URL:    imgRes.Asset.URL,
						SHA256: imgRes.Asset.SHA256,
						Bytes:  imgRes.Asset.Bytes,
						Format: imgRes.Asset.Format,
					},
					Fit: &fitCover,
				}
				validLayers = append([]catalog.Layer{imgLayer}, validLayers...)
			} else {
				artSkipped = true
			}
		}

		sceneName := strings.TrimSpace(parsed.Name)
		if sceneName == "" {
			sceneName = "AI Scene"
		}

		artPrompt := strings.TrimSpace(parsed.ArtPrompt)
		if artPrompt == "" {
			artPrompt = description
		}

		res := &AISceneOutput{
			Body: AISceneResult{
				Scene: catalog.Scene{
					Engine: "layers",
					Params: catalog.SceneParams{
						Layers: validLayers,
					},
				},
				Name:       sceneName,
				ArtPrompt:  artPrompt,
				ArtSkipped: artSkipped,
				Model:      usedModel,
			},
		}

		return res, nil
	})
}
