// Package api holds the HTTP operations, one file per area.
package api

import (
	"context"

	"github.com/danielgtaylor/huma/v2"
	"github.com/gin-gonic/gin"
	"github.com/uptrace/bun"

	"github.com/heinthant/wallp-backend/internal/auth"
	"github.com/heinthant/wallp-backend/internal/checks"
	"github.com/heinthant/wallp-backend/internal/config"
)

type Deps struct {
	Cfg  config.Config
	DB   *bun.DB
	Auth *auth.Service
	// Checker runs the pre-publish checks; nil means no checks.
	Checker func(ctx context.Context) (checks.Report, error)
}

const (
	adminPrefix = "/admin/v1"
	appPrefix   = "/v1"
)

// Register adds every operation. r is the raw Gin engine for non-JSON
// routes (static catalog files).
func Register(h huma.API, r *gin.Engine, d *Deps) {
	registerHealth(h, d)
	registerAdminAuth(h, d)
	registerUsers(h, d)
	registerAudit(h, d)
	registerAppAuth(h, d)
	registerCatalogItems(h, d)
	registerGeneratorRecipes(h, d)
	registerAssets(h, r, d)
	registerReleases(h, d)
	registerPublicCatalog(r, d)
}
