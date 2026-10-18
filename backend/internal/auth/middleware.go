package auth

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"slices"
	"strings"

	"github.com/danielgtaylor/huma/v2"
	"github.com/uptrace/bun"

	"github.com/heinthant/wallp-backend/internal/apierr"
	"github.com/heinthant/wallp-backend/internal/model"
)

// Principal is the signed-in caller.
type Principal struct {
	ID   string
	Kind string // model.SubjectAdmin or model.SubjectApp
	Role string
	Name string
}

type ctxKey struct{}

// From returns the caller, or nil on public/optional routes without a token.
func From(ctx context.Context) *Principal {
	p, _ := ctx.Value(ctxKey{}).(*Principal)
	return p
}

// WithPrincipal is for tests and jobs that act as a user.
func WithPrincipal(ctx context.Context, p *Principal) context.Context {
	return context.WithValue(ctx, ctxKey{}, p)
}

const (
	metaAuth  = "auth"
	metaRoles = "roles"

	modeAdmin       = "admin"
	modeApp         = "app"
	modeAppOptional = "app-optional"

	SecurityScheme = "bearer"
)

func withMeta(op huma.Operation, mode string, roles []string) huma.Operation {
	if op.Metadata == nil {
		op.Metadata = map[string]any{}
	}
	op.Metadata[metaAuth] = mode
	op.Metadata[metaRoles] = roles
	if mode == modeAppOptional {
		op.Security = []map[string][]string{{}, {SecurityScheme: {}}}
	} else {
		op.Security = []map[string][]string{{SecurityScheme: {}}}
	}
	return op
}

// Admin requires a dashboard login; with roles, only those roles (admin always passes).
func Admin(op huma.Operation, roles ...string) huma.Operation {
	if len(roles) > 0 {
		names := []string{model.RoleAdmin}
		for _, r := range roles {
			if r != model.RoleAdmin {
				names = append(names, r)
			}
		}
		op.Description = strings.TrimSpace(op.Description + "\n\nRoles: " + strings.Join(names, ", "))
	}
	return withMeta(op, modeAdmin, roles)
}

// App requires an app-user login.
func App(op huma.Operation) huma.Operation { return withMeta(op, modeApp, nil) }

// AppOptional reads an app-user login when sent; anonymous calls pass.
func AppOptional(op huma.Operation) huma.Operation { return withMeta(op, modeAppOptional, nil) }

// Middleware enforces the auth metadata set by Admin/App/AppOptional.
// Admin calls re-check the user row, so disabling a user or changing a role
// takes effect at once rather than when the access token expires.
func (s *Service) Middleware(api huma.API) func(huma.Context, func(huma.Context)) {
	return func(ctx huma.Context, next func(huma.Context)) {
		mode, _ := ctx.Operation().Metadata[metaAuth].(string)
		if mode == "" {
			next(ctx)
			return
		}
		raw := bearer(ctx.Header("Authorization"))
		if raw == "" {
			if mode == modeAppOptional {
				next(ctx)
				return
			}
			writeErr(ctx, apierr.Unauthorized("Sign in required"))
			return
		}
		c, err := s.Parse(raw, TypeAccess)
		if err != nil {
			writeErr(ctx, apierr.New(401, "token_expired", "Your session expired, sign in again"))
			return
		}
		wantKind := model.SubjectApp
		if mode == modeAdmin {
			wantKind = model.SubjectAdmin
		}
		if c.Kind != wantKind {
			writeErr(ctx, apierr.Unauthorized("This token can't be used here"))
			return
		}
		p := &Principal{ID: c.Subject, Kind: c.Kind, Role: c.Role, Name: c.Name}
		if mode == modeAdmin {
			u := new(model.AdminUser)
			if err := s.DB.NewSelect().Model(u).Column("role", "name", "disabled").
				Where("id = ?", c.Subject).Scan(ctx.Context()); err != nil || u.Disabled {
				writeErr(ctx, apierr.Unauthorized("This account is disabled or was removed"))
				return
			}
			p.Role, p.Name = u.Role, u.Name
			roles, _ := ctx.Operation().Metadata[metaRoles].([]string)
			if len(roles) > 0 && p.Role != model.RoleAdmin && !slices.Contains(roles, p.Role) {
				writeErr(ctx, apierr.Forbidden("Your role ("+p.Role+") can't do this. Needed: "+
					strings.Join(append([]string{model.RoleAdmin}, roles...), " or ")))
				return
			}
		}
		next(huma.WithValue(ctx, ctxKey{}, p))
	}
}

func bearer(h string) string {
	if len(h) > 7 && strings.EqualFold(h[:7], "bearer ") {
		return strings.TrimSpace(h[7:])
	}
	return ""
}

func writeErr(ctx huma.Context, e *apierr.Error) {
	ctx.SetHeader("Content-Type", "application/json")
	ctx.SetStatus(e.GetStatus())
	_ = json.NewEncoder(ctx.BodyWriter()).Encode(e)
}

// AdminLookup feeds Refresh with the current role of an admin user.
func AdminLookup(ctx context.Context, db bun.IDB, id string) (string, string, bool, error) {
	u := new(model.AdminUser)
	if err := db.NewSelect().Model(u).Where("id = ?", id).Scan(ctx); err != nil {
		return "", "", false, noRowsOK(err)
	}
	return u.Role, u.Name, !u.Disabled, nil
}

// AppLookup feeds Refresh for app users.
func AppLookup(ctx context.Context, db bun.IDB, id string) (string, string, bool, error) {
	u := new(model.AppUser)
	if err := db.NewSelect().Model(u).Where("id = ?", id).Scan(ctx); err != nil {
		return "", "", false, noRowsOK(err)
	}
	return "", u.DisplayName, true, nil
}

func noRowsOK(err error) error {
	if errors.Is(err, sql.ErrNoRows) {
		return nil
	}
	return err
}

type metaKey struct{}

// WithMeta stores the caller's user agent and IP (set by a Gin middleware).
func WithMeta(ctx context.Context, m Meta) context.Context {
	return context.WithValue(ctx, metaKey{}, m)
}

func MetaFrom(ctx context.Context) Meta { m, _ := ctx.Value(metaKey{}).(Meta); return m }
