// Package model holds the Bun table models. Catalog items keep their API JSON
// in Data (dashboard doc §5.1); the other columns exist for search and filters.
package model

import (
	"time"

	"github.com/uptrace/bun"
)

// Roles (dashboard doc §3).
const (
	RoleAdmin    = "admin"
	RoleDesigner = "designer"
	RoleReviewer = "reviewer"
	RoleViewer   = "viewer"
)

var Roles = []string{RoleAdmin, RoleDesigner, RoleReviewer, RoleViewer}

// Item statuses.
const (
	StatusDraft     = "draft"
	StatusInReview  = "in_review"
	StatusApproved  = "approved"
	StatusScheduled = "scheduled"
	StatusPublished = "published"
	StatusArchived  = "archived"
)

type AdminUser struct {
	bun.BaseModel `bun:"table:admin_users"`

	ID             string     `bun:",pk"`
	Email          string     `bun:",notnull,unique"`
	Name           string     `bun:",notnull"`
	PasswordHash   string     `bun:",notnull"`
	Role           string     `bun:",notnull"`
	TOTPSecret     *string    `bun:"totp_secret"`
	TOTPEnabled    bool       `bun:"totp_enabled,notnull"`
	Disabled       bool       `bun:",notnull"`
	TOTPLastStep   *int64     `bun:"totp_last_step"`
	MFAFailedCount int        `bun:"mfa_failed_count,notnull"`
	MFALockedUntil *time.Time `bun:"mfa_locked_until"`
	LastLoginAt    *time.Time `bun:",nullzero"`
	CreatedAt      time.Time  `bun:",notnull"`
	UpdatedAt      time.Time  `bun:",notnull"`
}

// AppUser is an optional end-user account for the phone app.
type AppUser struct {
	bun.BaseModel `bun:"table:app_users"`

	ID           string    `bun:",pk"`
	Email        string    `bun:",notnull,unique"`
	DisplayName  string    `bun:",notnull"`
	PasswordHash string    `bun:",notnull"`
	CreatedAt    time.Time `bun:",notnull"`
	UpdatedAt    time.Time `bun:",notnull"`
}

// Subject kinds for refresh tokens.
const (
	SubjectAdmin = "admin"
	SubjectApp   = "app"
)

// RefreshToken is stored hashed. Tokens of one login share a FamilyID;
// reusing a rotated token revokes the whole family.
type RefreshToken struct {
	bun.BaseModel `bun:"table:refresh_tokens"`

	ID          string     `bun:",pk"`
	SubjectKind string     `bun:",notnull"`
	UserID      string     `bun:",notnull"`
	FamilyID    string     `bun:",notnull"`
	TokenHash   string     `bun:",notnull,unique"`
	ExpiresAt   time.Time  `bun:",notnull"`
	RevokedAt   *time.Time `bun:",nullzero"`
	UserAgent   string     `bun:",notnull"`
	IP          string     `bun:"ip,notnull"`
	CreatedAt   time.Time  `bun:",notnull"`
}

// AppInstall is one phone install (random installId from the Events API).
type AppInstall struct {
	bun.BaseModel `bun:"table:app_installs"`

	InstallID  string    `bun:",pk"`
	AppUserID  *string   `bun:",nullzero"`
	AppVersion string    `bun:",notnull"`
	LastSeenAt time.Time `bun:",notnull"`
	CreatedAt  time.Time `bun:",notnull"`
}

type Favourite struct {
	bun.BaseModel `bun:"table:favourites"`

	AppUserID string    `bun:",pk"`
	ItemType  string    `bun:",pk"`
	ItemID    string    `bun:",pk"`
	CreatedAt time.Time `bun:",notnull"`
}

type AuditEntry struct {
	bun.BaseModel `bun:"table:audit_log"`

	ID       int64     `bun:",pk,autoincrement"`
	UserID   *string   `bun:",nullzero"`
	UserName string    `bun:",notnull"`
	Action   string    `bun:",notnull"`
	ItemType string    `bun:",notnull"`
	ItemID   string    `bun:",notnull"`
	Before   JSON      `bun:"before"`
	After    JSON      `bun:"after"`
	At       time.Time `bun:",notnull"`
}

// Item is the shared shape of every catalog table.
type Item struct {
	ID            string  `bun:",pk"`
	Status        string  `bun:",notnull"`
	FestivalID    *string `bun:",nullzero"`
	Sort          int     `bun:",notnull"`
	Search        string  `bun:",notnull"` // lowercased names + tags, for q=
	Data          JSON    `bun:"data,notnull"`
	PublishedData JSON    `bun:"published_data"`
	// Rev of the last published file; publish bumps it when Data changed.
	Rev            int        `bun:",notnull"`
	PublishedHash  string     `bun:",notnull"`
	FirstPublished *time.Time `bun:",nullzero"`
	ScheduledAt    *time.Time `bun:",nullzero"`
	CreatedBy      string     `bun:",notnull"`
	UpdatedBy      string     `bun:",notnull"`
	CreatedAt      time.Time  `bun:",notnull"`
	UpdatedAt      time.Time  `bun:",notnull"`
}

