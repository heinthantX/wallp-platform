// Package server wires Gin, Huma and the API modules together.
package server

import (
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/danielgtaylor/huma/v2"
	"github.com/danielgtaylor/huma/v2/adapters/humagin"
	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/ulule/limiter/v3"
	mgin "github.com/ulule/limiter/v3/drivers/middleware/gin"
	"github.com/ulule/limiter/v3/drivers/store/memory"

	"github.com/heinthant/wallp-backend/internal/api"
	"github.com/heinthant/wallp-backend/internal/apierr"
	"github.com/heinthant/wallp-backend/internal/auth"
)

const Version = "0.1.0"

// New builds the HTTP handler and the Huma API (the API is returned so
// tests and the OpenAPI export can use it).
func New(d *api.Deps) (http.Handler, huma.API) {
	if d.Cfg.IsProd() {
		gin.SetMode(gin.ReleaseMode)
	}
	r := gin.New()
	if len(d.Cfg.TrustedProxies) == 0 {
		_ = r.SetTrustedProxies(nil)
	} else if err := r.SetTrustedProxies(d.Cfg.TrustedProxies); err != nil {
		slog.Error("invalid TRUSTED_PROXIES, trusting none", "err", err)
		_ = r.SetTrustedProxies(nil)
	}
	r.Use(gin.Recovery(), requestID(), logger(), securityHeaders(d.Cfg.IsProd()))
	r.Use(cors.New(cors.Config{
		AllowOrigins:     d.Cfg.CORSOrigins,
		AllowMethods:     []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"Authorization", "Content-Type", "If-None-Match", "X-Request-Id"},
		ExposeHeaders:    []string{"ETag", "X-Request-Id", "Link"},
		AllowCredentials: false,
		MaxAge:           12 * time.Hour,
	}))
	r.Use(authRateLimit(d.Cfg.AuthRateLimit))
	r.MaxMultipartMemory = 32 << 20

	apierr.Install()
	cfg := huma.DefaultConfig("wallp API", Version)
	cfg.Info.Description = "Admin API for the wallp dashboard, optional app-user accounts, the Events API and the public catalog."
	cfg.Components.SecuritySchemes = map[string]*huma.SecurityScheme{
		auth.SecurityScheme: {Type: "http", Scheme: "bearer", BearerFormat: "JWT"},
	}
	if d.Cfg.IsProd() && !d.Cfg.DocsPublic {
		cfg.DocsPath, cfg.OpenAPIPath, cfg.SchemasPath = "", "", ""
	}
	cfg.Servers = []*huma.Server{{URL: d.Cfg.PublicBaseURL}}
	h := humagin.New(r, cfg)
	h.UseMiddleware(d.Auth.Middleware(h))

	api.Register(h, r, d)
	return r, h
}

func requestID() gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.GetHeader("X-Request-Id")
		if id == "" || len(id) > 64 {
			id = uuid.NewString()
		}
		c.Header("X-Request-Id", id)
		c.Set("request_id", id)
		c.Request = c.Request.WithContext(auth.WithMeta(c.Request.Context(),
			auth.Meta{UserAgent: c.Request.UserAgent(), IP: c.ClientIP()}))
		c.Next()
	}
}

func logger() gin.HandlerFunc {
	return func(c *gin.Context) {
		start := time.Now()
		c.Next()
		if c.Request.URL.Path == "/healthz" {
			return
		}
		slog.Info("http",
			"method", c.Request.Method, "path", c.Request.URL.Path, "status", c.Writer.Status(),
			"ms", time.Since(start).Milliseconds(), "ip", c.ClientIP(), "rid", c.GetString("request_id"))
	}
}

func securityHeaders(prod bool) gin.HandlerFunc {
	return func(c *gin.Context) {
		h := c.Writer.Header()
		if prod {
			h.Set("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
		}
		if p := c.Request.URL.Path; p != "/docs" && !strings.HasPrefix(p, "/docs/") {
			h.Set("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'")
		}
		h.Set("X-Content-Type-Options", "nosniff")
		h.Set("Referrer-Policy", "no-referrer")
		h.Set("X-Frame-Options", "DENY")
		c.Next()
	}
}

// authRateLimit limits sign-in style endpoints per IP.
func authRateLimit(perMinute int) gin.HandlerFunc {
	lim := mgin.NewMiddleware(limiter.New(memory.NewStore(), limiter.Rate{Period: time.Minute, Limit: int64(perMinute)}),
		mgin.WithLimitReachedHandler(func(c *gin.Context) {
			c.AbortWithStatusJSON(http.StatusTooManyRequests,
				apierr.New(http.StatusTooManyRequests, "rate_limited", "Too many attempts, wait a minute and try again"))
		}))
	return func(c *gin.Context) {
		if c.Request.Method == http.MethodPost && strings.Contains(c.Request.URL.Path, "/auth/") &&
			!strings.HasSuffix(c.Request.URL.Path, "/refresh") {
			lim(c)
			return
		}
		c.Next()
	}
}
