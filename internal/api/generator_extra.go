package api

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"image"
	_ "image/jpeg"
	_ "image/png"
	"io"
	"math/rand/v2"
	"mime"
	"mime/multipart"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	_ "golang.org/x/image/webp"

	"github.com/danielgtaylor/huma/v2"
	"github.com/uptrace/bun"

	"github.com/heinthant/wallp-backend/internal/apierr"
	"github.com/heinthant/wallp-backend/internal/assets"
	"github.com/heinthant/wallp-backend/internal/auth"
	"github.com/heinthant/wallp-backend/internal/catalog"
	"github.com/heinthant/wallp-backend/internal/generator"
	"github.com/heinthant/wallp-backend/internal/items"
	"github.com/heinthant/wallp-backend/internal/model"
)

type biasCacheEntry struct {
	bias      *generator.HueBias
	expiresAt time.Time
}

var (
	biasCacheMu sync.Mutex
	biasCache   = make(map[string]biasCacheEntry)
)

func InvalidateBiasCache(festivalID, mood string) {
	biasCacheMu.Lock()
	defer biasCacheMu.Unlock()
	key := fmt.Sprintf("%s:%s", festivalID, mood)
	delete(biasCache, key)
}

// GetCachedHueBias retrieves or loads a 5-minute cached HueBias for (festivalID, mood).
// If no feedback rows exist in the database, it returns nil to preserve standard sampling.
func GetCachedHueBias(ctx context.Context, db *bun.DB, festivalID, mood string) *generator.HueBias {
	key := fmt.Sprintf("%s:%s", festivalID, mood)

	biasCacheMu.Lock()
	if entry, ok := biasCache[key]; ok && time.Now().Before(entry.expiresAt) {
		biasCacheMu.Unlock()
		return entry.bias
	}
	biasCacheMu.Unlock()

	var rows []struct {
		Hue    float64 `bun:"hue"`
		Action string  `bun:"action"`
	}
	q := db.NewSelect().Table("generator_feedback").
		Column("hue", "action").
		Where("mood = ?", mood)
	if festivalID != "" {
		q = q.Where("festival_id = ?", festivalID)
	} else {
		q = q.Where("festival_id IS NULL OR festival_id = ''")
	}

	if err := q.Scan(ctx, &rows); err != nil || len(rows) == 0 {
		return nil
	}

	itemsList := make([]generator.FeedbackItem, len(rows))
	for i, r := range rows {
		itemsList[i] = generator.FeedbackItem{
			Hue:    r.Hue,
			Action: r.Action,
		}
	}
	bias := generator.NewHueBiasFromFeedback(itemsList)

	biasCacheMu.Lock()
	biasCache[key] = biasCacheEntry{
		bias:      bias,
		expiresAt: time.Now().Add(5 * time.Minute),
	}
	biasCacheMu.Unlock()

	return bias
}

type FromImageInput struct {
	ContentType string `header:"Content-Type"`
	RawBody     []byte
}

type FromImageOutput struct {
	Body struct {
		Swatches []generator.Swatch `json:"swatches"`
		Seed     int64              `json:"seed"`
		Options  []GeneratedOption  `json:"options"`
	}
}

type CreateFeedbackInput struct {
	Body struct {
		FestivalID *string         `json:"festivalId,omitempty"`
		Mood       string          `json:"mood"`
		RecipeID   *string         `json:"recipeId,omitempty"`
		Seed       int64           `json:"seed"`
		Palette    catalog.Palette `json:"palette"`
		Hue        *float64        `json:"hue,omitempty"`
		Action     string          `json:"action"`
	}
}

type CreateFeedbackOutput struct {
	Status int
	Body   struct {
		ID int64 `json:"id"`
	}
}

type BreedThemeInput struct {
	Body struct {
		A    catalog.ThemeDetail `json:"a"`
		B    catalog.ThemeDetail `json:"b"`
		Seed *int64              `json:"seed,omitempty"`
	}
}

type BreedThemeOutput struct {
	Body struct {
		Seed    int64             `json:"seed"`
		Options []GeneratedOption `json:"options"`
	}
}

func formValue(form *multipart.Form, name string) string {
	if vals, ok := form.Value[name]; ok && len(vals) > 0 {
		return strings.TrimSpace(vals[0])
	}
	return ""
}

