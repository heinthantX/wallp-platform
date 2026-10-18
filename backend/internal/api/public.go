package api

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	"github.com/gin-gonic/gin"

	"github.com/heinthant/wallp-backend/internal/apierr"
	"github.com/heinthant/wallp-backend/internal/items"
	"github.com/heinthant/wallp-backend/internal/releases"
)

// Strict file names for the public catalog: nothing else is ever served.
var (
	manifestRe = regexp.MustCompile(`^manifest\.json$`)
	catalogRe  = regexp.MustCompile(`^catalog\.\d{4}-\d{2}-\d{2}\.\d+\.json$`)
	themeRe    = regexp.MustCompile(`^themes/[a-z0-9]+(-[a-z0-9]+)*\.\d+\.json$`)
	assetRe    = regexp.MustCompile(`^assets/([a-f0-9]{64})\.(png|jpg|webp|ttf|otf|woff2|json)$`)
)

// registerPublicCatalog serves /catalog/v1/* without auth (theme-api §3).
func registerPublicCatalog(r *gin.Engine, d *Deps) {
	notFound := func(c *gin.Context) {
		c.AbortWithStatusJSON(http.StatusNotFound, apierr.NotFound("File"))
	}
	r.GET("/catalog/v1/*path", func(c *gin.Context) {
		name := strings.TrimPrefix(c.Param("path"), "/")
		var full, etag, cache, ctype string
		switch {
		case manifestRe.MatchString(name):
			cache = "public, max-age=300"
		case catalogRe.MatchString(name), themeRe.MatchString(name):
			cache = "public, max-age=31536000, immutable"
		case assetRe.MatchString(name):
			m := assetRe.FindStringSubmatch(name)
			full = filepath.Join(d.Cfg.StorageDir, "assets", filepath.Base(name))
			etag = `"` + m[1] + `"` // the name is the hash
			cache = "public, max-age=31536000, immutable"
			ctype = items.MimeForFormat(m[2])
			if m[2] == "json" {
				ctype = "application/json"
			}
		default:
			notFound(c)
			return
		}
		if full == "" {
			full = filepath.Join(releases.Dir(d.Cfg.StorageDir), filepath.FromSlash(name))
			ctype = "application/json; charset=utf-8"
		}
		data, err := os.ReadFile(full) // ponytail: whole file in memory, stream if assets grow past 10 MB
		if err != nil {
			notFound(c)
			return
		}
		if etag == "" {
			sum := sha256.Sum256(data)
			etag = `"` + hex.EncodeToString(sum[:]) + `"`
		}
		c.Header("ETag", etag)
		c.Header("Cache-Control", cache)
		c.Header("Content-Type", ctype)
		http.ServeContent(c.Writer, c.Request, "", time.Time{}, bytes.NewReader(data)) // answers If-None-Match with 304
	})
}
