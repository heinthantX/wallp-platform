package api

import (
	"context"
	"database/sql"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/danielgtaylor/huma/v2"
	"github.com/google/uuid"
	"github.com/uptrace/bun"

	"github.com/heinthant/wallp-backend/internal/apierr"
	"github.com/heinthant/wallp-backend/internal/auth"
	"github.com/heinthant/wallp-backend/internal/model"
)

type AppRegisterInput struct {
	Body struct {
		Email       string `json:"email" format:"email" maxLength:"254"`
		Password    string `json:"password" minLength:"10" maxLength:"256"`
		DisplayName string `json:"displayName" minLength:"1" maxLength:"60"`
	}
}

type AppLoginInput struct {
	Body struct {
		Email    string `json:"email" format:"email" maxLength:"254"`
		Password string `json:"password" minLength:"1" maxLength:"256"`
	}
}

type AppRefreshInput struct {
	Body struct {
		RefreshToken string `json:"refreshToken" minLength:"1" maxLength:"200"`
	}
}

type AppSessionOutput struct {
	Body AppSession
}

type AppMeOutput struct {
	Body AppUserView
}

type AppUpdateMeInput struct {
	Body struct {
		DisplayName     *string `json:"displayName,omitempty" minLength:"1" maxLength:"60"`
		CurrentPassword string  `json:"currentPassword,omitempty" maxLength:"256"`
		NewPassword     string  `json:"newPassword,omitempty" maxLength:"256"`
	}
}

type AppDeleteMeInput struct {
	Body struct {
		Password string `json:"password" minLength:"1" maxLength:"256"`
	}
}

type AppSessionsInput struct {
	RefreshToken string `header:"X-Refresh-Token" doc:"Optional, marks the current session"`
}

type AppSessionsOutput struct {
	Body struct {
		Sessions []SessionView `json:"sessions"`
	}
}

type AppIDPath struct {
	ID string `path:"id" maxLength:"100"`
}

type AppFavouriteItem struct {
	ItemType string `json:"itemType" enum:"theme,wallpaper,font,icon-pack"`
	ItemID   string `json:"itemId" pattern:"^[a-z0-9]+(-[a-z0-9]+)*$" maxLength:"100"`
}

type AppFavouriteView struct {
	ItemType  string    `json:"itemType"`
	ItemID    string    `json:"itemId"`
	CreatedAt time.Time `json:"createdAt"`
}

type AppFavouritesOutput struct {
	Body struct {
		Items []AppFavouriteView `json:"items"`
	}
}

type AppPutFavouritesInput struct {
	Body struct {
		Items []AppFavouriteItem `json:"items" maxItems:"1000"`
	}
}

type AppAddFavouriteInput struct {
	Body struct {
		ItemType string `json:"itemType" enum:"theme,wallpaper,font,icon-pack"`
		ItemID   string `json:"itemId" pattern:"^[a-z0-9]+(-[a-z0-9]+)*$" maxLength:"100"`
	}
}

type AppRemoveFavouriteInput struct {
	ItemType string `path:"itemType" enum:"theme,wallpaper,font,icon-pack"`
	ItemID   string `path:"itemId" pattern:"^[a-z0-9]+(-[a-z0-9]+)*$" maxLength:"100"`
}

type AppLinkInstallInput struct {
	Body struct {
		InstallID  string `json:"installId" format:"uuid"`
		AppVersion string `json:"appVersion" maxLength:"40"`
	}
}

