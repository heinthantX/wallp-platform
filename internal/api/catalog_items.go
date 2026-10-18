package api

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"math/rand/v2"
	"net/http"
	"regexp"
	"strings"
	"time"

	"github.com/danielgtaylor/huma/v2"

	"github.com/heinthant/wallp-backend/internal/apierr"
	"github.com/heinthant/wallp-backend/internal/auth"
	"github.com/heinthant/wallp-backend/internal/catalog"
	"github.com/heinthant/wallp-backend/internal/generator"
	"github.com/heinthant/wallp-backend/internal/items"
	"github.com/heinthant/wallp-backend/internal/model"
)

var hexColorRegex = regexp.MustCompile(`^#[0-9A-Fa-f]{6}$`)

type ListFestivalsInput struct {
	ListParams
	Status string `query:"status" enum:"draft,in_review,approved,scheduled,published,archived,"`
}

type ListThemesInput struct {
	ListParams
	Festival  string `query:"festival"`
	Status    string `query:"status" enum:"draft,in_review,approved,scheduled,published,archived,"`
	Style     string `query:"style"`
	Engine    string `query:"engine"`
	Generated string `query:"generated" enum:"true,false,"`
}

type CreateItemInput struct {
	RawBody []byte
}

type UpdateItemInput struct {
	IDPath
	RawBody []byte
}

type ItemPathInput struct {
	IDPath
}

type ReviewInput struct {
	IDPath
	Body struct {
		Action string  `json:"action" enum:"request,approve,reject"`
		Note   *string `json:"note,omitempty"`
	}
}

type ScheduleInput struct {
	IDPath
	Body struct {
		At *time.Time `json:"at"`
	}
}

type ReorderFestivalsInput struct {
	Body struct {
		IDs []string `json:"ids"`
	}
}

type ReorderBannersInput struct {
	Body struct {
		IDs []string `json:"ids"`
	}
}

type ListWallpapersInput struct {
	ListParams
	Festival string `query:"festival"`
	Status   string `query:"status" enum:"draft,in_review,approved,scheduled,published,archived,"`
	Kind     string `query:"kind" enum:"scene,image,"`
}

type ListFontsInput struct {
	ListParams
	Status   string `query:"status" enum:"draft,in_review,approved,scheduled,published,archived,"`
	Category string `query:"category"`
	Family   string `query:"family"`
}

type ListIconPacksInput struct {
	ListParams
	Festival string `query:"festival"`
	Status   string `query:"status" enum:"draft,in_review,approved,scheduled,published,archived,"`
	Kind     string `query:"kind" enum:"painted,images,"`
}

type ListBannersInput struct {
	ListParams
	Festival string `query:"festival"`
	Status   string `query:"status" enum:"draft,in_review,approved,scheduled,published,archived,"`
}

type ValidateInput struct {
	Kind    string `path:"kind"`
	RawBody []byte
}

type ItemOutput struct {
	Body items.ItemView
}

type ListItemsOutput struct {
	Body items.Page[items.ItemView]
}

type ExportOutput struct {
	HeaderContentDisposition string `header:"Content-Disposition"`
	HeaderContentType        string `header:"Content-Type"`
	Body                     json.RawMessage
}

type EnginesOutput struct {
	Body struct {
		Engines    []catalog.Engine `json:"engines"`
		EventIcons []string         `json:"eventIcons"`
	}
}

type ValidateOutput struct {
	Body []catalog.FieldError
}

type SimpleOKOutput struct {
	Body struct {
		OK bool `json:"ok"`
	}
}

type GenerateThemeInput struct {
	Body struct {
		FestivalID  string            `json:"festivalId" doc:"Festival ID (must exist)"`
		Mood        string            `json:"mood,omitempty" doc:"Theme mood: classic, cozy, minimal, cute"`
		BaseColor   string            `json:"baseColor,omitempty" doc:"Hex color code"`
		Engine      string            `json:"engine,omitempty" doc:"Engine (halloween, christmas, thingyan, layers)"`
		Description string            `json:"description,omitempty"`
		Seed        *int64            `json:"seed,omitempty"`
		Count       *int              `json:"count,omitempty"`
		Around      *catalog.Palette  `json:"around,omitempty"`
		RecipeID    *string           `json:"recipeId,omitempty"`
		Locked      *generator.Locked `json:"locked,omitempty"`
	}
}

type GeneratedOption struct {
	Data   catalog.ThemeDetail `json:"data"`
	Checks []generator.Check   `json:"checks"`
	Seed   int64               `json:"seed"`
}

type GenerateThemeOutput struct {
	Body struct {
		Seed    int64             `json:"seed"`
		Options []GeneratedOption `json:"options"`
	}
}

