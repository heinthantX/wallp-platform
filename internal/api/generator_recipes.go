package api

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"math/rand/v2"
	"net/http"
	"strings"
	"time"

	"github.com/danielgtaylor/huma/v2"
	"github.com/uptrace/bun"

	"github.com/heinthant/wallp-backend/internal/apierr"
	"github.com/heinthant/wallp-backend/internal/audit"
	"github.com/heinthant/wallp-backend/internal/auth"
	"github.com/heinthant/wallp-backend/internal/catalog"
	"github.com/heinthant/wallp-backend/internal/generator"
	"github.com/heinthant/wallp-backend/internal/items"
	"github.com/heinthant/wallp-backend/internal/model"
)

var generatorTags = []string{"Generator"}

type RecipeView struct {
	ID         string     `json:"id"`
	Name       string     `json:"name"`
	FestivalID *string    `json:"festivalId"`
	Data       model.JSON `json:"data"`
	Enabled    bool       `json:"enabled"`
	CreatedBy  string     `json:"createdBy"`
	UpdatedBy  string     `json:"updatedBy"`
	CreatedAt  time.Time  `json:"createdAt"`
	UpdatedAt  time.Time  `json:"updatedAt"`
}

type ListRecipesInput struct {
	ListParams
	FestivalID string `query:"festivalId" doc:"Filter by festival ID"`
	Enabled    string `query:"enabled" enum:"true,false," doc:"Filter by enabled status"`
}

type ListRecipesOutput struct {
	Body Page[RecipeView]
}

type RecipeOutput struct {
	Body RecipeView
}

type CreateRecipeInput struct {
	RawBody []byte
}

type UpdateRecipeInput struct {
	IDPath
	RawBody []byte
}

type RecipePathInput struct {
	IDPath
}

type PreviewRecipeBody struct {
	Mood      string `json:"mood,omitempty"`
	BaseColor string `json:"baseColor,omitempty"`
	Seed      *int64 `json:"seed,omitempty"`
}

type PreviewRecipeInput struct {
	IDPath
	Body *PreviewRecipeBody
}

type PreviewRecipeOutput struct {
	Body struct {
		Seed    int64             `json:"seed"`
		Options []GeneratedOption `json:"options"`
	}
}

type InterpretInput struct {
	Body struct {
		Description string  `json:"description"`
		RecipeID    *string `json:"recipeId,omitempty"`
	}
}

type InterpretOutput struct {
	Body generator.Interpretation
}

func toRecipeView(r model.GeneratorRecipe) RecipeView {
	return RecipeView{
		ID:         r.ID,
		Name:       r.Name,
		FestivalID: r.FestivalID,
		Data:       r.Data,
		Enabled:    r.Enabled,
		CreatedBy:  r.CreatedBy,
		UpdatedBy:  r.UpdatedBy,
		CreatedAt:  r.CreatedAt,
		UpdatedAt:  r.UpdatedAt,
	}
}

func parseRecipePayload(raw []byte) (recipe generator.Recipe, dataBytes []byte, enabled *bool, updatedAt *time.Time, err error) {
	if len(raw) == 0 {
		return generator.Recipe{}, nil, nil, nil, apierr.Invalid("body", "Request body is required")
	}

	var wrapper struct {
		Data      json.RawMessage `json:"data"`
		Enabled   *bool           `json:"enabled"`
		UpdatedAt *time.Time      `json:"updatedAt"`
	}
	if err := json.Unmarshal(raw, &wrapper); err == nil && len(wrapper.Data) > 0 && string(wrapper.Data) != "null" {
		dataBytes = wrapper.Data
		enabled = wrapper.Enabled
		updatedAt = wrapper.UpdatedAt
	} else {
		dataBytes = raw
		var rawMap map[string]json.RawMessage
		if err := json.Unmarshal(raw, &rawMap); err != nil {
			return generator.Recipe{}, nil, nil, nil, apierr.Invalid("body", "Invalid JSON")
		}
		if enRaw, ok := rawMap["enabled"]; ok {
			var b bool
			if err := json.Unmarshal(enRaw, &b); err == nil {
				enabled = &b
			}
		}
		if uRaw, ok := rawMap["updatedAt"]; ok {
			var tStr string
			if err := json.Unmarshal(uRaw, &tStr); err == nil {
				if t, err := time.Parse(time.RFC3339Nano, tStr); err == nil {
					updatedAt = &t
				}
			}
		}
	}

	if err := json.Unmarshal(dataBytes, &recipe); err != nil {
		return generator.Recipe{}, nil, nil, nil, apierr.Invalid("data", "Invalid recipe JSON: "+err.Error())
	}
	return recipe, dataBytes, enabled, updatedAt, nil
}

