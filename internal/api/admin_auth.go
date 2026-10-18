package api

import (
	"context"
	"crypto/subtle"
	"database/sql"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/danielgtaylor/huma/v2"
	"github.com/google/uuid"
	"github.com/pquerna/otp/totp"
	"github.com/uptrace/bun"

	"github.com/heinthant/wallp-backend/internal/apierr"
	"github.com/heinthant/wallp-backend/internal/audit"
	"github.com/heinthant/wallp-backend/internal/auth"
	"github.com/heinthant/wallp-backend/internal/model"
)

type SetupStatus struct {
	Body struct {
		Needed        bool `json:"needed" doc:"True when no admin exists yet"`
		TokenRequired bool `json:"tokenRequired" doc:"True when SETUP_TOKEN must be sent"`
	}
}

type SetupInput struct {
	Body struct {
		Email      string `json:"email" format:"email" maxLength:"254"`
		Name       string `json:"name" minLength:"1" maxLength:"100"`
		Password   string `json:"password" minLength:"10" maxLength:"256"`
		SetupToken string `json:"setupToken,omitempty" maxLength:"256"`
	}
}

type LoginInput struct {
	Body struct {
		Email    string `json:"email" format:"email" maxLength:"254"`
		Password string `json:"password" minLength:"1" maxLength:"256"`
	}
}

type LoginOutput struct {
	Body struct {
		MFARequired bool          `json:"mfaRequired"`
		MFAToken    string        `json:"mfaToken,omitempty" doc:"Send with the 6-digit code to /auth/mfa"`
		Session     *AdminSession `json:"session,omitempty"`
	}
}

type MFAInput struct {
	Body struct {
		MFAToken string `json:"mfaToken" minLength:"1"`
		Code     string `json:"code" pattern:"^[0-9]{6}$"`
	}
}

type RefreshInput struct {
	Body struct {
		RefreshToken string `json:"refreshToken" minLength:"1" maxLength:"200"`
	}
}

type SessionOutput struct{ Body AdminSession }

type MeOutput struct{ Body AdminUserView }

type UpdateMeInput struct {
	Body struct {
		Name            *string `json:"name,omitempty" minLength:"1" maxLength:"100"`
		CurrentPassword string  `json:"currentPassword,omitempty" maxLength:"256"`
		NewPassword     string  `json:"newPassword,omitempty" maxLength:"256"`
	}
}

type TOTPSetupOutput struct {
	Body struct {
		Secret     string `json:"secret"`
		OTPAuthURL string `json:"otpauthUrl" doc:"Show as a QR code for an authenticator app"`
	}
}

type CodeInput struct {
	Body struct {
		Code string `json:"code" pattern:"^[0-9]{6}$"`
	}
}

type PasswordInput struct {
	Body struct {
		Password string `json:"password" minLength:"1" maxLength:"256"`
	}
}

type SessionView struct {
	ID        string    `json:"id" doc:"Login (refresh-token family) ID"`
	UserAgent string    `json:"userAgent"`
	IP        string    `json:"ip"`
	CreatedAt time.Time `json:"createdAt" doc:"Last refresh"`
	ExpiresAt time.Time `json:"expiresAt"`
	Current   bool      `json:"current"`
}

type SessionsInput struct {
	RefreshToken string `header:"X-Refresh-Token" doc:"Optional, marks the current session"`
}

type SessionsOutput struct {
	Body struct {
		Sessions []SessionView `json:"sessions"`
	}
}

type IDPath struct {
	ID string `path:"id" maxLength:"100"`
}

