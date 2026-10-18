// Package config reads all settings from environment variables.
package config

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"log/slog"
	"time"

	"github.com/caarlos0/env/v11"
)

type Config struct {
	Env      string `env:"APP_ENV" envDefault:"development"`
	HTTPAddr string `env:"HTTP_ADDR" envDefault:":8080"`
	// postgres://user:pass@host/db or file:./data/wallp.db
	DatabaseURL string `env:"DATABASE_URL" envDefault:"file:./data/wallp.db"`

	JWTSecret       string        `env:"JWT_SECRET"`
	AccessTokenTTL  time.Duration `env:"ACCESS_TOKEN_TTL" envDefault:"15m"`
	RefreshTokenTTL time.Duration `env:"REFRESH_TOKEN_TTL" envDefault:"720h"`
	TOTPIssuer      string        `env:"TOTP_ISSUER" envDefault:"wallp"`

	// Admin UI origins allowed by CORS, e.g. https://you.github.io,http://localhost:3000
	CORSOrigins []string `env:"CORS_ORIGINS" envSeparator:"," envDefault:"http://localhost:3000"`

	// Where published catalogs and uploaded assets live.
	StorageDir string `env:"STORAGE_DIR" envDefault:"./data/storage"`
	// Public URL the API is reached on, used in links (QR preview, asset URLs).
	PublicBaseURL string `env:"PUBLIC_BASE_URL" envDefault:"http://localhost:8080"`

	// Required in production to create the first admin over HTTP.
	SetupToken string `env:"SETUP_TOKEN"`

	// "off" disables the scheduled-publish ticker (tests).
	Scheduler string `env:"SCHEDULER" envDefault:"on"`

	// Reverse proxy CIDRs whose X-Forwarded-For is trusted; empty = never.
	TrustedProxies []string `env:"TRUSTED_PROXIES" envSeparator:","`

	// Serve /docs and /openapi.* in production (hidden by default).
	DocsPublic bool `env:"DOCS_PUBLIC" envDefault:"false"`

	// Requests per minute per IP on auth endpoints.
	AuthRateLimit int `env:"AUTH_RATE_LIMIT" envDefault:"20"`

	// Events API limits per hour; 0 uses the default.
	EventsPerInstallHour int `env:"EVENTS_PER_INSTALL_HOUR" envDefault:"30"`
	EventsPerIPHour      int `env:"EVENTS_PER_IP_HOUR" envDefault:"120"`

	// Google Fonts metadata and download URLs.
	GoogleFontsMetadataURL string `env:"GOOGLE_FONTS_METADATA_URL" envDefault:"https://fonts.google.com/metadata/fonts"`
	GoogleFontsDownloadURL string `env:"GOOGLE_FONTS_DOWNLOAD_URL" envDefault:"https://fonts.google.com/download/list"`
}

func (c Config) IsProd() bool { return c.Env == "production" }

func Load() (Config, error) {
	c, err := env.ParseAs[Config]()
	if err != nil {
		return c, fmt.Errorf("config: %w", err)
	}
	if c.JWTSecret == "" {
		if c.IsProd() {
			return c, fmt.Errorf("config: JWT_SECRET is required in production")
		}
		b := make([]byte, 32)
		_, _ = rand.Read(b)
		c.JWTSecret = hex.EncodeToString(b)
		slog.Warn("JWT_SECRET not set; using a random one, tokens reset on restart")
	}
	if len(c.JWTSecret) < 32 {
		return c, fmt.Errorf("config: JWT_SECRET must be at least 32 characters")
	}
	return c, nil
}