func parseItemPayload(raw []byte) (data []byte, updatedAt *time.Time, generatedFrom []byte, err error) {
	if len(raw) == 0 {
		return nil, nil, nil, apierr.Invalid("body", "Request body is required")
	}
	var wrapper struct {
		Data          json.RawMessage `json:"data"`
		UpdatedAt     *time.Time      `json:"updatedAt"`
		GeneratedFrom json.RawMessage `json:"generatedFrom"`
	}
	if err := json.Unmarshal(raw, &wrapper); err == nil && len(wrapper.Data) > 0 && string(wrapper.Data) != "null" {
		var gf []byte
		if len(wrapper.GeneratedFrom) > 0 && string(wrapper.GeneratedFrom) != "null" {
			gf = wrapper.GeneratedFrom
		}
		return wrapper.Data, wrapper.UpdatedAt, gf, nil
	}

	var rawMap map[string]any
	if err := json.Unmarshal(raw, &rawMap); err != nil {
		return nil, nil, nil, apierr.Invalid("data", "Invalid JSON")
	}
	if uStr, ok := rawMap["updatedAt"].(string); ok {
		if t, err := time.Parse(time.RFC3339Nano, uStr); err == nil {
			updatedAt = &t
		} else if t, err := time.Parse(time.RFC3339, uStr); err == nil {
			updatedAt = &t
		}
		delete(rawMap, "updatedAt")
	}
	var gf []byte
	if gfVal, ok := rawMap["generatedFrom"]; ok && gfVal != nil {
		gf, _ = json.Marshal(gfVal)
		delete(rawMap, "generatedFrom")
	}
	cleanData, err := json.Marshal(rawMap)
	if err == nil {
		return cleanData, updatedAt, gf, nil
	}
	return raw, updatedAt, gf, nil
}