func registerAdminAuth(h huma.API, d *Deps) {
	tags := []string{"Admin auth"}
	p := adminPrefix + "/auth"

	huma.Register(h, huma.Operation{OperationID: "admin-setup-status", Method: http.MethodGet, Path: p + "/setup",
		Summary: "Is first-admin setup needed?", Tags: tags},
		func(ctx context.Context, _ *struct{}) (*SetupStatus, error) {
			n, err := d.DB.NewSelect().Model((*model.AdminUser)(nil)).Count(ctx)
			if err != nil {
				return nil, err
			}
			out := &SetupStatus{}
			out.Body.Needed = n == 0
			out.Body.TokenRequired = d.Cfg.SetupToken != "" || d.Cfg.IsProd()
			return out, nil
		})

	huma.Register(h, huma.Operation{OperationID: "admin-setup", Method: http.MethodPost, Path: p + "/setup",
		Summary: "Create the first admin", Description: "Works only while no admin exists.", Tags: tags},
		func(ctx context.Context, in *SetupInput) (*SessionOutput, error) {
			if d.Cfg.IsProd() && d.Cfg.SetupToken == "" {
				return nil, apierr.Forbidden("Set SETUP_TOKEN on the server, or create the admin with `wallp user create`")
			}
			if d.Cfg.SetupToken != "" && subtle.ConstantTimeCompare([]byte(in.Body.SetupToken), []byte(d.Cfg.SetupToken)) != 1 {
				return nil, apierr.Forbidden("Wrong setup token").WithField("setupToken")
			}
			var u *model.AdminUser
			err := d.DB.RunInTx(ctx, nil, func(ctx context.Context, tx bun.Tx) error {
				n, err := tx.NewSelect().Model((*model.AdminUser)(nil)).Count(ctx)
				if err != nil {
					return err
				}
				if n > 0 {
					return apierr.Conflict("setup_done", "An admin already exists, sign in instead")
				}
				u, err = CreateAdminUser(ctx, tx, in.Body.Email, in.Body.Name, in.Body.Password, model.RoleAdmin)
				return err
			})
			if err != nil {
				return nil, err
			}
			return d.adminSession(ctx, u)
		})

	huma.Register(h, huma.Operation{OperationID: "admin-login", Method: http.MethodPost, Path: p + "/login",
		Summary: "Sign in with email and password", Tags: tags},
		func(ctx context.Context, in *LoginInput) (*LoginOutput, error) {
			u := new(model.AdminUser)
			err := d.DB.NewSelect().Model(u).Where("email = ?", normEmail(in.Body.Email)).Scan(ctx)
			if err != nil && !errors.Is(err, sql.ErrNoRows) {
				return nil, err
			}
			if !auth.CheckPasswordOrDummy(u.PasswordHash, in.Body.Password) || u.Disabled {
				return nil, apierr.New(http.StatusUnauthorized, "bad_credentials", "Wrong email or password")
			}
			out := &LoginOutput{}
			if u.TOTPEnabled {
				t, err := d.Auth.MFAToken(u.ID)
				if err != nil {
					return nil, err
				}
				out.Body.MFARequired, out.Body.MFAToken = true, t
				return out, nil
			}
			s, err := d.adminSession(ctx, u)
			if err != nil {
				return nil, err
			}
			out.Body.Session = &s.Body
			return out, nil
		})

	huma.Register(h, huma.Operation{OperationID: "admin-mfa", Method: http.MethodPost, Path: p + "/mfa",
		Summary: "Finish sign-in with a 2-step code", Tags: tags},
		func(ctx context.Context, in *MFAInput) (*SessionOutput, error) {
			c, err := d.Auth.Parse(in.Body.MFAToken, auth.TypeMFA)
			if err != nil {
				return nil, apierr.New(http.StatusUnauthorized, "mfa_expired", "The sign-in took too long, start again")
			}
			u := new(model.AdminUser)
			if err := d.DB.NewSelect().Model(u).Where("id = ?", c.Subject).Scan(ctx); err != nil || u.Disabled || u.TOTPSecret == nil {
				return nil, apierr.Unauthorized("Account not available")
			}
			// ponytail: a code can be replayed inside its 30 s window; store the last used step if that matters.
			if !totp.Validate(in.Body.Code, *u.TOTPSecret) {
				return nil, apierr.New(http.StatusUnauthorized, "bad_code", "Wrong code, check your authenticator app").WithField("code")
			}
			return d.adminSession(ctx, u)
		})

	huma.Register(h, huma.Operation{OperationID: "admin-refresh", Method: http.MethodPost, Path: p + "/refresh",
		Summary: "Swap a refresh token for new tokens", Description: "Refresh tokens rotate: each one works once.", Tags: tags},
		func(ctx context.Context, in *RefreshInput) (*SessionOutput, error) {
			t, err := d.Auth.Refresh(ctx, model.SubjectAdmin, in.Body.RefreshToken, auth.MetaFrom(ctx), auth.AdminLookup)
			if err != nil {
				return nil, refreshErr(err)
			}
			c, _ := d.Auth.Parse(t.AccessToken, auth.TypeAccess)
			u := new(model.AdminUser)
			if err := d.DB.NewSelect().Model(u).Where("id = ?", c.Subject).Scan(ctx); err != nil {
				return nil, err
			}
			return &SessionOutput{Body: AdminSession{Tokens: *t, User: adminView(u)}}, nil
		})

	huma.Register(h, huma.Operation{OperationID: "admin-logout", Method: http.MethodPost, Path: p + "/logout",
		Summary: "Sign out this session", Tags: tags, DefaultStatus: http.StatusNoContent},
		func(ctx context.Context, in *RefreshInput) (*struct{}, error) {
			return nil, d.Auth.Revoke(ctx, model.SubjectAdmin, in.Body.RefreshToken)
		})

	huma.Register(h, auth.Admin(huma.Operation{OperationID: "admin-me", Method: http.MethodGet, Path: p + "/me",
		Summary: "The signed-in admin user", Tags: tags}),
		func(ctx context.Context, _ *struct{}) (*MeOutput, error) {
			u, err := d.loadAdmin(ctx, auth.From(ctx).ID)
			if err != nil {
				return nil, err
			}
			return &MeOutput{Body: adminView(u)}, nil
		})

	huma.Register(h, auth.Admin(huma.Operation{OperationID: "admin-update-me", Method: http.MethodPatch, Path: p + "/me",
		Summary: "Change my name or password", Description: "A password change signs out every other session.", Tags: tags}),
		func(ctx context.Context, in *UpdateMeInput) (*MeOutput, error) {
			u, err := d.loadAdmin(ctx, auth.From(ctx).ID)
			if err != nil {
				return nil, err
			}
			before := adminView(u)
			if in.Body.Name != nil {
				u.Name = strings.TrimSpace(*in.Body.Name)
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
				if _, err := tx.NewUpdate().Model(u).Column("name", "password_hash", "updated_at").WherePK().Exec(ctx); err != nil {
					return err
				}
				if pwChanged {
					if err := d.Auth.RevokeUser(ctx, tx, model.SubjectAdmin, u.ID); err != nil {
						return err
					}
				}
				return audit.Record(ctx, tx, actionFor("update", pwChanged), "user", u.ID, before, adminView(u))
			})
			if err != nil {
				return nil, err
			}
			return &MeOutput{Body: adminView(u)}, nil
		})

	huma.Register(h, auth.Admin(huma.Operation{OperationID: "admin-totp-setup", Method: http.MethodPost, Path: p + "/totp/setup",
		Summary: "Start 2-step setup", Description: "Returns a new secret. It's not active until /totp/enable gets a valid code.", Tags: tags}),
		func(ctx context.Context, _ *struct{}) (*TOTPSetupOutput, error) {
			u, err := d.loadAdmin(ctx, auth.From(ctx).ID)
			if err != nil {
				return nil, err
			}
			if u.TOTPEnabled {
				return nil, apierr.Conflict("totp_enabled", "2-step is already on; turn it off first to change it")
			}
			key, err := totp.Generate(totp.GenerateOpts{Issuer: d.Cfg.TOTPIssuer, AccountName: u.Email})
			if err != nil {
				return nil, err
			}
			secret := key.Secret()
			if _, err := d.DB.NewUpdate().Model(u).Set("totp_secret = ?", secret).WherePK().Exec(ctx); err != nil {
				return nil, err
			}
			out := &TOTPSetupOutput{}
			out.Body.Secret, out.Body.OTPAuthURL = secret, key.URL()
			return out, nil
		})

	huma.Register(h, auth.Admin(huma.Operation{OperationID: "admin-totp-enable", Method: http.MethodPost, Path: p + "/totp/enable",
		Summary: "Turn on 2-step with a code from the app", Tags: tags}),
		func(ctx context.Context, in *CodeInput) (*MeOutput, error) {
			u, err := d.loadAdmin(ctx, auth.From(ctx).ID)
			if err != nil {
				return nil, err
			}
			if u.TOTPSecret == nil {
				return nil, apierr.Conflict("totp_not_started", "Start 2-step setup first")
			}
			if !totp.Validate(in.Body.Code, *u.TOTPSecret) {
				return nil, apierr.Invalid("code", "Wrong code, check the time on your phone and try again")
			}
			u.TOTPEnabled = true
			if err := d.updateAndAudit(ctx, u, "totp_enable", "totp_enabled"); err != nil {
				return nil, err
			}
			return &MeOutput{Body: adminView(u)}, nil
		})

	huma.Register(h, auth.Admin(huma.Operation{OperationID: "admin-totp-disable", Method: http.MethodPost, Path: p + "/totp/disable",
		Summary: "Turn off 2-step", Description: "Needs the account password.", Tags: tags}),
		func(ctx context.Context, in *PasswordInput) (*MeOutput, error) {
			u, err := d.loadAdmin(ctx, auth.From(ctx).ID)
			if err != nil {
				return nil, err
			}
			if !auth.CheckPassword(u.PasswordHash, in.Body.Password) {
				return nil, apierr.Invalid("password", "Password is wrong")
			}
			u.TOTPEnabled, u.TOTPSecret = false, nil
			if err := d.updateAndAudit(ctx, u, "totp_disable", "totp_enabled", "totp_secret"); err != nil {
				return nil, err
			}
			return &MeOutput{Body: adminView(u)}, nil
		})

	huma.Register(h, auth.Admin(huma.Operation{OperationID: "admin-sessions", Method: http.MethodGet, Path: p + "/sessions",
		Summary: "My signed-in devices", Tags: tags}),
		func(ctx context.Context, in *SessionsInput) (*SessionsOutput, error) {
			list, err := listSessions(ctx, d.DB, model.SubjectAdmin, auth.From(ctx).ID, in.RefreshToken)
			if err != nil {
				return nil, err
			}
			out := &SessionsOutput{}
			out.Body.Sessions = list
			return out, nil
		})

	huma.Register(h, auth.Admin(huma.Operation{OperationID: "admin-revoke-session", Method: http.MethodDelete, Path: p + "/sessions/{id}",
		Summary: "Sign out one device", Tags: tags, DefaultStatus: http.StatusNoContent}),
		func(ctx context.Context, in *IDPath) (*struct{}, error) {
			return nil, revokeSession(ctx, d, model.SubjectAdmin, auth.From(ctx).ID, in.ID)
		})
}

