// Package api holds the HTTP operations, one file per area.
package api

import (
	"github.com/danielgtaylor/huma/v2"
	"github.com/gin-gonic/gin"
	"github.com/uptrace/bun"

	"github.com/heinthant/wallp-backend/internal/auth"
	"github.com/heinthant/wallp-backend/internal/config"
)

type Deps struct {
	Cfg  config.Config
	DB   *bun.DB
	Auth *auth.Service
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
}