func registerGeneratorExtra(h huma.API, d *Deps) {
	// 1. POST /admin/v1/themes/generate/from-image
	huma.Register(h, auth.Admin(huma.Operation{
		OperationID:  "generate-themes-from-image",
		Method:       http.MethodPost,
		Path:         adminPrefix + "/themes/generate/from-image",
		Summary:      "Generate themes from an uploaded photo",
		Tags:         generatorTags,
		MaxBodyBytes: 10 * 1024 * 1024,
	}, model.RoleDesigner, model.RoleReviewer), func(ctx context.Context, in *FromImageInput) (*FromImageOutput, error) {
		if !strings.HasPrefix(in.ContentType, "multipart/form-data") {
			return nil, apierr.Invalid("Content-Type", "Expected multipart/form-data")
		}
		_, params, err := mime.ParseMediaType(in.ContentType)
		if err != nil {
			return nil, apierr.Invalid("Content-Type", "Invalid multipart Content-Type")
		}
		boundary := params["boundary"]
		if boundary == "" {
			return nil, apierr.Invalid("Content-Type", "Missing multipart boundary")
		}
		mr := multipart.NewReader(bytes.NewReader(in.RawBody), boundary)
		form, err := mr.ReadForm(10 << 20)
		if err != nil {
			return nil, apierr.Invalid("body", "The upload could not be read")
		}
		defer form.RemoveAll()

		imgFiles := form.File["image"]
		if len(imgFiles) == 0 {
			return nil, apierr.Invalid("image", "Missing image file in multipart form")
		}
		f, err := imgFiles[0].Open()
		if err != nil {
			return nil, apierr.Invalid("image", "The image could not be read")
		}
		defer f.Close()
		imgBytes, err := io.ReadAll(f)
		if err != nil {
			return nil, apierr.Invalid("image", "The image could not be read")
		}

		cfg, _, err := image.DecodeConfig(bytes.NewReader(imgBytes))
		if err != nil {
			return nil, apierr.Invalid("image", "The image could not be read")
		}
		if cfg.Width > 8000 || cfg.Height > 8000 {
			return nil, apierr.Invalid("image", "Image side exceeds 8000 px")
		}
		if cfg.Width*cfg.Height > assets.MaxPixels {
			return nil, apierr.Invalid("image", "Image is larger than 25 megapixels")
		}
		releaseDecode := assets.AcquireDecode()
		defer releaseDecode()

		img, _, err := image.Decode(bytes.NewReader(imgBytes))
		if err != nil {
			return nil, apierr.Invalid("image", "The image could not be read")
		}

		festivalID := formValue(form, "festivalId")
		if festivalID == "" {
			return nil, apierr.Invalid("festivalId", "festivalId is required")
		}

		// Festival must exist
		var festRow items.ItemRow
		if err := d.DB.NewSelect().Table("festivals").
			Where("id = ?", festivalID).
			Column("data").
			Scan(ctx, &festRow); err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				return nil, apierr.NotFound("Festival " + festivalID)
			}
			return nil, err
		}
		var fest catalog.Festival
		if err := json.Unmarshal(festRow.Data, &fest); err != nil {
			return nil, err
		}

		// Recipe
		recipeID := formValue(form, "recipeId")
		var recipe *generator.Recipe
		if recipeID != "" {
			var recRow model.GeneratorRecipe
			if err := d.DB.NewSelect().Model(&recRow).Where("id = ?", recipeID).Scan(ctx); err != nil {
				if errors.Is(err, sql.ErrNoRows) {
					return nil, apierr.NotFound("Recipe " + recipeID)
				}
				return nil, err
			}
			var rec generator.Recipe
			if err := json.Unmarshal(recRow.Data, &rec); err != nil {
				return nil, err
			}
			recipe = &rec
		} else {
			var recRow model.GeneratorRecipe
			err := d.DB.NewSelect().Model(&recRow).
				Where("festival_id = ? AND enabled = true", fest.ID).
				Order("name ASC").
				Limit(1).
				Scan(ctx)
			if err == nil {
				var rec generator.Recipe
				if err := json.Unmarshal(recRow.Data, &rec); err == nil {
					recipe = &rec
				}
			} else if errors.Is(err, sql.ErrNoRows) {
				err = d.DB.NewSelect().Model(&recRow).
					Where("id = 'default' AND enabled = true").
					Limit(1).
					Scan(ctx)
				if err == nil {
					var rec generator.Recipe
					if err := json.Unmarshal(recRow.Data, &rec); err == nil {
						recipe = &rec
					}
				}
			}
		}

		mood := formValue(form, "mood")
		description := formValue(form, "description")
		if description != "" {
			var extraKeywords []generator.KeywordEntry
			if recipe != nil {
				extraKeywords = recipe.KeywordEntries()
			}
			interp := generator.Interpret(description, extraKeywords)
			if mood == "" && interp.Mood != "" {
				mood = interp.Mood
			}
		}
		if mood == "" {
			mood = "classic"
		}
		switch mood {
		case "classic", "cozy", "minimal", "cute":
		default:
			return nil, apierr.Invalid("mood", "Invalid mood: must be classic, cozy, minimal, or cute")
		}

		engine := formValue(form, "engine")
		if engine == "" {
			engine = "layers"
		}
		if !catalog.IsValidEngine(engine) {
			return nil, apierr.Invalid("engine", "Invalid engine: "+engine)
		}

		count := 6
		if cStr := formValue(form, "count"); cStr != "" {
			if parsedCount, err := strconv.Atoi(cStr); err == nil && parsedCount >= 1 && parsedCount <= 6 {
				count = parsedCount
			}
		}

		seed := rand.Int64()
		if sStr := formValue(form, "seed"); sStr != "" {
			if parsedSeed, err := strconv.ParseInt(sStr, 10, 64); err == nil {
				seed = parsedSeed
			}
		}

		// Fonts
		var fontRows []items.ItemRow
		if err := d.DB.NewSelect().Table("fonts").
			Where("status = ? OR status = ?", model.StatusPublished, model.StatusApproved).
			Column("data").
			Scan(ctx, &fontRows); err != nil {
			return nil, err
		}
		var fontInfos []generator.FontInfo
		for _, fr := range fontRows {
			var f catalog.Font
			if err := json.Unmarshal(fr.Data, &f); err == nil {
				fontInfos = append(fontInfos, generator.FontInfo{
					ID:       f.ID,
					Category: f.Category,
					Tags:     f.Tags,
					Scripts:  f.Scripts,
				})
			}
		}

		// Existing themes for dedupe
		var themeRows []items.ItemRow
		_ = d.DB.NewSelect().Table("themes").
			Column("id", "data").
			Scan(ctx, &themeRows)
		var existingThemes []generator.ExistingTheme
		for _, tr := range themeRows {
			var td catalog.ThemeDetail
			if err := json.Unmarshal(tr.Data, &td); err == nil {
				existingThemes = append(existingThemes, generator.ExistingTheme{
					ID:      td.ID,
					Palette: td.Palette,
					Accents: td.Accents,
				})
			}
		}

		swatches := generator.Swatches(img, 8)

		genIn := generator.Input{
			FestivalID:   fest.ID,
			FestivalName: fest.Name,
			FestivalTags: fest.Tags,
			FestivalLook: &fest.Look,
			Mood:         mood,
			Engine:       engine,
			Description:  description,
			Seed:         seed,
			Fonts:        fontInfos,
			Recipe:       recipe,
			Existing:     existingThemes,
		}
		generator.ApplyRolesFromSwatches(&genIn, swatches)

		options, err := generator.Generate(genIn, count)
		if err != nil {
			if errors.Is(err, generator.ErrNoFonts) {
				return nil, apierr.New(http.StatusUnprocessableEntity, "no_fonts", "Import or add fonts first")
			}
			return nil, apierr.Invalid("generator", err.Error())
		}

		outOpts := make([]GeneratedOption, len(options))
		for i, opt := range options {
			outOpts[i] = GeneratedOption{
				Data:   opt.Theme,
				Checks: opt.Checks,
				Seed:   opt.Seed,
			}
		}

		out := &FromImageOutput{}
		out.Body.Swatches = swatches
		out.Body.Seed = seed
		out.Body.Options = outOpts
		return out, nil
	})

	// 2. POST /admin/v1/generator/feedback
	huma.Register(h, auth.Admin(huma.Operation{
		OperationID:   "create-generator-feedback",
		Method:        http.MethodPost,
		Path:          adminPrefix + "/generator/feedback",
		Summary:       "Record telemetry feedback on theme generation",
		Tags:          generatorTags,
		DefaultStatus: http.StatusCreated,
	}, model.RoleDesigner, model.RoleReviewer), func(ctx context.Context, in *CreateFeedbackInput) (*CreateFeedbackOutput, error) {
		switch in.Body.Action {
		case "accepted", "rejected", "shuffled", "bred":
		default:
			return nil, apierr.Invalid("action", "Invalid action: must be accepted, rejected, shuffled, or bred")
		}

		me := auth.From(ctx)
		var userID *string
		if me != nil && me.ID != "" {
			userID = &me.ID
		}

		hue := 0.0
		if in.Body.Hue != nil {
			hue = *in.Body.Hue
		} else if in.Body.Palette.Motif != nil && *in.Body.Palette.Motif != "" {
			if lch, err := generator.HexToOKLCH(*in.Body.Palette.Motif); err == nil {
				hue = lch.H
			}
		} else if in.Body.Palette.Background != "" {
			if lch, err := generator.HexToOKLCH(in.Body.Palette.Background); err == nil {
				hue = lch.H
			}
		}

		paletteJSON, err := json.Marshal(in.Body.Palette)
		if err != nil {
			return nil, apierr.Invalid("palette", "Invalid palette JSON")
		}

		row := model.GeneratorFeedback{
			UserID:     userID,
			FestivalID: in.Body.FestivalID,
			Mood:       in.Body.Mood,
			RecipeID:   in.Body.RecipeID,
			Seed:       in.Body.Seed,
			Palette:    model.JSON(paletteJSON),
			Hue:        hue,
			Action:     in.Body.Action,
			At:         time.Now().UTC(),
		}

		if _, err := d.DB.NewInsert().Model(&row).Exec(ctx); err != nil {
			return nil, err
		}

		festIDStr := ""
		if in.Body.FestivalID != nil {
			festIDStr = *in.Body.FestivalID
		}
		InvalidateBiasCache(festIDStr, in.Body.Mood)

		out := &CreateFeedbackOutput{Status: http.StatusCreated}
		out.Body.ID = row.ID
		return out, nil
	})

	// 3. POST /admin/v1/themes/generate/breed
	huma.Register(h, auth.Admin(huma.Operation{
		OperationID: "breed-themes",
		Method:      http.MethodPost,
		Path:        adminPrefix + "/themes/generate/breed",
		Summary:     "Breed two theme details into 6 child theme options",
		Tags:        generatorTags,
	}, model.RoleDesigner, model.RoleReviewer), func(ctx context.Context, in *BreedThemeInput) (*BreedThemeOutput, error) {
		if in.Body.A.Palette.Background == "" {
			return nil, apierr.Invalid("a", "Parent theme A is required and must have a valid palette")
		}
		if in.Body.B.Palette.Background == "" {
			return nil, apierr.Invalid("b", "Parent theme B is required and must have a valid palette")
		}

		seed := rand.Int64()
		if in.Body.Seed != nil {
			seed = *in.Body.Seed
		}

		// Load fonts from DB
		var fontRows []items.ItemRow
		if err := d.DB.NewSelect().Table("fonts").
			Where("status = ? OR status = ?", model.StatusPublished, model.StatusApproved).
			Column("data").
			Scan(ctx, &fontRows); err != nil {
			return nil, err
		}
		var fontInfos []generator.FontInfo
		for _, fr := range fontRows {
			var f catalog.Font
			if err := json.Unmarshal(fr.Data, &f); err == nil {
				fontInfos = append(fontInfos, generator.FontInfo{
					ID:       f.ID,
					Category: f.Category,
					Tags:     f.Tags,
					Scripts:  f.Scripts,
				})
			}
		}

		options := generator.Breed(in.Body.A, in.Body.B, seed, fontInfos, 6)

		outOpts := make([]GeneratedOption, len(options))
		for i, opt := range options {
			outOpts[i] = GeneratedOption{
				Data:   opt.Theme,
				Checks: opt.Checks,
				Seed:   opt.Seed,
			}
		}

		out := &BreedThemeOutput{}
		out.Body.Seed = seed
		out.Body.Options = outOpts
		return out, nil
	})
}