func actionFor(base string, pw bool) string {
	if pw {
		return "password_change"
	}
	return base
}

func (d *Deps) adminSession(ctx context.Context, u *model.AdminUser) (*SessionOutput, error) {
	t, err := d.Auth.Issue(ctx, model.SubjectAdmin, u.ID, u.Role, u.Name, auth.MetaFrom(ctx))
	if err != nil {
		return nil, err
	}
	now := time.Now().UTC()
	u.LastLoginAt = &now
	if _, err := d.DB.NewUpdate().Model(u).Column("last_login_at").WherePK().Exec(ctx); err != nil {
		return nil, err
	}
	return &SessionOutput{Body: AdminSession{Tokens: *t, User: adminView(u)}}, nil
}

func (d *Deps) loadAdmin(ctx context.Context, id string) (*model.AdminUser, error) {
	u := new(model.AdminUser)
	err := d.DB.NewSelect().Model(u).Where("id = ?", id).Scan(ctx)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, apierr.NotFound("User")
	}
	return u, err
}

func (d *Deps) updateAndAudit(ctx context.Context, u *model.AdminUser, action string, cols ...string) error {
	u.UpdatedAt = time.Now().UTC()
	return d.DB.RunInTx(ctx, nil, func(ctx context.Context, tx bun.Tx) error {
		if _, err := tx.NewUpdate().Model(u).Column(append(cols, "updated_at")...).WherePK().Exec(ctx); err != nil {
			return err
		}
		return audit.Record(ctx, tx, action, "user", u.ID, nil, adminView(u))
	})
}