type Festival struct {
	bun.BaseModel `bun:"table:festivals"`
	Item
}

type Theme struct {
	bun.BaseModel `bun:"table:themes"`
	Item
	Style         string `bun:",notnull"`
	Engine        string `bun:",notnull"`
	GeneratedFrom JSON   `bun:"generated_from"`
	ReviewNote    string `bun:",notnull"`
}

type Wallpaper struct {
	bun.BaseModel `bun:"table:wallpapers"`
	Item
	Kind string `bun:",notnull"`
}

type Font struct {
	bun.BaseModel `bun:"table:fonts"`
	Item
	Family   string `bun:",notnull"`
	Category string `bun:",notnull"`
	Listed   bool   `bun:",notnull"`
}

type IconPack struct {
	bun.BaseModel `bun:"table:icon_packs"`
	Item
	Kind string `bun:",notnull"`
}

type Banner struct {
	bun.BaseModel `bun:"table:banners"`
	Item
	StartsAt *time.Time `bun:",nullzero"`
	EndsAt   *time.Time `bun:",nullzero"`
}

// StoreSettings is a single row (ID = 1).
type StoreSettings struct {
	bun.BaseModel `bun:"table:store_settings"`

	ID                int       `bun:",pk"`
	AccentPresets     JSON      `bun:"accent_presets,notnull"`
	SearchSuggestions JSON      `bun:"search_suggestions,notnull"`
	UpdatedAt         time.Time `bun:",notnull"`
}

type Asset struct {
	bun.BaseModel `bun:"table:assets"`

	SHA256    string    `bun:"sha256,pk"`
	Format    string    `bun:",notnull"`
	Mime      string    `bun:",notnull"`
	Bytes     int64     `bun:",notnull"`
	Width     int       `bun:",notnull"`
	Height    int       `bun:",notnull"`
	Blurhash  string    `bun:",nullzero"`
	Dominant  string    `bun:",nullzero"`
	Meta      JSON      `bun:"meta"` // blurhash, dominant colour, source name
	CreatedBy string    `bun:",notnull"`
	CreatedAt time.Time `bun:",notnull"`
}

// Release targets.
const (
	TargetLive    = "live"
	TargetStaging = "staging"
)

type Release struct {
	bun.BaseModel `bun:"table:releases"`

	ID          int64     `bun:",pk,autoincrement"`
	Target      string    `bun:",notnull"`
	Version     string    `bun:",notnull"`
	Manifest    JSON      `bun:"manifest,notnull"`
	Changes     JSON      `bun:"changes,notnull"`
	Notes       string    `bun:",notnull"`
	Current     bool      `bun:",notnull"`
	PublishedBy string    `bun:",notnull"`
	PublishedAt time.Time `bun:",notnull"`
	// Status is one of the ReleaseStatus* values.
	Status        string `bun:",notnull"`
	CatalogSHA256 string `bun:"catalog_sha256,notnull"`
}

// Release statuses.
const (
	ReleaseBuilding   = "building"
	ReleaseLive       = "live"
	ReleaseSuperseded = "superseded"
	ReleaseRolledBack = "rolled_back"
	ReleaseFailed     = "failed"
)

type Event struct {
	bun.BaseModel `bun:"table:events"`

	ID        int64     `bun:",pk,autoincrement"`
	InstallID string    `bun:",notnull"`
	AppUserID *string   `bun:",nullzero"`
	Type      string    `bun:",notnull"`
	ItemID    string    `bun:",notnull"`
	At        time.Time `bun:",notnull"`
	CreatedAt time.Time `bun:",notnull"`
}

type GeneratorRecipe struct {
	bun.BaseModel `bun:"table:generator_recipes"`

	ID         string    `bun:",pk"`
	Name       string    `bun:",notnull"`
	FestivalID *string   `bun:",nullzero"`
	Data       JSON      `bun:"data,notnull"`
	Enabled    bool      `bun:",notnull"`
	CreatedBy  string    `bun:",notnull"`
	UpdatedBy  string    `bun:",notnull"`
	CreatedAt  time.Time `bun:",notnull"`
	UpdatedAt  time.Time `bun:",notnull"`
}

type GeneratorFeedback struct {
	bun.BaseModel `bun:"table:generator_feedback"`

	ID         int64     `bun:",pk,autoincrement"`
	UserID     *string   `bun:",nullzero"`
	FestivalID *string   `bun:",nullzero"`
	Mood       string    `bun:",notnull"`
	RecipeID   *string   `bun:",nullzero"`
	Seed       int64     `bun:",notnull"`
	Palette    JSON      `bun:"palette,notnull"`
	Hue        float64   `bun:",notnull"`
	Action     string    `bun:",notnull"`
	At         time.Time `bun:",notnull"`
}
