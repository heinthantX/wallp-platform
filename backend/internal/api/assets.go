package api

import (
	"bytes"
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"mime"
	"mime/multipart"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	"github.com/danielgtaylor/huma/v2"
	"github.com/gin-gonic/gin"
	"github.com/uptrace/bun"

	"github.com/heinthant/wallp-backend/internal/apierr"
	"github.com/heinthant/wallp-backend/internal/assets"
	"github.com/heinthant/wallp-backend/internal/audit"
	"github.com/heinthant/wallp-backend/internal/auth"
	"github.com/heinthant/wallp-backend/internal/items"
	"github.com/heinthant/wallp-backend/internal/model"
)

var assetFilenameRegex = regexp.MustCompile(`^[a-f0-9]{64}\.(png|jpg|webp|ttf|otf|json)$`)

type AssetItem struct {
	URL       string    `json:"url"`
	SHA256    string    `json:"sha256"`
	Bytes     int64     `json:"bytes"`
	Format    string    `json:"format"`
	Width     int       `json:"width,omitempty"`
	Height    int       `json:"height,omitempty"`
	Blurhash  string    `json:"blurhash,omitempty"`
	Dominant  string    `json:"dominant,omitempty"`
	CreatedAt time.Time `json:"createdAt"`
}

type UploadAssetInput struct {
	ContentType string `header:"Content-Type"`
	Variants    string `query:"variants"`
	RawBody     []byte
}

type UploadAssetResult struct {
	URL      string               `json:"url"`
	SHA256   string               `json:"sha256"`
	Bytes    int64                `json:"bytes"`
	Format   string               `json:"format"`
	Width    int                  `json:"width,omitempty"`
	Height   int                  `json:"height,omitempty"`
	Blurhash string               `json:"blurhash,omitempty"`
	Dominant string               `json:"dominant,omitempty"`
	Deduped  bool                 `json:"deduped"`
	Variants map[string]AssetItem `json:"variants,omitempty"`
	Warnings []string             `json:"warnings"`
}

type UploadAssetOutput struct {
	Body UploadAssetResult
}

type ListAssetsInput struct {
	ListParams
	Format string `query:"format"`
}

type ListAssetsOutput struct {
	Body Page[AssetItem]
}

type GetAssetInput struct {
	SHA256 string `path:"sha256"`
}

type GetAssetOutput struct {
	Body AssetItem
}

type DeleteAssetInput struct {
	SHA256 string `path:"sha256"`
}

func toAssetItem(a *model.Asset) AssetItem {
	return AssetItem{
		URL:       fmt.Sprintf("assets/%s.%s", a.SHA256, a.Format),
		SHA256:    a.SHA256,
		Bytes:     a.Bytes,
		Format:    a.Format,
		Width:     a.Width,
		Height:    a.Height,
		Blurhash:  a.Blurhash,
		Dominant:  a.Dominant,
		CreatedAt: a.CreatedAt,
	}
}