func registerCatalogItems(h huma.API, d *Deps) {
	festivals := items.NewStore(d.DB, items.FestivalKind)
	themes := items.NewStore(d.DB, items.ThemeKind)
	wallpapers := items.NewStore(d.DB, items.WallpaperKind)
	fonts := items.NewStore(d.DB, items.FontKind)
	iconPacks := items.NewStore(d.DB, items.IconPackKind)
	banners := items.NewStore(d.DB, items.BannerKind)

	festivalTags := []string{"Festivals"}
	themeTags := []string{"Themes"}
	wallpaperTags := []string{"Wallpapers"}
	fontTags := []string{"Fonts"}
	iconPackTags := []string{"Icon Packs"}
	bannerTags := []string{"Banners"}
	engineTags := []string{"Engines"}
	validateTags := []string{"Validation"}

	wp := adminPrefix + "/wallpapers"
	fontp := adminPrefix + "/fonts"
	ip := adminPrefix + "/icon-packs"
	bp := adminPrefix + "/banners"

	// --- Festivals ---
	fp := adminPrefix + "/festivals"

	huma.Register(h, auth.Admin(huma.Operation{
		OperationID: "list-festivals",
		Method:      http.MethodGet,
		Path:        fp,
		Summary:     "List festivals",
		Tags:        festivalTags,
	}), func(ctx context.Context, in *ListFestivalsInput) (*ListItemsOutput, error) {
		res, err := festivals.List(ctx, items.ListFilter{
			Page:    in.Page,
			PerPage: in.PerPage,
			Sort:    in.Sort,
			Q:       in.Q,
			Status:  in.Status,
		})
		if err != nil {
			return nil, err
		}
		return &ListItemsOutput{Body: *res}, nil
	})

	huma.Register(h, auth.Admin(huma.Operation{
		OperationID:   "create-festival",
		Method:        http.MethodPost,
		Path:          fp,
		Summary:       "Create a festival draft",
		Tags:          festivalTags,
		DefaultStatus: http.StatusCreated,
	}, model.RoleDesigner, model.RoleReviewer), func(ctx context.Context, in *CreateItemInput) (*ItemOutput, error) {
		me := auth.From(ctx)
		creator := "system"
		if me != nil {
			creator = me.Name
		}
		data, _, _, err := parseItemPayload(in.RawBody)
		if err != nil {
			return nil, err
		}
		res, err := festivals.Create(ctx, data, creator)
		if err != nil {
			return nil, err
		}
		return &ItemOutput{Body: *res}, nil
	})

	huma.Register(h, auth.Admin(huma.Operation{
		OperationID: "reorder-festivals",
		Method:      http.MethodPut,
		Path:        fp + "/order",
		Summary:     "Reorder festivals",
		Tags:        festivalTags,
	}, model.RoleAdmin), func(ctx context.Context, in *ReorderFestivalsInput) (*SimpleOKOutput, error) {
		me := auth.From(ctx)
		updater := "system"
		if me != nil {
			updater = me.Name
		}
		if err := festivals.Reorder(ctx, in.Body.IDs, updater); err != nil {
			return nil, err
		}
		out := &SimpleOKOutput{}
		out.Body.OK = true
		return out, nil
	})

	huma.Register(h, auth.Admin(huma.Operation{
		OperationID: "get-festival",
		Method:      http.MethodGet,
		Path:        fp + "/{id}",
		Summary:     "Get a festival",
		Tags:        festivalTags,
	}), func(ctx context.Context, in *ItemPathInput) (*ItemOutput, error) {
		res, err := festivals.Get(ctx, in.ID)
		if err != nil {
			return nil, err
		}
		return &ItemOutput{Body: *res}, nil
	})

	huma.Register(h, auth.Admin(huma.Operation{
		OperationID: "update-festival",
		Method:      http.MethodPatch,
		Path:        fp + "/{id}",
		Summary:     "Update a festival",
		Tags:        festivalTags,
	}, model.RoleDesigner, model.RoleReviewer), func(ctx context.Context, in *UpdateItemInput) (*ItemOutput, error) {
		me := auth.From(ctx)
		updater := "system"
		if me != nil {
			updater = me.Name
		}
		data, updatedAt, _, err := parseItemPayload(in.RawBody)
		if err != nil {
			return nil, err
		}
		res, err := festivals.Update(ctx, in.ID, data, updatedAt, updater)
		if err != nil {
			return nil, err
		}
		return &ItemOutput{Body: *res}, nil
	})

	huma.Register(h, auth.Admin(huma.Operation{
		OperationID: "archive-festival",
		Method:      http.MethodDelete,
		Path:        fp + "/{id}",
		Summary:     "Archive a festival",
		Tags:        festivalTags,
	}, model.RoleAdmin), func(ctx context.Context, in *ItemPathInput) (*ItemOutput, error) {
		me := auth.From(ctx)
		updater := "system"
		if me != nil {
			updater = me.Name
		}
		res, err := festivals.Archive(ctx, in.ID, updater)
		if err != nil {
			return nil, err
		}
		return &ItemOutput{Body: *res}, nil
	})

	huma.Register(h, auth.Admin(huma.Operation{
		OperationID: "restore-festival",
		Method:      http.MethodPost,
		Path:        fp + "/{id}/restore",
		Summary:     "Restore an archived festival",
		Tags:        festivalTags,
	}, model.RoleAdmin), func(ctx context.Context, in *ItemPathInput) (*ItemOutput, error) {
		me := auth.From(ctx)
		updater := "system"
		if me != nil {
			updater = me.Name
		}
		res, err := festivals.Restore(ctx, in.ID, updater)
		if err != nil {
			return nil, err
		}
		return &ItemOutput{Body: *res}, nil
	})

	// --- Themes ---
	tp := adminPrefix + "/themes"

	huma.Register(h, auth.Admin(huma.Operation{
		OperationID: "list-themes",
		Method:      http.MethodGet,
		Path:        tp,
		Summary:     "List themes",
		Tags:        themeTags,
	}), func(ctx context.Context, in *ListThemesInput) (*ListItemsOutput, error) {
		var genFilter *bool
		if in.Generated == "true" {
			v := true
			genFilter = &v
		} else if in.Generated == "false" {
			v := false
			genFilter = &v
		}
		res, err := themes.List(ctx, items.ListFilter{
			Page:       in.Page,
			PerPage:    in.PerPage,
			Sort:       in.Sort,
			Q:          in.Q,
			Status:     in.Status,
			FestivalID: in.Festival,
			Generated:  genFilter,
			Extras: map[string]string{
				"style":  in.Style,
				"engine": in.Engine,
			},
		})
		if err != nil {
			return nil, err
		}
		return &ListItemsOutput{Body: *res}, nil
	})

	huma.Register(h, auth.Admin(huma.Operation{
		OperationID:   "create-theme",
		Method:        http.MethodPost,
		Path:          tp,
		Summary:       "Create a theme draft",
		Tags:          themeTags,
		DefaultStatus: http.StatusCreated,
	}, model.RoleDesigner, model.RoleReviewer), func(ctx context.Context, in *CreateItemInput) (*ItemOutput, error) {
		me := auth.From(ctx)
		creator := "system"
		if me != nil {
			creator = me.Name
		}
		data, _, gf, err := parseItemPayload(in.RawBody)
		if err != nil {
			return nil, err
		}
		res, err := themes.CreateWithOptions(ctx, items.CreateOptions{
			Data:          data,
			CreatorName:   creator,
			GeneratedFrom: gf,
		})
		if err != nil {
			return nil, err
		}
		return &ItemOutput{Body: *res}, nil
	})

	huma.Register(h, auth.Admin(huma.Operation{
		OperationID: "get-theme",
		Method:      http.MethodGet,
		Path:        tp + "/{id}",
		Summary:     "Get a theme",
		Tags:        themeTags,
	}), func(ctx context.Context, in *ItemPathInput) (*ItemOutput, error) {
		res, err := themes.Get(ctx, in.ID)
		if err != nil {
			return nil, err
		}
		return &ItemOutput{Body: *res}, nil
	})

	huma.Register(h, auth.Admin(huma.Operation{
		OperationID: "update-theme",
		Method:      http.MethodPatch,
		Path:        tp + "/{id}",
		Summary:     "Update a theme",
		Tags:        themeTags,
	}, model.RoleDesigner, model.RoleReviewer), func(ctx context.Context, in *UpdateItemInput) (*ItemOutput, error) {
		me := auth.From(ctx)
		updater := "system"
		if me != nil {
			updater = me.Name
		}
		data, updatedAt, gf, err := parseItemPayload(in.RawBody)
		if err != nil {
			return nil, err
		}
		res, err := themes.UpdateWithOptions(ctx, in.ID, items.UpdateOptions{
			Data:            data,
			ClientUpdatedAt: updatedAt,
			UpdaterName:     updater,
			GeneratedFrom:   gf,
		})
		if err != nil {
			return nil, err
		}
		return &ItemOutput{Body: *res}, nil
	})

	huma.Register(h, auth.Admin(huma.Operation{
		OperationID:   "duplicate-theme",
		Method:        http.MethodPost,
		Path:          tp + "/{id}/duplicate",
		Summary:       "Duplicate a theme as a new draft",
		Tags:          themeTags,
		DefaultStatus: http.StatusCreated,
	}, model.RoleDesigner, model.RoleReviewer), func(ctx context.Context, in *ItemPathInput) (*ItemOutput, error) {
		me := auth.From(ctx)
		creator := "system"
		if me != nil {
			creator = me.Name
		}
		res, err := themes.Duplicate(ctx, in.ID, creator)
		if err != nil {
			return nil, err
		}
		return &ItemOutput{Body: *res}, nil
	})

	huma.Register(h, auth.Admin(huma.Operation{
		OperationID: "review-theme",
		Method:      http.MethodPost,
		Path:        tp + "/{id}/review",
		Summary:     "Transition a theme review status",
		Tags:        themeTags,
	}, model.RoleDesigner, model.RoleReviewer), func(ctx context.Context, in *ReviewInput) (*ItemOutput, error) {
		me := auth.From(ctx)
		if me == nil {
			return nil, apierr.Unauthorized("Sign in required")
		}
		res, err := themes.Transition(ctx, in.ID, in.Body.Action, in.Body.Note, me.Name, me.Role)
		if err != nil {
			return nil, err
		}
		return &ItemOutput{Body: *res}, nil
	})

	huma.Register(h, auth.Admin(huma.Operation{
		OperationID: "schedule-theme",
		Method:      http.MethodPost,
		Path:        tp + "/{id}/schedule",
		Summary:     "Schedule or unschedule a theme",
		Tags:        themeTags,
	}, model.RoleReviewer), func(ctx context.Context, in *ScheduleInput) (*ItemOutput, error) {
		me := auth.From(ctx)
		updater := "system"
		if me != nil {
			updater = me.Name
		}
		res, err := themes.Schedule(ctx, in.ID, in.Body.At, updater)
		if err != nil {
			return nil, err
		}
		return &ItemOutput{Body: *res}, nil
	})

	huma.Register(h, auth.Admin(huma.Operation{
		OperationID: "archive-theme",
		Method:      http.MethodPost,
		Path:        tp + "/{id}/archive",
		Summary:     "Archive a theme",
		Tags:        themeTags,
	}, model.RoleAdmin), func(ctx context.Context, in *ItemPathInput) (*ItemOutput, error) {
		me := auth.From(ctx)
		updater := "system"
		if me != nil {
			updater = me.Name
		}
		res, err := themes.Archive(ctx, in.ID, updater)
		if err != nil {
			return nil, err
		}
		return &ItemOutput{Body: *res}, nil
	})

	huma.Register(h, auth.Admin(huma.Operation{
		OperationID: "restore-theme",
		Method:      http.MethodPost,
		Path:        tp + "/{id}/restore",
		Summary:     "Restore an archived theme",
		Tags:        themeTags,
	}, model.RoleAdmin), func(ctx context.Context, in *ItemPathInput) (*ItemOutput, error) {
		me := auth.From(ctx)
		updater := "system"
		if me != nil {
			updater = me.Name
		}
		res, err := themes.Restore(ctx, in.ID, updater)
		if err != nil {
			return nil, err
		}
		return &ItemOutput{Body: *res}, nil
	})

	huma.Register(h, auth.Admin(huma.Operation{
		OperationID: "export-theme",
		Method:      http.MethodGet,
		Path:        tp + "/{id}/export",
		Summary:     "Export raw theme data JSON",
		Tags:        themeTags,
	}), func(ctx context.Context, in *ItemPathInput) (*ExportOutput, error) {
		res, err := themes.Get(ctx, in.ID)
		if err != nil {
			return nil, err
		}
		filename := fmt.Sprintf("%s.%d.json", res.ID, res.Rev)
		return &ExportOutput{
			HeaderContentDisposition: fmt.Sprintf("attachment; filename=\"%s\"", filename),
			HeaderContentType:        "application/json",
			Body:                     json.RawMessage(res.Data),
		}, nil
	})

	huma.Register(h, auth.Admin(huma.Operation{
		OperationID: "delete-theme",
		Method:      http.MethodDelete,
		Path:        tp + "/{id}",
		Summary:     "Archive a theme",
		Tags:        themeTags,
	}, model.RoleAdmin), func(ctx context.Context, in *ItemPathInput) (*ItemOutput, error) {
		me := auth.From(ctx)
		updater := "system"
		if me != nil {
			updater = me.Name
		}
		res, err := themes.Archive(ctx, in.ID, updater)
		if err != nil {
			return nil, err
		}
		return &ItemOutput{Body: *res}, nil
	})

	// --- Wallpapers ---
	huma.Register(h, auth.Admin(huma.Operation{
		OperationID: "list-wallpapers",
		Method:      http.MethodGet,
		Path:        wp,
		Summary:     "List wallpapers",
		Tags:        wallpaperTags,
	}), func(ctx context.Context, in *ListWallpapersInput) (*ListItemsOutput, error) {
		extras := map[string]string{}
		if in.Kind != "" {
			extras["kind"] = in.Kind
		}
		res, err := wallpapers.List(ctx, items.ListFilter{
			Page:       in.Page,
			PerPage:    in.PerPage,
			Sort:       in.Sort,
			Q:          in.Q,
			Status:     in.Status,
			FestivalID: in.Festival,
			Extras:     extras,
		})
		if err != nil {
			return nil, err
		}
		return &ListItemsOutput{Body: *res}, nil
	})
	registerItemStandardRoutes(h, wallpapers, "wallpaper", wp, wallpaperTags)

	// --- Fonts ---
	huma.Register(h, auth.Admin(huma.Operation{
		OperationID: "list-fonts",
		Method:      http.MethodGet,
		Path:        fontp,
		Summary:     "List fonts",
		Tags:        fontTags,
	}), func(ctx context.Context, in *ListFontsInput) (*ListItemsOutput, error) {
		extras := map[string]string{}
		if in.Category != "" {
			extras["category"] = in.Category
		}
		if in.Family != "" {
			extras["family"] = in.Family
		}
		res, err := fonts.List(ctx, items.ListFilter{
			Page:    in.Page,
			PerPage: in.PerPage,
			Sort:    in.Sort,
			Q:       in.Q,
			Status:  in.Status,
			Extras:  extras,
		})
		if err != nil {
			return nil, err
		}
		return &ListItemsOutput{Body: *res}, nil
	})
	registerItemStandardRoutes(h, fonts, "font", fontp, fontTags)
	registerGoogleFonts(h, d, fonts)

	// --- Icon Packs ---
	huma.Register(h, auth.Admin(huma.Operation{
		OperationID: "list-icon-packs",
		Method:      http.MethodGet,
		Path:        ip,
		Summary:     "List icon packs",
		Tags:        iconPackTags,
	}), func(ctx context.Context, in *ListIconPacksInput) (*ListItemsOutput, error) {
		extras := map[string]string{}
		if in.Kind != "" {
			extras["kind"] = in.Kind
		}
		res, err := iconPacks.List(ctx, items.ListFilter{
			Page:       in.Page,
			PerPage:    in.PerPage,
			Sort:       in.Sort,
			Q:          in.Q,
			Status:     in.Status,
			FestivalID: in.Festival,
			Extras:     extras,
		})
		if err != nil {
			return nil, err
		}
		return &ListItemsOutput{Body: *res}, nil
	})
	registerItemStandardRoutes(h, iconPacks, "icon-pack", ip, iconPackTags)

	// --- Banners ---
	huma.Register(h, auth.Admin(huma.Operation{
		OperationID: "reorder-banners",
		Method:      http.MethodPut,
		Path:        bp + "/order",
		Summary:     "Reorder banners",
		Tags:        bannerTags,
	}, model.RoleAdmin), func(ctx context.Context, in *ReorderBannersInput) (*SimpleOKOutput, error) {
		me := auth.From(ctx)
		updater := "system"
		if me != nil {
			updater = me.Name
		}
		if err := banners.Reorder(ctx, in.Body.IDs, updater); err != nil {
			return nil, err
		}
		out := &SimpleOKOutput{}
		out.Body.OK = true
		return out, nil
	})

	huma.Register(h, auth.Admin(huma.Operation{
		OperationID: "list-banners",
		Method:      http.MethodGet,
		Path:        bp,
		Summary:     "List banners",
		Tags:        bannerTags,
	}), func(ctx context.Context, in *ListBannersInput) (*ListItemsOutput, error) {
		res, err := banners.List(ctx, items.ListFilter{
			Page:       in.Page,
			PerPage:    in.PerPage,
			Sort:       in.Sort,
			Q:          in.Q,
			Status:     in.Status,
			FestivalID: in.Festival,
		})
		if err != nil {
			return nil, err
		}
		return &ListItemsOutput{Body: *res}, nil
	})
	registerItemStandardRoutes(h, banners, "banner", bp, bannerTags)

	// --- Engines ---
	huma.Register(h, auth.Admin(huma.Operation{
		OperationID: "get-engines",
		Method:      http.MethodGet,
		Path:        adminPrefix + "/engines",
		Summary:     "Get embedded engines and event icons",
		Tags:        engineTags,
	}), func(ctx context.Context, in *struct{}) (*EnginesOutput, error) {
		out := &EnginesOutput{}
		out.Body.Engines = catalog.EmbeddedEngines.Engines
		out.Body.EventIcons = catalog.EventIcons
		return out, nil
	})

	// --- Validate ---
	huma.Register(h, auth.Admin(huma.Operation{
		OperationID: "validate-kind",
		Method:      http.MethodPost,
		Path:        adminPrefix + "/validate/{kind}",
		Summary:     "Validate an item against catalog rules",
		Tags:        validateTags,
	}), func(ctx context.Context, in *ValidateInput) (*ValidateOutput, error) {
		fieldErrors, err := items.ValidateKind(in.Kind, in.RawBody)
		if err != nil {
			return nil, err
		}
		if fieldErrors == nil {
			fieldErrors = []catalog.FieldError{}
		}
		return &ValidateOutput{Body: fieldErrors}, nil
	})

	// --- Generate Themes ---
	huma.Register(h, auth.Admin(huma.Operation{
		OperationID: "generate-themes",
		Method:      http.MethodPost,
		Path:        tp + "/generate",
		Summary:     "Generate theme options",
		Tags:        themeTags,
	}, model.RoleDesigner, model.RoleReviewer), func(ctx context.Context, in *GenerateThemeInput) (*GenerateThemeOutput, error) {
		if strings.TrimSpace(in.Body.FestivalID) == "" {
			return nil, apierr.Invalid("festivalId", "festivalId is required")
		}

		// 1. Festival must exist
		var festRow items.ItemRow
		err := d.DB.NewSelect().Table("festivals").
			Where("id = ?", in.Body.FestivalID).
			Column("data").
			Scan(ctx, &festRow)
		if err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				return nil, apierr.NotFound("Festival " + in.Body.FestivalID)
			}
			return nil, err
		}
		var fest catalog.Festival
		if err := json.Unmarshal(festRow.Data, &fest); err != nil {
			return nil, err
		}

		// 2. Load recipe: if recipeId given, use that; else first enabled recipe for the festival; else default recipe.
		var recipe *generator.Recipe
		if in.Body.RecipeID != nil && strings.TrimSpace(*in.Body.RecipeID) != "" {
			var recRow model.GeneratorRecipe
			if err := d.DB.NewSelect().Model(&recRow).Where("id = ?", strings.TrimSpace(*in.Body.RecipeID)).Scan(ctx); err != nil {
				if errors.Is(err, sql.ErrNoRows) {
					return nil, apierr.NotFound("Recipe " + *in.Body.RecipeID)
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

		// 3. Mood and description interpretation
		mood := in.Body.Mood
		if strings.TrimSpace(in.Body.Description) != "" {
			var extraKeywords []generator.KeywordEntry
			if recipe != nil {
				extraKeywords = recipe.KeywordEntries()
			}
			interp := generator.Interpret(in.Body.Description, extraKeywords)
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

		// 4. Validate baseColor
		if in.Body.BaseColor != "" {
			if !hexColorRegex.MatchString(in.Body.BaseColor) {
				return nil, apierr.Invalid("baseColor", "Invalid baseColor: must be a 6-digit hex color like #RRGGBB")
			}
		}

		// 5. Validate engine
		engine := in.Body.Engine
		if engine == "" {
			engine = "layers"
		}
		if !catalog.IsValidEngine(engine) {
			return nil, apierr.Invalid("engine", "Invalid engine: "+engine)
		}

		// 6. Count
		count := 6
		if in.Body.Count != nil {
			count = *in.Body.Count
			if count < 1 || count > 6 {
				return nil, apierr.Invalid("count", "Count must be between 1 and 6")
			}
		}

		// 7. Seed
		var seed int64
		if in.Body.Seed != nil {
			seed = *in.Body.Seed
		} else {
			seed = rand.Int64()
		}

		// 8. Load fonts (status published or approved)
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

		// 9. Load existing themes for deduplication
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

		genIn := generator.Input{
			FestivalID:   fest.ID,
			FestivalName: fest.Name,
			FestivalTags: fest.Tags,
			FestivalLook: &fest.Look,
			Mood:         mood,
			BaseColor:    in.Body.BaseColor,
			Engine:       engine,
			Description:  in.Body.Description,
			Seed:         seed,
			Around:       in.Body.Around,
			Fonts:        fontInfos,
			Recipe:       recipe,
			Locked:       in.Body.Locked,
			Existing:     existingThemes,
		}

		options, err := generator.Generate(genIn, count)
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

		out := &GenerateThemeOutput{}
		out.Body.Seed = seed
		out.Body.Options = outOpts
		return out, nil
	})

	registerImportExport(h, d)
}

func registerItemStandardRoutes(h huma.API, store *items.Store, singular, path string, tags []string) {
	// Create
	huma.Register(h, auth.Admin(huma.Operation{
		OperationID:   "create-" + singular,
		Method:        http.MethodPost,
		Path:          path,
		Summary:       "Create a " + singular + " draft",
		Tags:          tags,
		DefaultStatus: http.StatusCreated,
	}, model.RoleDesigner, model.RoleReviewer), func(ctx context.Context, in *CreateItemInput) (*ItemOutput, error) {
		me := auth.From(ctx)
		creator := "system"
		if me != nil {
			creator = me.Name
		}
		data, _, gf, err := parseItemPayload(in.RawBody)
		if err != nil {
			return nil, err
		}
		res, err := store.CreateWithOptions(ctx, items.CreateOptions{
			Data:          data,
			CreatorName:   creator,
			GeneratedFrom: gf,
		})
		if err != nil {
			return nil, err
		}
		return &ItemOutput{Body: *res}, nil
	})

	// Get
	huma.Register(h, auth.Admin(huma.Operation{
		OperationID: "get-" + singular,
		Method:      http.MethodGet,
		Path:        path + "/{id}",
		Summary:     "Get a " + singular,
		Tags:        tags,
	}), func(ctx context.Context, in *ItemPathInput) (*ItemOutput, error) {
		res, err := store.Get(ctx, in.ID)
		if err != nil {
			return nil, err
		}
		return &ItemOutput{Body: *res}, nil
	})

	// Update
	huma.Register(h, auth.Admin(huma.Operation{
		OperationID: "update-" + singular,
		Method:      http.MethodPatch,
		Path:        path + "/{id}",
		Summary:     "Update a " + singular,
		Tags:        tags,
	}, model.RoleDesigner, model.RoleReviewer), func(ctx context.Context, in *UpdateItemInput) (*ItemOutput, error) {
		me := auth.From(ctx)
		updater := "system"
		if me != nil {
			updater = me.Name
		}
		data, updatedAt, gf, err := parseItemPayload(in.RawBody)
		if err != nil {
			return nil, err
		}
		res, err := store.UpdateWithOptions(ctx, in.ID, items.UpdateOptions{
			Data:            data,
			ClientUpdatedAt: updatedAt,
			UpdaterName:     updater,
			GeneratedFrom:   gf,
		})
		if err != nil {
			return nil, err
		}
		return &ItemOutput{Body: *res}, nil
	})

	// Duplicate
	huma.Register(h, auth.Admin(huma.Operation{
		OperationID:   "duplicate-" + singular,
		Method:        http.MethodPost,
		Path:          path + "/{id}/duplicate",
		Summary:       "Duplicate a " + singular + " as a new draft",
		Tags:          tags,
		DefaultStatus: http.StatusCreated,
	}, model.RoleDesigner, model.RoleReviewer), func(ctx context.Context, in *ItemPathInput) (*ItemOutput, error) {
		me := auth.From(ctx)
		creator := "system"
		if me != nil {
			creator = me.Name
		}
		res, err := store.Duplicate(ctx, in.ID, creator)
		if err != nil {
			return nil, err
		}
		return &ItemOutput{Body: *res}, nil
	})

	// Review
	huma.Register(h, auth.Admin(huma.Operation{
		OperationID: "review-" + singular,
		Method:      http.MethodPost,
		Path:        path + "/{id}/review",
		Summary:     "Transition a " + singular + " review status",
		Tags:        tags,
	}, model.RoleDesigner, model.RoleReviewer), func(ctx context.Context, in *ReviewInput) (*ItemOutput, error) {
		me := auth.From(ctx)
		if me == nil {
			return nil, apierr.Unauthorized("Sign in required")
		}
		res, err := store.Transition(ctx, in.ID, in.Body.Action, in.Body.Note, me.Name, me.Role)
		if err != nil {
			return nil, err
		}
		return &ItemOutput{Body: *res}, nil
	})

	// Schedule
	huma.Register(h, auth.Admin(huma.Operation{
		OperationID: "schedule-" + singular,
		Method:      http.MethodPost,
		Path:        path + "/{id}/schedule",
		Summary:     "Schedule or unschedule a " + singular,
		Tags:        tags,
	}, model.RoleReviewer), func(ctx context.Context, in *ScheduleInput) (*ItemOutput, error) {
		me := auth.From(ctx)
		updater := "system"
		if me != nil {
			updater = me.Name
		}
		res, err := store.Schedule(ctx, in.ID, in.Body.At, updater)
		if err != nil {
			return nil, err
		}
		return &ItemOutput{Body: *res}, nil
	})

	// Delete / Archive (DELETE)
	huma.Register(h, auth.Admin(huma.Operation{
		OperationID: "delete-" + singular,
		Method:      http.MethodDelete,
		Path:        path + "/{id}",
		Summary:     "Archive a " + singular,
		Tags:        tags,
	}, model.RoleAdmin), func(ctx context.Context, in *ItemPathInput) (*ItemOutput, error) {
		me := auth.From(ctx)
		updater := "system"
		if me != nil {
			updater = me.Name
		}
		res, err := store.Archive(ctx, in.ID, updater)
		if err != nil {
			return nil, err
		}
		return &ItemOutput{Body: *res}, nil
	})

	// Archive (POST /{id}/archive)
	huma.Register(h, auth.Admin(huma.Operation{
		OperationID: "archive-" + singular,
		Method:      http.MethodPost,
		Path:        path + "/{id}/archive",
		Summary:     "Archive a " + singular,
		Tags:        tags,
	}, model.RoleAdmin), func(ctx context.Context, in *ItemPathInput) (*ItemOutput, error) {
		me := auth.From(ctx)
		updater := "system"
		if me != nil {
			updater = me.Name
		}
		res, err := store.Archive(ctx, in.ID, updater)
		if err != nil {
			return nil, err
		}
		return &ItemOutput{Body: *res}, nil
	})

	// Restore (POST /{id}/restore)
	huma.Register(h, auth.Admin(huma.Operation{
		OperationID: "restore-" + singular,
		Method:      http.MethodPost,
		Path:        path + "/{id}/restore",
		Summary:     "Restore an archived " + singular,
		Tags:        tags,
	}, model.RoleAdmin), func(ctx context.Context, in *ItemPathInput) (*ItemOutput, error) {
		me := auth.From(ctx)
		updater := "system"
		if me != nil {
			updater = me.Name
		}
		res, err := store.Restore(ctx, in.ID, updater)
		if err != nil {
			return nil, err
		}
		return &ItemOutput{Body: *res}, nil
	})

	// Export (GET /{id}/export)
	huma.Register(h, auth.Admin(huma.Operation{
		OperationID: "export-" + singular,
		Method:      http.MethodGet,
		Path:        path + "/{id}/export",
		Summary:     "Export raw " + singular + " data JSON",
		Tags:        tags,
	}), func(ctx context.Context, in *ItemPathInput) (*ExportOutput, error) {
		res, err := store.Get(ctx, in.ID)
		if err != nil {
			return nil, err
		}
		filename := fmt.Sprintf("%s.%d.json", res.ID, res.Rev)
		return &ExportOutput{
			HeaderContentDisposition: fmt.Sprintf("attachment; filename=\"%s\"", filename),
			HeaderContentType:        "application/json",
			Body:                     json.RawMessage(res.Data),
		}, nil
	})
}
