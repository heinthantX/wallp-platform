package api

import (
	"time"

	"github.com/heinthant/wallp-backend/internal/auth"
	"github.com/heinthant/wallp-backend/internal/model"
)

// AdminUserView is an admin user without secrets.
type AdminUserView struct {
	ID          string     `json:"id"`
	Email       string     `json:"email" format:"email"`
	Name        string     `json:"name"`
	Role        string     `json:"role" enum:"admin,designer,reviewer,viewer"`
	TOTPEnabled bool       `json:"totpEnabled"`
	Disabled    bool       `json:"disabled"`
	LastLoginAt *time.Time `json:"lastLoginAt,omitempty"`
	CreatedAt   time.Time  `json:"createdAt"`
}

func adminView(u *model.AdminUser) AdminUserView {
	return AdminUserView{ID: u.ID, Email: u.Email, Name: u.Name, Role: u.Role, TOTPEnabled: u.TOTPEnabled,
		Disabled: u.Disabled, LastLoginAt: u.LastLoginAt, CreatedAt: u.CreatedAt}
}

type AdminSession struct {
	auth.Tokens
	User AdminUserView `json:"user"`
}

type AppUserView struct {
	ID          string    `json:"id"`
	Email       string    `json:"email" format:"email"`
	DisplayName string    `json:"displayName"`
	CreatedAt   time.Time `json:"createdAt"`
}

func appView(u *model.AppUser) AppUserView {
	return AppUserView{ID: u.ID, Email: u.Email, DisplayName: u.DisplayName, CreatedAt: u.CreatedAt}
}

type AppSession struct {
	auth.Tokens
	User AppUserView `json:"user"`
}
