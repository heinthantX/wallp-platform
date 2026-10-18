package api

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/danielgtaylor/huma/v2"

	"github.com/heinthant/wallp-backend/internal/apierr"
	"github.com/heinthant/wallp-backend/internal/auth"
	"github.com/heinthant/wallp-backend/internal/catalog"
	"github.com/heinthant/wallp-backend/internal/items"
	"github.com/heinthant/wallp-backend/internal/model"
)

type ListFestivalsInput struct {
	ListParams
	Status string `query:"status" enum:"draft,in_review,approved,scheduled,published,archived,"`
}

type ListThemesInput struct {
	ListParams
	Festival string `query:"festival"`
	Status   string `query:"status" enum:"draft,in_review,approved,scheduled,published,archived,"`
	Style    string `query:"style"`
	Engine   string `query:"engine"`
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

func parseItemPayload(raw []byte) (data []byte, updatedAt *time.Time, err error) {
	if len(raw) == 0 {
		return nil, nil, apierr.Invalid("body", "Request body is required")
	}
	var wrapper struct {
		Data      json.RawMessage `json:"data"`
		UpdatedAt *time.Time      `json:"updatedAt"`
	}
	if err := json.Unmarshal(raw, &wrapper); err == nil && len(wrapper.Data) > 0 && string(wrapper.Data) != "null" {
		return wrapper.Data, wrapper.UpdatedAt, nil
	}

	var rawMap map[string]any
	if err := json.Unmarshal(raw, &rawMap); err != nil {
		return nil, nil, apierr.Invalid("data", "Invalid JSON")
	}
	if uStr, ok := rawMap["updatedAt"].(string); ok {
		if t, err := time.Parse(time.RFC3339Nano, uStr); err == nil {
			updatedAt = &t
		} else if t, err := time.Parse(time.RFC3339, uStr); err == nil {
			updatedAt = &t
		}
		delete(rawMap, "updatedAt")
		cleanData, err := json.Marshal(rawMap)
		if err == nil {
			return cleanData, updatedAt, nil
		}
	}
	return raw, updatedAt, nil
}

func registerCatalogItems(h huma.API, d *Deps) {
	festivals := items.NewStore(d.DB, items.FestivalKind)
	themes := items.NewStore(d.DB, items.ThemeKind)

	festivalTags := []string{"Festivals"}
	themeTags := []string{"Themes"}
	engineTags := []string{"Engines"}
	validateTags := []string{"Validation"}

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
		data, _, err := parseItemPayload(in.RawBody)
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
		data, updatedAt, err := parseItemPayload(in.RawBody)
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
		res, err := themes.List(ctx, items.ListFilter{
			Page:       in.Page,
			PerPage:    in.PerPage,
			Sort:       in.Sort,
			Q:          in.Q,
			Status:     in.Status,
			FestivalID: in.Festival,
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
		data, _, err := parseItemPayload(in.RawBody)
		if err != nil {
			return nil, err
		}
		res, err := themes.Create(ctx, data, creator)
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
		data, updatedAt, err := parseItemPayload(in.RawBody)
		if err != nil {
			return nil, err
		}
		res, err := themes.Update(ctx, in.ID, data, updatedAt, updater)
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
}