func registerAssets(h huma.API, r *gin.Engine, d *Deps) {
	assetTags := []string{"Assets"}

	// --- Upload Asset ---
	huma.Register(h, auth.Admin(huma.Operation{
		OperationID:  "upload-asset",
		Method:       http.MethodPost,
		Path:         adminPrefix + "/assets",
		Summary:      "Upload a static asset file",
		Tags:         assetTags,
		MaxBodyBytes: assets.MaxAssetSize,
	}, model.RoleDesigner, model.RoleReviewer), func(ctx context.Context, in *UploadAssetInput) (*UploadAssetOutput, error) {
		me := auth.From(ctx)
		actor := "system"
		if me != nil {
			actor = me.Name
		}

		if !strings.HasPrefix(in.ContentType, "multipart/form-data") {
			return nil, apierr.Invalid("Content-Type", "Expected multipart/form-data")
		}
		_, params, err := mime.ParseMediaType(in.ContentType)
		if err != nil {
			return nil, apierr.Invalid("Content-Type", "Invalid multipart Content-Type")
		}
		boundary := params["boundary"]
		if boundary == "" {
			return nil, apierr.Invalid("Content-Type", "Missing multipart boundary")
		}

		mr := multipart.NewReader(bytes.NewReader(in.RawBody), boundary)
		form, err := mr.ReadForm(assets.MaxAssetSize)
		if err != nil {
			return nil, apierr.Invalid("body", "The upload could not be read")
		}
		defer form.RemoveAll()

		files := form.File["file"]
		if len(files) == 0 {
			return nil, apierr.Invalid("file", "Missing 'file' field in form")
		}
		fh := files[0]
		if fh.Size > assets.MaxAssetSize {
			return nil, apierr.New(http.StatusUnprocessableEntity, "oversized", "File exceeds 10 MB limit")
		}

		f, err := fh.Open()
		if err != nil {
			return nil, err
		}
		defer f.Close()

		data, err := io.ReadAll(f)
		if err != nil {
			return nil, err
		}
		if int64(len(data)) > assets.MaxAssetSize {
			return nil, apierr.New(http.StatusUnprocessableEntity, "oversized", "File exceeds 10 MB limit")
		}

		// Sniff format
		format, mimeType, err := assets.Sniff(data)
		if err != nil {
			return nil, err
		}

		// Calculate sha256
		hVal := sha256.Sum256(data)
		shaHex := hex.EncodeToString(hVal[:])

		// Deduplication check in DB
		var existing model.Asset
		err = d.DB.NewSelect().Model(&existing).Where("sha256 = ?", shaHex).Scan(ctx)
		if err == nil {
			// Found existing row -> Dedupe!
			// Ensure file exists on disk
			_, _ = assets.StoreAsset(d.Cfg.StorageDir, shaHex, format, data)

			var variants map[string]AssetItem
			if in.Variants == "wallpaper" && (format == "png" || format == "jpg" || format == "webp") {
				variants = loadOrGenerateWallpaperVariants(ctx, d, data, actor)
			}

			return &UploadAssetOutput{
				Body: UploadAssetResult{
					URL:      fmt.Sprintf("assets/%s.%s", existing.SHA256, existing.Format),
					SHA256:   existing.SHA256,
					Bytes:    existing.Bytes,
					Format:   existing.Format,
					Width:    existing.Width,
					Height:   existing.Height,
					Blurhash: existing.Blurhash,
					Dominant: existing.Dominant,
					Deduped:  true,
					Variants: variants,
					Warnings: []string{},
				},
			}, nil
		} else if !errors.Is(err, sql.ErrNoRows) {
			return nil, err
		}

		// New asset: process images
		isImage := format == "png" || format == "jpg" || format == "webp"
		var meta assets.ImageMeta
		var variants map[string]AssetItem

		if isImage {
			img, imgMeta, err := assets.ProcessImage(data, in.Variants == "wallpaper")
			if err != nil {
				return nil, err
			}
			meta = imgMeta

			if in.Variants == "wallpaper" {
				varMap, err := assets.CreateWallpaperVariants(img)
				if err != nil {
					return nil, err
				}
				variants = make(map[string]AssetItem, len(varMap))
				now := time.Now().UTC().Truncate(time.Millisecond)

				err = d.DB.RunInTx(ctx, nil, func(ctx context.Context, tx bun.Tx) error {
					for key, v := range varMap {
						if _, err := assets.StoreAsset(d.Cfg.StorageDir, v.SHA256, v.Format, v.Bytes); err != nil {
							return err
						}

						var vExisting model.Asset
						vErr := tx.NewSelect().Model(&vExisting).Where("sha256 = ?", v.SHA256).Scan(ctx)
						if errors.Is(vErr, sql.ErrNoRows) {
							vAsset := &model.Asset{
								SHA256:    v.SHA256,
								Format:    v.Format,
								Mime:      items.MimeForFormat(v.Format),
								Bytes:     int64(len(v.Bytes)),
								Width:     v.Width,
								Height:    v.Height,
								Blurhash:  v.Blurhash,
								Dominant:  v.Dominant,
								CreatedBy: actor,
								CreatedAt: now,
							}
							if _, err := tx.NewInsert().Model(vAsset).Exec(ctx); err != nil {
								return err
							}
							if err := audit.Record(ctx, tx, "create", "asset", v.SHA256, nil, vAsset); err != nil {
								return err
							}
							variants[key] = toAssetItem(vAsset)
						} else if vErr == nil {
							variants[key] = toAssetItem(&vExisting)
						} else {
							return vErr
						}
					}
					return nil
				})
				if err != nil {
					return nil, err
				}
			}
		}

		// Store primary asset file
		if _, err := assets.StoreAsset(d.Cfg.StorageDir, shaHex, format, data); err != nil {
			return nil, err
		}

		now := time.Now().UTC().Truncate(time.Millisecond)
		newAsset := &model.Asset{
			SHA256:    shaHex,
			Format:    format,
			Mime:      mimeType,
			Bytes:     int64(len(data)),
			Width:     meta.Width,
			Height:    meta.Height,
			Blurhash:  meta.Blurhash,
			Dominant:  meta.Dominant,
			CreatedBy: actor,
			CreatedAt: now,
		}

		err = d.DB.RunInTx(ctx, nil, func(ctx context.Context, tx bun.Tx) error {
			if _, err := tx.NewInsert().Model(newAsset).Exec(ctx); err != nil {
				return err
			}
			return audit.Record(ctx, tx, "create", "asset", newAsset.SHA256, nil, newAsset)
		})
		if err != nil {
			return nil, err
		}

		warnings := meta.Warnings
		if warnings == nil {
			warnings = []string{}
		}

		return &UploadAssetOutput{
			Body: UploadAssetResult{
				URL:      fmt.Sprintf("assets/%s.%s", newAsset.SHA256, newAsset.Format),
				SHA256:   newAsset.SHA256,
				Bytes:    newAsset.Bytes,
				Format:   newAsset.Format,
				Width:    newAsset.Width,
				Height:   newAsset.Height,
				Blurhash: newAsset.Blurhash,
				Dominant: newAsset.Dominant,
				Deduped:  false,
				Variants: variants,
				Warnings: warnings,
			},
		}, nil
	})

	// --- List Assets ---
	huma.Register(h, auth.Admin(huma.Operation{
		OperationID: "list-assets",
		Method:      http.MethodGet,
		Path:        adminPrefix + "/assets",
		Summary:     "List assets",
		Tags:        assetTags,
	}), func(ctx context.Context, in *ListAssetsInput) (*ListAssetsOutput, error) {
		var rows []model.Asset
		q := d.DB.NewSelect().Model(&rows)

		if in.Format != "" {
			q = q.Where("format = ?", in.Format)
		}

		sortable := map[string]string{
			"createdAt": "created_at",
			"bytes":     "bytes",
			"format":    "format",
		}
		var err error
		q, err = paginate(q, in.ListParams, sortable, "-createdAt")
		if err != nil {
			return nil, err
		}

		total, err := q.ScanAndCount(ctx)
		if err != nil {
			return nil, err
		}

		page := in.Page
		if page < 1 {
			page = 1
		}
		perPage := in.PerPage
		if perPage < 1 {
			perPage = 50
		}

		itemsList := make([]AssetItem, len(rows))
		for i := range rows {
			itemsList[i] = toAssetItem(&rows[i])
		}

		return &ListAssetsOutput{
			Body: Page[AssetItem]{
				Items:   itemsList,
				Total:   int(total),
				Page:    page,
				PerPage: perPage,
			},
		}, nil
	})

	// --- Get Asset ---
	huma.Register(h, auth.Admin(huma.Operation{
		OperationID: "get-asset",
		Method:      http.MethodGet,
		Path:        adminPrefix + "/assets/{sha256}",
		Summary:     "Get an asset",
		Tags:        assetTags,
	}), func(ctx context.Context, in *GetAssetInput) (*GetAssetOutput, error) {
		var row model.Asset
		err := d.DB.NewSelect().Model(&row).Where("sha256 = ?", in.SHA256).Scan(ctx)
		if err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				return nil, apierr.NotFound("Asset")
			}
			return nil, err
		}
		return &GetAssetOutput{Body: toAssetItem(&row)}, nil
	})

	// --- Delete Asset ---
	huma.Register(h, auth.Admin(huma.Operation{
		OperationID: "delete-asset",
		Method:      http.MethodDelete,
		Path:        adminPrefix + "/assets/{sha256}",
		Summary:     "Delete an asset",
		Tags:        assetTags,
	}, model.RoleAdmin), func(ctx context.Context, in *DeleteAssetInput) (*SimpleOKOutput, error) {
		var asset model.Asset
		err := d.DB.NewSelect().Model(&asset).Where("sha256 = ?", in.SHA256).Scan(ctx)
		if err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				return nil, apierr.NotFound("Asset")
			}
			return nil, err
		}

		// 409 asset_in_use check on item tables using bound LIKE and likeContains
		tables := []string{"themes", "wallpapers", "fonts", "icon_packs", "banners", "festivals"}
		assetURL := fmt.Sprintf("assets/%s.%s", asset.SHA256, asset.Format)
		patURL := likeContains(assetURL)
		patHash := likeContains(asset.SHA256)

		for _, tbl := range tables {
			count, err := d.DB.NewSelect().
				Table(tbl).
				Where("CAST(? AS TEXT) LIKE ? ESCAPE '\\' OR CAST(? AS TEXT) LIKE ? ESCAPE '\\' OR (published_data IS NOT NULL AND (CAST(? AS TEXT) LIKE ? ESCAPE '\\' OR CAST(? AS TEXT) LIKE ? ESCAPE '\\'))",
					bun.Ident("data"), patURL, bun.Ident("data"), patHash,
					bun.Ident("published_data"), patURL, bun.Ident("published_data"), patHash).
				Count(ctx)
			if err != nil {
				return nil, err
			}
			if count > 0 {
				return nil, apierr.Conflict("asset_in_use", fmt.Sprintf("Asset is in use by %s", tbl))
			}
		}

		// Delete from database
		err = d.DB.RunInTx(ctx, nil, func(ctx context.Context, tx bun.Tx) error {
			if _, err := tx.NewDelete().Model(&asset).Where("sha256 = ?", asset.SHA256).Exec(ctx); err != nil {
				return err
			}
			return audit.Record(ctx, tx, "delete", "asset", asset.SHA256, asset, nil)
		})
		if err != nil {
			return nil, err
		}

		// Remove file from disk
		filePath := filepath.Join(d.Cfg.StorageDir, "assets", fmt.Sprintf("%s.%s", asset.SHA256, asset.Format))
		_ = os.Remove(filePath)

		out := &SimpleOKOutput{}
		out.Body.OK = true
		return out, nil
	})

	// --- Static file serving for admin preview ---
	r.GET("/assets/:filename", func(c *gin.Context) {
		filename := c.Param("filename")
		if !assetFilenameRegex.MatchString(filename) {
			c.AbortWithStatus(http.StatusNotFound)
			return
		}

		assetsDir := filepath.Clean(filepath.Join(d.Cfg.StorageDir, "assets"))
		fullPath := filepath.Clean(filepath.Join(assetsDir, filename))

		// Strict path traversal guard
		if !strings.HasPrefix(fullPath, assetsDir+string(filepath.Separator)) {
			c.AbortWithStatus(http.StatusNotFound)
			return
		}

		if _, err := os.Stat(fullPath); os.IsNotExist(err) {
			c.AbortWithStatus(http.StatusNotFound)
			return
		}

		c.Header("Cache-Control", "public, max-age=31536000, immutable")
		ext := strings.TrimPrefix(filepath.Ext(filename), ".")
		c.Header("Content-Type", items.MimeForFormat(ext))
		c.File(fullPath)
	})
}

