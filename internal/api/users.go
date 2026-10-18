package api

import (
	"context"
	"net/http"
	"strings"
	"time"

	"github.com/danielgtaylor/huma/v2"
	"github.com/uptrace/bun"

	"github.com/heinthant/wallp-backend/internal/apierr"
	"github.com/heinthant/wallp-backend/internal/audit"
	"github.com/heinthant/wallp-backend/internal/auth"
	"github.com/heinthant/wallp-backend/internal/model"
)

type ListUsersInput struct {
	ListParams
	Role string `query:"role" enum:"admin,designer,reviewer,viewer,"`
}

type ListUsersOutput struct{ Body Page[AdminUserView] }

type CreateUserInput struct {
	Body struct {
		Email    string `json:"email" format:"email" maxLength:"254"`
		Name     string `json:"name" minLength:"1" maxLength:"100"`
		Password string `json:"password" minLength:"10" maxLength:"256"`
		Role     string `json:"role" enum:"admin,designer,reviewer,viewer"`
	}
}

type UpdateUserInput struct {
	IDPath
	Body struct {
		Name      *string `json:"name,omitempty" minLength:"1" maxLength:"100"`
		Role      *string `json:"role,omitempty" enum:"admin,designer,reviewer,viewer"`
		Disabled  *bool   `json:"disabled,omitempty"`
		Password  *string `json:"password,omitempty" minLength:"10" maxLength:"256" doc:"Set a new password (signs the user out)"`
		ResetTOTP bool    `json:"resetTotp,omitempty" doc:"Turn off the user's 2-step (lost phone)"`
	}
}

type UserOutput struct{ Body AdminUserView }

var userSorts = map[string]string{"name": "name", "email": "email", "role": "role", "createdAt": "created_at", "lastLoginAt": "last_login_at"}

func registerUsers(h huma.API, d *Deps) {
	tags := []string{"Users"}
	p := adminPrefix + "/users"

	huma.Register(h, auth.Admin(huma.Operation{OperationID: "list-users", Method: http.MethodGet, Path: p,
		Summary: "List dashboard users", Tags: tags}, model.RoleAdmin),
		func(ctx context.Context, in *ListUsersInput) (*ListUsersOutput, error) {
			var rows []model.AdminUser
			q := whereSearch(d.DB.NewSelect().Model(&rows), in.Q, "email", "name")
			if in.Role != "" {
				q = q.Where("role = ?", in.Role)
			}
			q, err := paginate(q, in.ListParams, userSorts, "name")
			if err != nil {
				return nil, err
			}
			total, err := q.ScanAndCount(ctx)
			if err != nil {
				return nil, err
			}
			out := &ListUsersOutput{Body: Page[AdminUserView]{Items: []AdminUserView{}, Total: int(total), Page: in.Page, PerPage: in.PerPage}}
			for i := range rows {
				out.Body.Items = append(out.Body.Items, adminView(&rows[i]))
			}
			return out, nil
		})

	huma.Register(h, auth.Admin(huma.Operation{OperationID: "create-user", Method: http.MethodPost, Path: p,
		Summary: "Add a dashboard user", Tags: tags, DefaultStatus: http.StatusCreated}, model.RoleAdmin),
		func(ctx context.Context, in *CreateUserInput) (*UserOutput, error) {
			var u *model.AdminUser
			err := d.DB.RunInTx(ctx, nil, func(ctx context.Context, tx bun.Tx) (err error) {
				u, err = CreateAdminUser(ctx, tx, in.Body.Email, in.Body.Name, in.Body.Password, in.Body.Role)
				return err
			})
			if err != nil {
				return nil, err
			}
			return &UserOutput{Body: adminView(u)}, nil
		})

	huma.Register(h, auth.Admin(huma.Operation{OperationID: "update-user", Method: http.MethodPatch, Path: p + "/{id}",
		Summary: "Change a user's role, name, password or access", Tags: tags}, model.RoleAdmin),
		func(ctx context.Context, in *UpdateUserInput) (*UserOutput, error) {
			me := auth.From(ctx)
			u, err := d.loadAdmin(ctx, in.ID)
			if err != nil {
				return nil, err
			}
			before := adminView(u)
			b := in.Body
			signOut := false
			if b.Name != nil {
				u.Name = strings.TrimSpace(*b.Name)
			}
			if b.Role != nil && *b.Role != u.Role {
				if u.ID == me.ID {
					return nil, apierr.Invalid("role", "You can't change your own role")
				}
				u.Role = *b.Role
			}
			if b.Disabled != nil && *b.Disabled != u.Disabled {
				if u.ID == me.ID {
					return nil, apierr.Invalid("disabled", "You can't disable yourself")
				}
				u.Disabled = *b.Disabled
				signOut = signOut || u.Disabled
			}
			if b.Password != nil {
				if err := auth.ValidatePassword(*b.Password); err != nil {
					return nil, apierr.Invalid("password", err.Error())
				}
				if u.PasswordHash, err = auth.HashPassword(*b.Password); err != nil {
					return nil, err
				}
				signOut = true
			}
			if b.ResetTOTP {
				u.TOTPEnabled, u.TOTPSecret = false, nil
			}
			u.UpdatedAt = time.Now().UTC()
			err = d.DB.RunInTx(ctx, nil, func(ctx context.Context, tx bun.Tx) error {
				if err := guardLastAdmin(ctx, tx, u); err != nil {
					return err
				}
				if _, err := tx.NewUpdate().Model(u).
					Column("name", "role", "disabled", "password_hash", "totp_enabled", "totp_secret", "updated_at").
					WherePK().Exec(ctx); err != nil {
					return err
				}
				if signOut {
					if err := d.Auth.RevokeUser(ctx, tx, model.SubjectAdmin, u.ID); err != nil {
						return err
					}
				}
				return audit.Record(ctx, tx, "update", "user", u.ID, before, adminView(u))
			})
			if err != nil {
				return nil, err
			}
			return &UserOutput{Body: adminView(u)}, nil
		})
}

// guardLastAdmin keeps at least one enabled admin.
func guardLastAdmin(ctx context.Context, tx bun.Tx, u *model.AdminUser) error {
	if u.Role == model.RoleAdmin && !u.Disabled {
		return nil
	}
	n, err := tx.NewSelect().Model((*model.AdminUser)(nil)).
		Where("role = ?", model.RoleAdmin).Where("disabled = ?", false).Where("id <> ?", u.ID).Count(ctx)
	if err != nil {
		return err
	}
	if n == 0 {
		return apierr.Conflict("last_admin", "This is the last admin; add another admin first")
	}
	return nil
}