// CreateAdminUser validates and inserts a user (used by setup, the users API and the CLI).
func CreateAdminUser(ctx context.Context, db bun.IDB, email, name, password, role string) (*model.AdminUser, error) {
	email = normEmail(email)
	if err := auth.ValidatePassword(password); err != nil {
		return nil, apierr.Invalid("password", err.Error())
	}
	hash, err := auth.HashPassword(password)
	if err != nil {
		return nil, err
	}
	exists, err := db.NewSelect().Model((*model.AdminUser)(nil)).Where("email = ?", email).Exists(ctx)
	if err != nil {
		return nil, err
	}
	if exists {
		return nil, apierr.Conflict("email_taken", "A user with this email already exists").WithField("email")
	}
	now := time.Now().UTC()
	u := &model.AdminUser{ID: uuid.NewString(), Email: email, Name: strings.TrimSpace(name), PasswordHash: hash,
		Role: role, CreatedAt: now, UpdatedAt: now}
	if _, err := db.NewInsert().Model(u).Exec(ctx); err != nil {
		return nil, err
	}
	return u, audit.Record(ctx, db, "create", "user", u.ID, nil, adminView(u))
}

func normEmail(e string) string { return strings.ToLower(strings.TrimSpace(e)) }

func refreshErr(err error) error {
	switch {
	case errors.Is(err, auth.ErrTokenReused):
		return apierr.New(http.StatusUnauthorized, "token_reused", err.Error())
	case errors.Is(err, auth.ErrInvalidToken):
		return apierr.New(http.StatusUnauthorized, "token_expired", "Your session expired, sign in again")
	}
	return err
}