func loadOrGenerateWallpaperVariants(ctx context.Context, d *Deps, data []byte, actor string) map[string]AssetItem {
	img, _, err := assets.ProcessImage(data, false)
	if err != nil {
		return nil
	}
	varMap, err := assets.CreateWallpaperVariants(img)
	if err != nil {
		return nil
	}
	variants := make(map[string]AssetItem, len(varMap))
	now := time.Now().UTC().Truncate(time.Millisecond)

	_ = d.DB.RunInTx(ctx, nil, func(ctx context.Context, tx bun.Tx) error {
		for key, v := range varMap {
			_, _ = assets.StoreAsset(d.Cfg.StorageDir, v.SHA256, v.Format, v.Bytes)
			var vExisting model.Asset
			vErr := tx.NewSelect().Model(&vExisting).Where("sha256 = ?", v.SHA256).Scan(ctx)
			if errors.Is(vErr, sql.ErrNoRows) {
				vAsset := &model.Asset{
					SHA256:    v.SHA256,
					Format:    v.Format,
					Mime:      items.MimeForFormat(v.Format),
					Bytes:     int64(len(v.Bytes)),
					Width:     v.Width,
					Height:    v.Height,
					Blurhash:  v.Blurhash,
					Dominant:  v.Dominant,
					CreatedBy: actor,
					CreatedAt: now,
				}
				if _, err := tx.NewInsert().Model(vAsset).Exec(ctx); err == nil {
					_ = audit.Record(ctx, tx, "create", "asset", v.SHA256, nil, vAsset)
					variants[key] = toAssetItem(vAsset)
				}
			} else if vErr == nil {
				variants[key] = toAssetItem(&vExisting)
			}
		}
		return nil
	})
	return variants
}