func festivalNameFor(festID string) string {
	switch festID {
	case "christmas":
		return "Christmas"
	case "halloween":
		return "Halloween"
	case "thingyan":
		return "Thingyan"
	case "default":
		return "Default"
	default:
		return festID
	}
}

func registerGeneratorRecipes(h huma.API, d *Deps) {
	rp := adminPrefix + "/generator/recipes"

	var sortable = map[string]string{
		"id":         "id",
		"name":       "name",
		"festivalId": "festival_id",
		"enabled":    "enabled",
		"createdAt":  "created_at",
		"updatedAt":  "updated_at",
	}

	// 1. GET /admin/v1/generator/recipes
	huma.Register(h, auth.Admin(huma.Operation{
		OperationID: "list-generator-recipes",
		Method:      http.MethodGet,
		Path:        rp,
		Summary:     "List generator recipes",
		Tags:        generatorTags,
	}), func(ctx context.Context, in *ListRecipesInput) (*ListRecipesOutput, error) {
		q := d.DB.NewSelect().Model((*model.GeneratorRecipe)(nil))
		if in.FestivalID != "" {
			q = q.Where("festival_id = ?", in.FestivalID)
		}
		if in.Enabled == "true" {
			q = q.Where("enabled = true")
		} else if in.Enabled == "false" {
			q = q.Where("enabled = false")
		}
		q = whereSearch(q, in.Q, "id", "name")
		q, err := paginate(q, in.ListParams, sortable, "name")
		if err != nil {
			return nil, err
		}

		var rows []model.GeneratorRecipe
		total, err := q.ScanAndCount(ctx, &rows)
		if err != nil {
			return nil, err
		}

		itemsList := make([]RecipeView, len(rows))
		for i, r := range rows {
			itemsList[i] = toRecipeView(r)
		}

		out := &ListRecipesOutput{}
		out.Body.Items = itemsList
		out.Body.Total = int(total)
		out.Body.Page = in.Page
		out.Body.PerPage = in.PerPage
		return out, nil
	})

	// 2. POST /admin/v1/generator/recipes
	huma.Register(h, auth.Admin(huma.Operation{
		OperationID:   "create-generator-recipe",
		Method:        http.MethodPost,
		Path:          rp,
		Summary:       "Create a generator recipe",
		Tags:          generatorTags,
		DefaultStatus: http.StatusCreated,
	}, model.RoleDesigner, model.RoleReviewer), func(ctx context.Context, in *CreateRecipeInput) (*RecipeOutput, error) {
		me := auth.From(ctx)
		creator := "system"
		if me != nil {
			creator = me.Name
		}

		recipe, _, enabled, _, err := parseRecipePayload(in.RawBody)
		if err != nil {
			return nil, err
		}

		if errs := recipe.Validate(); len(errs) > 0 {
			apiErr := apierr.Invalid(errs[0].Field, errs[0].Message)
			for _, fe := range errs {
				apiErr.Err.Details = append(apiErr.Err.Details, apierr.Detail{
					Field:   fe.Field,
					Message: fe.Message,
				})
			}
			return nil, apiErr
		}

		cleanData, err := json.Marshal(recipe)
		if err != nil {
			return nil, err
		}

		var festID *string
		if len(recipe.FestivalIDs) > 0 && strings.TrimSpace(recipe.FestivalIDs[0]) != "" {
			fest := strings.TrimSpace(recipe.FestivalIDs[0])
			festID = &fest
		}

		isEnabled := true
		if enabled != nil {
			isEnabled = *enabled
		}

		now := time.Now().UTC()
		row := model.GeneratorRecipe{
			ID:         recipe.ID,
			Name:       recipe.Name,
			FestivalID: festID,
			Data:       model.JSON(cleanData),
			Enabled:    isEnabled,
			CreatedBy:  creator,
			UpdatedBy:  creator,
			CreatedAt:  now,
			UpdatedAt:  now,
		}

		err = d.DB.RunInTx(ctx, nil, func(ctx context.Context, tx bun.Tx) error {
			exists, err := tx.NewSelect().Model((*model.GeneratorRecipe)(nil)).
				Where("id = ?", recipe.ID).
				Exists(ctx)
			if err != nil {
				return err
			}
			if exists {
				return apierr.Conflict("id_taken", "Recipe ID already exists")
			}

			if _, err := tx.NewInsert().Model(&row).Exec(ctx); err != nil {
				return err
			}
			return audit.Record(ctx, tx, "create", "generator_recipe", row.ID, nil, row)
		})
		if err != nil {
			return nil, err
		}

		return &RecipeOutput{Body: toRecipeView(row)}, nil
	})

	// 3. GET /admin/v1/generator/recipes/{id}
	huma.Register(h, auth.Admin(huma.Operation{
		OperationID: "get-generator-recipe",
		Method:      http.MethodGet,
		Path:        rp + "/{id}",
		Summary:     "Get a generator recipe",
		Tags:        generatorTags,
	}), func(ctx context.Context, in *RecipePathInput) (*RecipeOutput, error) {
		var row model.GeneratorRecipe
		err := d.DB.NewSelect().Model(&row).Where("id = ?", in.ID).Scan(ctx)
		if err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				return nil, apierr.NotFound("Recipe " + in.ID)
			}
			return nil, err
		}
		return &RecipeOutput{Body: toRecipeView(row)}, nil
	})

	// 4. PATCH /admin/v1/generator/recipes/{id}
	huma.Register(h, auth.Admin(huma.Operation{
		OperationID: "update-generator-recipe",
		Method:      http.MethodPatch,
		Path:        rp + "/{id}",
		Summary:     "Update a generator recipe",
		Tags:        generatorTags,
	}, model.RoleDesigner, model.RoleReviewer), func(ctx context.Context, in *UpdateRecipeInput) (*RecipeOutput, error) {
		me := auth.From(ctx)
		updater := "system"
		if me != nil {
			updater = me.Name
		}

		recipe, _, enabled, clientUpdatedAt, err := parseRecipePayload(in.RawBody)
		if err != nil {
			return nil, err
		}
		if recipe.ID != "" && recipe.ID != in.ID {
			return nil, apierr.Invalid("id", "Cannot change recipe ID")
		}
		recipe.ID = in.ID

		if errs := recipe.Validate(); len(errs) > 0 {
			apiErr := apierr.Invalid(errs[0].Field, errs[0].Message)
			for _, fe := range errs {
				apiErr.Err.Details = append(apiErr.Err.Details, apierr.Detail{
					Field:   fe.Field,
					Message: fe.Message,
				})
			}
			return nil, apiErr
		}

		cleanData, err := json.Marshal(recipe)
		if err != nil {
			return nil, err
		}

		var festID *string
		if len(recipe.FestivalIDs) > 0 && strings.TrimSpace(recipe.FestivalIDs[0]) != "" {
			fest := strings.TrimSpace(recipe.FestivalIDs[0])
			festID = &fest
		}

		var updatedRow model.GeneratorRecipe
		err = d.DB.RunInTx(ctx, nil, func(ctx context.Context, tx bun.Tx) error {
			var existing model.GeneratorRecipe
			if err := tx.NewSelect().Model(&existing).Where("id = ?", in.ID).Scan(ctx); err != nil {
				if errors.Is(err, sql.ErrNoRows) {
					return apierr.NotFound("Recipe " + in.ID)
				}
				return err
			}
			if clientUpdatedAt != nil && isStale(existing.UpdatedAt, *clientUpdatedAt) {
				return apierr.Conflict("edit_conflict", "Recipe was modified by someone else")
			}
			beforeRow := existing

			existing.Name = recipe.Name
			existing.FestivalID = festID
			existing.Data = model.JSON(cleanData)
			if enabled != nil {
				existing.Enabled = *enabled
			}
			existing.UpdatedBy = updater
			existing.UpdatedAt = time.Now().UTC()

			if _, err := tx.NewUpdate().Model(&existing).WherePK().Exec(ctx); err != nil {
				return err
			}
			updatedRow = existing
			return audit.Record(ctx, tx, "update", "generator_recipe", existing.ID, beforeRow, existing)
		})
		if err != nil {
			return nil, err
		}

		return &RecipeOutput{Body: toRecipeView(updatedRow)}, nil
	})

	// 5. DELETE /admin/v1/generator/recipes/{id}
	huma.Register(h, auth.Admin(huma.Operation{
		OperationID: "delete-generator-recipe",
		Method:      http.MethodDelete,
		Path:        rp + "/{id}",
		Summary:     "Delete a generator recipe",
		Tags:        generatorTags,
	}, model.RoleAdmin), func(ctx context.Context, in *RecipePathInput) (*SimpleOKOutput, error) {
		err := d.DB.RunInTx(ctx, nil, func(ctx context.Context, tx bun.Tx) error {
			var existing model.GeneratorRecipe
			if err := tx.NewSelect().Model(&existing).Where("id = ?", in.ID).Scan(ctx); err != nil {
				if errors.Is(err, sql.ErrNoRows) {
					return apierr.NotFound("Recipe " + in.ID)
				}
				return err
			}
			if _, err := tx.NewDelete().Model(&existing).WherePK().Exec(ctx); err != nil {
				return err
			}
			return audit.Record(ctx, tx, "delete", "generator_recipe", existing.ID, existing, nil)
		})
		if err != nil {
			return nil, err
		}

		out := &SimpleOKOutput{}
		out.Body.OK = true
		return out, nil
	})

	// 6. POST /admin/v1/generator/recipes/{id}/preview
	huma.Register(h, auth.Admin(huma.Operation{
		OperationID: "preview-generator-recipe",
		Method:      http.MethodPost,
		Path:        rp + "/{id}/preview",
		Summary:     "Preview 6 theme options for a generator recipe",
		Tags:        generatorTags,
	}, model.RoleDesigner, model.RoleReviewer), func(ctx context.Context, in *PreviewRecipeInput) (*PreviewRecipeOutput, error) {
		var row model.GeneratorRecipe
		err := d.DB.NewSelect().Model(&row).Where("id = ?", in.ID).Scan(ctx)
		if err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				return nil, apierr.NotFound("Recipe " + in.ID)
			}
			return nil, err
		}

		var recipe generator.Recipe
		if err := json.Unmarshal(row.Data, &recipe); err != nil {
			return nil, err
		}

		festID := "default"
		if len(recipe.FestivalIDs) > 0 && recipe.FestivalIDs[0] != "" {
			festID = recipe.FestivalIDs[0]
		} else if row.FestivalID != nil && *row.FestivalID != "" {
			festID = *row.FestivalID
		}

		festName := festivalNameFor(festID)
		var festRow items.ItemRow
		if err := d.DB.NewSelect().Table("festivals").
			Where("id = ?", festID).
			Column("data").
			Scan(ctx, &festRow); err == nil {
			var fest catalog.Festival
			if err := json.Unmarshal(festRow.Data, &fest); err == nil {
				if n, ok := fest.Name["en"]; ok && n != "" {
					festName = n
				}
			}
		}

		var body PreviewRecipeBody
		if in.Body != nil {
			body = *in.Body
		}

		mood := body.Mood
		if mood == "" {
			if len(recipe.Moods) > 0 {
				mood = recipe.Moods[0]
			} else {
				mood = "classic"
			}
		}

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

		var seed int64
		if body.Seed != nil {
			seed = *body.Seed
		} else {
			seed = rand.Int64()
		}

		engine := "layers"
		if catalog.IsValidEngine(festID) {
			engine = festID
		}

		genIn := generator.Input{
			FestivalID:   festID,
			FestivalName: catalog.Localized{"en": festName},
			FestivalTags: recipe.Tags,
			Mood:         mood,
			BaseColor:    body.BaseColor,
			Engine:       engine,
			Seed:         seed,
			Fonts:        fontInfos,
			Recipe:       &recipe,
		}

		options, err := generator.Generate(genIn, 6)
		if err != nil {
			if errors.Is(err, generator.ErrNoFonts) {
				return nil, apierr.New(http.StatusUnprocessableEntity, "no_fonts", "Import or add fonts first")
			}
			if errors.Is(err, generator.ErrGenerationFailed) {
				return nil, apierr.New(http.StatusInternalServerError, "generation_failed", "Theme generation failed")
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

		out := &PreviewRecipeOutput{}
		out.Body.Seed = seed
		out.Body.Options = outOpts
		return out, nil
	})

	// 7. POST /admin/v1/themes/generate/interpret
	huma.Register(h, auth.Admin(huma.Operation{
		OperationID: "interpret-theme-description",
		Method:      http.MethodPost,
		Path:        adminPrefix + "/themes/generate/interpret",
		Summary:     "Interpret theme description into generator parameters",
		Tags:        generatorTags,
	}, model.RoleDesigner, model.RoleReviewer), func(ctx context.Context, in *InterpretInput) (*InterpretOutput, error) {
		var extra []generator.KeywordEntry
		if in.Body.RecipeID != nil && strings.TrimSpace(*in.Body.RecipeID) != "" {
			var recRow model.GeneratorRecipe
			if err := d.DB.NewSelect().Model(&recRow).Where("id = ?", strings.TrimSpace(*in.Body.RecipeID)).Scan(ctx); err == nil {
				var rec generator.Recipe
				if err := json.Unmarshal(recRow.Data, &rec); err == nil {
					extra = rec.KeywordEntries()
				}
			}
		}
		res := generator.Interpret(in.Body.Description, extra)
		return &InterpretOutput{Body: res}, nil
	})
}

func isStale(current, client time.Time) bool {
	return !current.Truncate(time.Millisecond).Equal(client.Truncate(time.Millisecond))
}