func registerAppAuth(h huma.API, d *Deps) {
	tags := []string{"App accounts"}

	huma.Register(h, huma.Operation{
		OperationID:   "app-register",
		Method:        http.MethodPost,
		Path:          appPrefix + "/auth/register",
		Summary:       "Register a new app account",
		Tags:          tags,
		DefaultStatus: http.StatusCreated,
	}, func(ctx context.Context, in *AppRegisterInput) (*AppSessionOutput, error) {
		email := normEmail(in.Body.Email)
		if err := auth.ValidatePassword(in.Body.Password); err != nil {
			return nil, apierr.Invalid("password", err.Error())
		}
		exists, err := d.DB.NewSelect().Model((*model.AppUser)(nil)).Where("email = ?", email).Exists(ctx)
		if err != nil {
			return nil, err
		}
		if exists {
			// ponytail: timing and the success response still differ; real fix needs email verification.
			return nil, apierr.New(http.StatusUnprocessableEntity, "registration_failed", "Could not create an account with these details")
		}
		hash, err := auth.HashPassword(in.Body.Password)
		if err != nil {
			return nil, err
		}
		now := time.Now().UTC()
		u := &model.AppUser{
			ID:           uuid.NewString(),
			Email:        email,
			DisplayName:  strings.TrimSpace(in.Body.DisplayName),
			PasswordHash: hash,
			CreatedAt:    now,
			UpdatedAt:    now,
		}
		if _, err := d.DB.NewInsert().Model(u).Exec(ctx); err != nil {
			return nil, err
		}
		tokens, err := d.Auth.Issue(ctx, model.SubjectApp, u.ID, "", u.DisplayName, auth.MetaFrom(ctx))
		if err != nil {
			return nil, err
		}
		return &AppSessionOutput{Body: AppSession{Tokens: *tokens, User: appView(u)}}, nil
	})

	huma.Register(h, huma.Operation{
		OperationID: "app-login",
		Method:      http.MethodPost,
		Path:        appPrefix + "/auth/login",
		Summary:     "Sign in to an app account",
		Tags:        tags,
	}, func(ctx context.Context, in *AppLoginInput) (*AppSessionOutput, error) {
		u := new(model.AppUser)
		err := d.DB.NewSelect().Model(u).Where("email = ?", normEmail(in.Body.Email)).Scan(ctx)
		if err != nil && !errors.Is(err, sql.ErrNoRows) {
			return nil, err
		}
		if !auth.CheckPasswordOrDummy(u.PasswordHash, in.Body.Password) {
			return nil, apierr.New(http.StatusUnauthorized, "bad_credentials", "Wrong email or password")
		}
		tokens, err := d.Auth.Issue(ctx, model.SubjectApp, u.ID, "", u.DisplayName, auth.MetaFrom(ctx))
		if err != nil {
			return nil, err
		}
		return &AppSessionOutput{Body: AppSession{Tokens: *tokens, User: appView(u)}}, nil
	})

	huma.Register(h, huma.Operation{
		OperationID: "app-refresh",
		Method:      http.MethodPost,
		Path:        appPrefix + "/auth/refresh",
		Summary:     "Refresh app session tokens",
		Tags:        tags,
	}, func(ctx context.Context, in *AppRefreshInput) (*AppSessionOutput, error) {
		t, err := d.Auth.Refresh(ctx, model.SubjectApp, in.Body.RefreshToken, auth.MetaFrom(ctx), auth.AppLookup)
		if err != nil {
			return nil, refreshErr(err)
		}
		c, _ := d.Auth.Parse(t.AccessToken, auth.TypeAccess)
		u := new(model.AppUser)
		if err := d.DB.NewSelect().Model(u).Where("id = ?", c.Subject).Scan(ctx); err != nil {
			return nil, err
		}
		return &AppSessionOutput{Body: AppSession{Tokens: *t, User: appView(u)}}, nil
	})

	huma.Register(h, huma.Operation{
		OperationID:   "app-logout",
		Method:        http.MethodPost,
		Path:          appPrefix + "/auth/logout",
		Summary:       "Sign out app session",
		Tags:          tags,
		DefaultStatus: http.StatusNoContent,
	}, func(ctx context.Context, in *AppRefreshInput) (*struct{}, error) {
		return nil, d.Auth.Revoke(ctx, model.SubjectApp, in.Body.RefreshToken)
	})

	huma.Register(h, auth.App(huma.Operation{
		OperationID: "app-me",
		Method:      http.MethodGet,
		Path:        appPrefix + "/me",
		Summary:     "Get current app user",
		Tags:        tags,
	}), func(ctx context.Context, _ *struct{}) (*AppMeOutput, error) {
		u, err := d.loadAppUser(ctx, auth.From(ctx).ID)
		if err != nil {
			return nil, err
		}
		return &AppMeOutput{Body: appView(u)}, nil
	})

	huma.Register(h, auth.App(huma.Operation{
		OperationID: "app-update-me",
		Method:      http.MethodPatch,
		Path:        appPrefix + "/me",
		Summary:     "Update current app user",
		Tags:        tags,
	}), func(ctx context.Context, in *AppUpdateMeInput) (*AppMeOutput, error) {
		u, err := d.loadAppUser(ctx, auth.From(ctx).ID)
		if err != nil {
			return nil, err
		}
		if in.Body.DisplayName != nil {
			u.DisplayName = strings.TrimSpace(*in.Body.DisplayName)
		}
		pwChanged := false
		if in.Body.NewPassword != "" {
			if !auth.CheckPassword(u.PasswordHash, in.Body.CurrentPassword) {
				return nil, apierr.Invalid("currentPassword", "Current password is wrong")
			}
			if err := auth.ValidatePassword(in.Body.NewPassword); err != nil {
				return nil, apierr.Invalid("newPassword", err.Error())
			}
			if u.PasswordHash, err = auth.HashPassword(in.Body.NewPassword); err != nil {
				return nil, err
			}
			pwChanged = true
		}
		u.UpdatedAt = time.Now().UTC()
		err = d.DB.RunInTx(ctx, nil, func(ctx context.Context, tx bun.Tx) error {
			if _, err := tx.NewUpdate().Model(u).Column("display_name", "password_hash", "updated_at").WherePK().Exec(ctx); err != nil {
				return err
			}
			if pwChanged {
				if err := d.Auth.RevokeUser(ctx, tx, model.SubjectApp, u.ID); err != nil {
					return err
				}
			}
			return nil
		})
		if err != nil {
			return nil, err
		}
		return &AppMeOutput{Body: appView(u)}, nil
	})

	huma.Register(h, auth.App(huma.Operation{
		OperationID:   "app-delete-me",
		Method:        http.MethodDelete,
		Path:          appPrefix + "/me",
		Summary:       "Delete current app user",
		Tags:          tags,
		DefaultStatus: http.StatusNoContent,
	}), func(ctx context.Context, in *AppDeleteMeInput) (*struct{}, error) {
		u, err := d.loadAppUser(ctx, auth.From(ctx).ID)
		if err != nil {
			return nil, err
		}
		if !auth.CheckPassword(u.PasswordHash, in.Body.Password) {
			return nil, apierr.Invalid("password", "Password is wrong")
		}
		err = d.DB.RunInTx(ctx, nil, func(ctx context.Context, tx bun.Tx) error {
			if _, err := tx.NewDelete().Model((*model.Favourite)(nil)).Where("app_user_id = ?", u.ID).Exec(ctx); err != nil {
				return err
			}
			if _, err := tx.NewUpdate().Model((*model.AppInstall)(nil)).Set("app_user_id = NULL").Where("app_user_id = ?", u.ID).Exec(ctx); err != nil {
				return err
			}
			if err := d.Auth.RevokeUser(ctx, tx, model.SubjectApp, u.ID); err != nil {
				return err
			}
			if _, err := tx.NewDelete().Model(u).WherePK().Exec(ctx); err != nil {
				return err
			}
			return nil
		})
		return nil, err
	})

	huma.Register(h, auth.App(huma.Operation{
		OperationID: "app-sessions",
		Method:      http.MethodGet,
		Path:        appPrefix + "/me/sessions",
		Summary:     "List current app user sessions",
		Tags:        tags,
	}), func(ctx context.Context, in *AppSessionsInput) (*AppSessionsOutput, error) {
		list, err := listSessions(ctx, d.DB, model.SubjectApp, auth.From(ctx).ID, in.RefreshToken)
		if err != nil {
			return nil, err
		}
		out := &AppSessionsOutput{}
		out.Body.Sessions = list
		return out, nil
	})

	huma.Register(h, auth.App(huma.Operation{
		OperationID:   "app-revoke-session",
		Method:        http.MethodDelete,
		Path:          appPrefix + "/me/sessions/{id}",
		Summary:       "Revoke one app user session",
		Tags:          tags,
		DefaultStatus: http.StatusNoContent,
	}), func(ctx context.Context, in *AppIDPath) (*struct{}, error) {
		return nil, revokeSession(ctx, d, model.SubjectApp, auth.From(ctx).ID, in.ID)
	})

	huma.Register(h, auth.App(huma.Operation{
		OperationID: "app-list-favourites",
		Method:      http.MethodGet,
		Path:        appPrefix + "/me/favourites",
		Summary:     "List favourites",
		Tags:        tags,
	}), func(ctx context.Context, _ *struct{}) (*AppFavouritesOutput, error) {
		var rows []model.Favourite
		err := d.DB.NewSelect().Model(&rows).
			Where("app_user_id = ?", auth.From(ctx).ID).
			Order("created_at DESC").
			Scan(ctx)
		if err != nil {
			return nil, err
		}
		out := &AppFavouritesOutput{}
		out.Body.Items = make([]AppFavouriteView, 0, len(rows))
		for _, r := range rows {
			out.Body.Items = append(out.Body.Items, AppFavouriteView{
				ItemType:  r.ItemType,
				ItemID:    r.ItemID,
				CreatedAt: r.CreatedAt,
			})
		}
		return out, nil
	})

	huma.Register(h, auth.App(huma.Operation{
		OperationID: "app-put-favourites",
		Method:      http.MethodPut,
		Path:        appPrefix + "/me/favourites",
		Summary:     "Replace favourites",
		Tags:        tags,
	}), func(ctx context.Context, in *AppPutFavouritesInput) (*AppFavouritesOutput, error) {
		meID := auth.From(ctx).ID
		out := &AppFavouritesOutput{}
		err := d.DB.RunInTx(ctx, nil, func(ctx context.Context, tx bun.Tx) error {
			if _, err := tx.NewDelete().Model((*model.Favourite)(nil)).
				Where("app_user_id = ?", meID).Exec(ctx); err != nil {
				return err
			}
			now := time.Now().UTC()
			seen := make(map[string]bool)
			var rows []model.Favourite
			for _, it := range in.Body.Items {
				key := it.ItemType + ":" + it.ItemID
				if seen[key] {
					continue
				}
				seen[key] = true
				rows = append(rows, model.Favourite{
					AppUserID: meID,
					ItemType:  it.ItemType,
					ItemID:    it.ItemID,
					CreatedAt: now,
				})
			}
			if len(rows) > 0 {
				if _, err := tx.NewInsert().Model(&rows).Exec(ctx); err != nil {
					return err
				}
			}
			var res []model.Favourite
			if err := tx.NewSelect().Model(&res).
				Where("app_user_id = ?", meID).
				Order("created_at DESC").Scan(ctx); err != nil {
				return err
			}
			out.Body.Items = make([]AppFavouriteView, 0, len(res))
			for _, r := range res {
				out.Body.Items = append(out.Body.Items, AppFavouriteView{
					ItemType:  r.ItemType,
					ItemID:    r.ItemID,
					CreatedAt: r.CreatedAt,
				})
			}
			return nil
		})
		if err != nil {
			return nil, err
		}
		return out, nil
	})

	huma.Register(h, auth.App(huma.Operation{
		OperationID:   "app-add-favourite",
		Method:        http.MethodPost,
		Path:          appPrefix + "/me/favourites",
		Summary:       "Add a favourite",
		Tags:          tags,
		DefaultStatus: http.StatusNoContent,
	}), func(ctx context.Context, in *AppAddFavouriteInput) (*struct{}, error) {
		fav := &model.Favourite{
			AppUserID: auth.From(ctx).ID,
			ItemType:  in.Body.ItemType,
			ItemID:    in.Body.ItemID,
			CreatedAt: time.Now().UTC(),
		}
		_, err := d.DB.NewInsert().Model(fav).On("CONFLICT DO NOTHING").Exec(ctx)
		return nil, err
	})

	huma.Register(h, auth.App(huma.Operation{
		OperationID:   "app-remove-favourite",
		Method:        http.MethodDelete,
		Path:          appPrefix + "/me/favourites/{itemType}/{itemId}",
		Summary:       "Remove a favourite",
		Tags:          tags,
		DefaultStatus: http.StatusNoContent,
	}), func(ctx context.Context, in *AppRemoveFavouriteInput) (*struct{}, error) {
		_, err := d.DB.NewDelete().Model((*model.Favourite)(nil)).
			Where("app_user_id = ?", auth.From(ctx).ID).
			Where("item_type = ?", in.ItemType).
			Where("item_id = ?", in.ItemID).
			Exec(ctx)
		return nil, err
	})

	huma.Register(h, auth.App(huma.Operation{
		OperationID:   "app-link-install",
		Method:        http.MethodPost,
		Path:          appPrefix + "/me/installs",
		Summary:       "Link app install",
		Tags:          tags,
		DefaultStatus: http.StatusNoContent,
	}), func(ctx context.Context, in *AppLinkInstallInput) (*struct{}, error) {
		now := time.Now().UTC()
		meID := auth.From(ctx).ID
		install := &model.AppInstall{
			InstallID:  in.Body.InstallID,
			AppUserID:  &meID,
			AppVersion: in.Body.AppVersion,
			LastSeenAt: now,
			CreatedAt:  now,
		}
		// Only take over an install that is unlinked or already ours.
		res, err := d.DB.NewInsert().Model(install).
			On("CONFLICT (install_id) DO UPDATE").
			Set("app_user_id = EXCLUDED.app_user_id").
			Set("app_version = EXCLUDED.app_version").
			Set("last_seen_at = EXCLUDED.last_seen_at").
			Where("app_install.app_user_id IS NULL OR app_install.app_user_id = EXCLUDED.app_user_id").
			Exec(ctx)
		if err != nil {
			return nil, err
		}
		if n, _ := res.RowsAffected(); n == 0 {
			return nil, apierr.Conflict("install_linked", "This install is linked to another account")
		}
		return nil, nil
	})
}

func (d *Deps) loadAppUser(ctx context.Context, id string) (*model.AppUser, error) {
	u := new(model.AppUser)
	err := d.DB.NewSelect().Model(u).Where("id = ?", id).Scan(ctx)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, apierr.NotFound("User")
	}
	return u, err
}