// listSessions returns the newest live token of each login family.
func listSessions(ctx context.Context, db *bun.DB, kind, userID, current string) ([]SessionView, error) {
	var rows []model.RefreshToken
	err := db.NewSelect().Model(&rows).
		Where("subject_kind = ?", kind).Where("user_id = ?", userID).
		Where("revoked_at IS NULL").Where("expires_at > ?", time.Now().UTC()).
		Order("created_at DESC").Scan(ctx)
	if err != nil {
		return nil, err
	}
	curHash := ""
	if current != "" {
		curHash = auth.HashToken(current)
	}
	out := []SessionView{}
	for _, r := range rows {
		out = append(out, SessionView{ID: r.FamilyID, UserAgent: r.UserAgent, IP: r.IP, CreatedAt: r.CreatedAt,
			ExpiresAt: r.ExpiresAt, Current: r.TokenHash == curHash})
	}
	return out, nil
}

func revokeSession(ctx context.Context, d *Deps, kind, userID, family string) error {
	ok, err := d.DB.NewSelect().Model((*model.RefreshToken)(nil)).
		Where("family_id = ?", family).Where("subject_kind = ?", kind).Where("user_id = ?", userID).Exists(ctx)
	if err != nil {
		return err
	}
	if !ok {
		return apierr.NotFound("Session")
	}
	return d.Auth.RevokeFamily(ctx, family)
}
