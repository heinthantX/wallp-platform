// Package api holds the HTTP operations, one file per area.
package api

import (
	"context"
	"time"

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
	// Now is the clock; nil means time.Now (tests fix it).
	Now func() time.Time
}

func (d *Deps) now() time.Time {
	if d.Now != nil {
		return d.Now().UTC()
	}
	return time.Now().UTC()
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
	registerChecks(h, d)
	registerReleases(h, d)
	registerEvents(h, d)
	registerStats(h, d)
	registerAI(h, d)
	registerPublicCatalog(r, d)
}
