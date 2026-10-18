package api

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mime"
	"mime/multipart"
	"net/http"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"time"

	"github.com/danielgtaylor/huma/v2"
	"github.com/uptrace/bun"

	"github.com/heinthant/wallp-backend/internal/apierr"
	"github.com/heinthant/wallp-backend/internal/auth"
	"github.com/heinthant/wallp-backend/internal/catalog"
	"github.com/heinthant/wallp-backend/internal/items"
	"github.com/heinthant/wallp-backend/internal/model"
)

type ImportInput struct {
	ContentType string `header:"Content-Type"`
	RawBody     []byte
}

type ImportResult struct {
	Festivals  int `json:"festivals"`
	Themes     int `json:"themes"`
	Wallpapers int `json:"wallpapers"`
	Fonts      int `json:"fonts"`
	IconPacks  int `json:"iconPacks"`
	Banners    int `json:"banners"`
	// SkippedAssets lists asset files left out because their type is not supported.
	SkippedAssets []string `json:"skippedAssets,omitempty"`
}

type ImportOutput struct {
	Body struct {
		ImportResult
		Counts ImportResult `json:"counts"`
	}
}

type ExportCatalogOutput struct {
	Body ExportBundle
}

type ExportBundle struct {
	Festivals         []json.RawMessage      `json:"festivals"`
	Themes            []json.RawMessage      `json:"themes"`
	Wallpapers        []json.RawMessage      `json:"wallpapers"`
	Fonts             []json.RawMessage      `json:"fonts"`
	IconPacks         []json.RawMessage      `json:"iconPacks"`
	Banners           []json.RawMessage      `json:"banners"`
	AccentPresets     *catalog.AccentPresets `json:"accentPresets"`
	SearchSuggestions []string               `json:"searchSuggestions"`
}

type FileEntry struct {
	Name  string
	Bytes []byte
}

func registerImportExport(h huma.API, d *Deps) {
	catalogTags := []string{"Catalog"}

	// --- Import ---
	huma.Register(h, auth.Admin(huma.Operation{
		OperationID:  "import-catalog",
		Method:       http.MethodPost,
		Path:         adminPrefix + "/import",
		Summary:      "Import catalog bundle or directory",
		Tags:         catalogTags,
		MaxBodyBytes: 64 * 1024 * 1024,
	}, model.RoleAdmin), func(ctx context.Context, in *ImportInput) (*ImportOutput, error) {
		me := auth.From(ctx)
		actor := "system"
		if me != nil {
			actor = me.Name
		}

		if strings.HasPrefix(in.ContentType, "multipart/form-data") {
			_, params, err := mime.ParseMediaType(in.ContentType)
			if err != nil {
				return nil, apierr.Invalid("Content-Type", "Invalid multipart Content-Type")
			}
			boundary := params["boundary"]
			if boundary == "" {
				return nil, apierr.Invalid("Content-Type", "Missing multipart boundary")
			}
			mr := multipart.NewReader(bytes.NewReader(in.RawBody), boundary)
			form, err := mr.ReadForm(64 << 20)
			if err != nil {
				return nil, apierr.Invalid("body", "The upload could not be read")
			}
			defer form.RemoveAll()

			catFiles := form.File["catalog"]
			if len(catFiles) == 0 {
				return nil, apierr.Invalid("catalog", "Missing catalog file in multipart form")
			}
			catF, err := catFiles[0].Open()
			if err != nil {
				return nil, err
			}
			defer catF.Close()
			catBytes, err := io.ReadAll(catF)
			if err != nil {
				return nil, err
			}

			var themeFiles []FileEntry
			for _, fh := range form.File["themes"] {
				f, err := fh.Open()
				if err != nil {
					return nil, err
				}
				b, err := io.ReadAll(f)
				f.Close()
				if err != nil {
					return nil, err
				}
				themeFiles = append(themeFiles, FileEntry{Name: fh.Filename, Bytes: b})
			}
			for _, fh := range form.File["themes[]"] {
				f, err := fh.Open()
				if err != nil {
					return nil, err
				}
				b, err := io.ReadAll(f)
				f.Close()
				if err != nil {
					return nil, err
				}
				themeFiles = append(themeFiles, FileEntry{Name: fh.Filename, Bytes: b})
			}

			var assetFiles []items.AssetFile
			for _, fh := range form.File["assets"] {
				f, err := fh.Open()
				if err != nil {
					return nil, err
				}
				b, err := io.ReadAll(f)
				f.Close()
				if err != nil {
					return nil, err
				}
				assetFiles = append(assetFiles, items.AssetFile{Name: fh.Filename, Bytes: b})
			}
			for _, fh := range form.File["assets[]"] {
				f, err := fh.Open()
				if err != nil {
					return nil, err
				}
				b, err := io.ReadAll(f)
				f.Close()
				if err != nil {
					return nil, err
				}
				assetFiles = append(assetFiles, items.AssetFile{Name: fh.Filename, Bytes: b})
			}

			res, err := RunImport(ctx, d, catBytes, themeFiles, assetFiles, actor, "")
			if err != nil {
				return nil, err
			}
			out := &ImportOutput{}
			out.Body.ImportResult = *res
			out.Body.Counts = *res
			return out, nil
		}

		// JSON request
		var jsonReq struct {
			Dir string `json:"dir"`
		}
		if err := json.Unmarshal(in.RawBody, &jsonReq); err != nil {
			return nil, apierr.Invalid("body", "Invalid JSON request body")
		}
		if jsonReq.Dir == "" {
			return nil, apierr.Invalid("dir", "Missing dir in request body")
		}
		if d.Cfg.IsProd() {
			return nil, apierr.Forbidden("Importing from directory is not allowed in production")
		}

		res, err := RunImportDir(ctx, d, jsonReq.Dir, actor)
		if err != nil {
			return nil, err
		}
		out := &ImportOutput{}
		out.Body.ImportResult = *res
		out.Body.Counts = *res
		return out, nil
	})

	// --- Export ---
	huma.Register(h, auth.Admin(huma.Operation{
		OperationID: "export-catalog",
		Method:      http.MethodGet,
		Path:        adminPrefix + "/export",
		Summary:     "Export catalog bundle",
		Tags:        catalogTags,
	}), func(ctx context.Context, in *struct{}) (*ExportCatalogOutput, error) {
		bundle, err := RunExport(ctx, d)
		if err != nil {
			return nil, err
		}
		return &ExportCatalogOutput{Body: *bundle}, nil
	})
}

func RunImportDir(ctx context.Context, d *Deps, dir, actor string) (*ImportResult, error) {
	stat, err := os.Stat(dir)
	if err != nil || !stat.IsDir() {
		return nil, apierr.Invalid("dir", fmt.Sprintf("Directory %q does not exist", dir))
	}

	var mf catalog.Manifest
	if mBytes, err := os.ReadFile(filepath.Join(dir, "manifest.json")); err == nil {
		_ = json.Unmarshal(mBytes, &mf)
	}

	catPath := ""
	if mf.Catalog != "" {
		p := filepath.Join(dir, mf.Catalog)
		if _, err := os.Stat(p); err == nil && insideDir(dir, p) {
			catPath = p
		}
	}
	if catPath == "" {
		matches, _ := filepath.Glob(filepath.Join(dir, "catalog*.json"))
		if len(matches) > 0 {
			catPath = matches[0]
		}
	}
	if catPath == "" {
		p := filepath.Join(dir, "catalog.json")
		if _, err := os.Stat(p); err == nil {
			catPath = p
		}
	}
	if catPath == "" {
		return nil, apierr.Invalid("dir", "Catalog JSON file not found in directory")
	}

	catBytes, err := os.ReadFile(catPath)
	if err != nil {
		return nil, fmt.Errorf("read catalog: %w", err)
	}

	themeMatches, _ := filepath.Glob(filepath.Join(dir, "themes", "*.json"))
	var themeFiles []FileEntry
	for _, p := range themeMatches {
		if fi, err := os.Lstat(p); err != nil || !fi.Mode().IsRegular() {
			continue // symlinks and directories are skipped
		}
		b, err := os.ReadFile(p)
		if err != nil {
			return nil, fmt.Errorf("read theme %s: %w", p, err)
		}
		themeFiles = append(themeFiles, FileEntry{Name: filepath.Base(p), Bytes: b})
	}

	var assetFiles []items.AssetFile
	assetsDir := filepath.Join(dir, "assets")
	if fi, err := os.Lstat(assetsDir); err == nil && fi.IsDir() { // not a symlink
		entries, _ := os.ReadDir(assetsDir)
		for _, entry := range entries {
			// Regular files only: skips symlinks and directories.
			if !entry.Type().IsRegular() {
				continue
			}
			b, err := os.ReadFile(filepath.Join(assetsDir, entry.Name()))
			if err != nil {
				return nil, fmt.Errorf("read asset %s: %w", entry.Name(), err)
			}
			assetFiles = append(assetFiles, items.AssetFile{Name: entry.Name(), Bytes: b})
		}
	}

	return RunImport(ctx, d, catBytes, themeFiles, assetFiles, actor, mf.PublishedAt)
}

func RunImport(ctx context.Context, d *Deps, catBytes []byte, themeFiles []FileEntry, assetFiles []items.AssetFile, actor, manifestPublishedAt string) (*ImportResult, error) {
	// Hidden files (macOS "._*" AppleDouble, .DS_Store) are never catalog data.
	themeFiles = slices.DeleteFunc(themeFiles, func(f FileEntry) bool { return isHidden(f.Name) })
	assetFiles = slices.DeleteFunc(assetFiles, func(f items.AssetFile) bool { return isHidden(f.Name) })

	var rawCatalog map[string]json.RawMessage
	if err := json.Unmarshal(catBytes, &rawCatalog); err != nil {
		var se *json.SyntaxError
		if errors.As(err, &se) {
			return nil, apierr.Invalid("catalog", fmt.Sprintf("Invalid catalog JSON near byte %d", se.Offset))
		}
		return nil, apierr.Invalid("catalog", "Invalid catalog JSON")
	}

	var rawFestivals []json.RawMessage
	if rf, ok := rawCatalog["festivals"]; ok {
		_ = json.Unmarshal(rf, &rawFestivals)
	}
	// An export bundle carries full themes inline (they have "accents"); an app catalog
	// carries summaries and ships full themes as separate files.
	if len(themeFiles) == 0 {
		var rawThemes []map[string]json.RawMessage
		if rt, ok := rawCatalog["themes"]; ok {
			_ = json.Unmarshal(rt, &rawThemes)
		}
		for _, t := range rawThemes {
			if _, full := t["accents"]; !full {
				continue
			}
			b, _ := json.Marshal(t)
			themeFiles = append(themeFiles, FileEntry{Name: "theme " + string(t["id"]), Bytes: b})
		}
	}

	var rawWallpapers []json.RawMessage
	if rw, ok := rawCatalog["wallpapers"]; ok {
		_ = json.Unmarshal(rw, &rawWallpapers)
	}
	var rawFonts []json.RawMessage
	if rf, ok := rawCatalog["fonts"]; ok {
		_ = json.Unmarshal(rf, &rawFonts)
	}
	var rawIconPacks []json.RawMessage
	if rp, ok := rawCatalog["iconPacks"]; ok {
		_ = json.Unmarshal(rp, &rawIconPacks)
	}
	var rawBanners []json.RawMessage
	if rb, ok := rawCatalog["banners"]; ok {
		_ = json.Unmarshal(rb, &rawBanners)
	}

	var defaultPublishedAt time.Time
	if manifestPublishedAt != "" {
		if pt, err := time.Parse(time.RFC3339Nano, manifestPublishedAt); err == nil {
			defaultPublishedAt = pt
		} else if pt, err := time.Parse(time.RFC3339, manifestPublishedAt); err == nil {
			defaultPublishedAt = pt
		}
	}
	if defaultPublishedAt.IsZero() {
		defaultPublishedAt = time.Now().UTC()
	}

	var createdFiles, skippedAssets []string
	err := d.DB.RunInTx(ctx, nil, func(ctx context.Context, tx bun.Tx) error {
		// 1. Assets
		cf, skipped, err := items.VerifyAndCopyAssets(ctx, tx, d.Cfg.StorageDir, assetFiles, actor)
		if err != nil {
			return err
		}
		createdFiles, skippedAssets = cf, skipped

		// 2. Store Settings
		accentPresetsRaw := rawCatalog["accentPresets"]
		searchSuggestionsRaw := rawCatalog["searchSuggestions"]
		if len(accentPresetsRaw) > 0 && len(searchSuggestionsRaw) > 0 {
			if err := items.ImportStoreSettings(ctx, tx, accentPresetsRaw, searchSuggestionsRaw, actor); err != nil {
				return fmt.Errorf("import store settings: %w", err)
			}
		}

		festStore := items.NewStore(d.DB, items.FestivalKind)
		themeStore := items.NewStore(d.DB, items.ThemeKind)
		wpStore := items.NewStore(d.DB, items.WallpaperKind)
		fontStore := items.NewStore(d.DB, items.FontKind)
		ipStore := items.NewStore(d.DB, items.IconPackKind)
		bannerStore := items.NewStore(d.DB, items.BannerKind)

		// 3. Festivals
		for _, fb := range rawFestivals {
			if _, err := festStore.ImportItem(ctx, tx, fb, 1, &defaultPublishedAt, actor); err != nil {
				return fmt.Errorf("import festival: %w", err)
			}
		}

		// 4. Themes (from full theme files)
		for _, tf := range themeFiles {
			var t catalog.ThemeDetail
			if err := json.Unmarshal(tf.Bytes, &t); err != nil {
				return fmt.Errorf("unmarshal theme %s: %w", tf.Name, err)
			}
			var tPub *time.Time
			if t.PublishedAt != "" {
				if pt, err := time.Parse(time.RFC3339Nano, t.PublishedAt); err == nil {
					tPub = &pt
				} else if pt, err := time.Parse(time.RFC3339, t.PublishedAt); err == nil {
					tPub = &pt
				}
			}
			if tPub == nil {
				tPub = &defaultPublishedAt
			}
			if _, err := themeStore.ImportItem(ctx, tx, tf.Bytes, t.Rev, tPub, actor); err != nil {
				return fmt.Errorf("import theme %s: %w", tf.Name, err)
			}
		}

		// 5. Wallpapers
		for _, wb := range rawWallpapers {
			var w catalog.Wallpaper
			_ = json.Unmarshal(wb, &w)
			var wPub *time.Time
			if w.PublishedAt != "" {
				if pt, err := time.Parse(time.RFC3339Nano, w.PublishedAt); err == nil {
					wPub = &pt
				} else if pt, err := time.Parse(time.RFC3339, w.PublishedAt); err == nil {
					wPub = &pt
				}
			}
			if wPub == nil {
				wPub = &defaultPublishedAt
			}
			if _, err := wpStore.ImportItem(ctx, tx, wb, 1, wPub, actor); err != nil {
				return fmt.Errorf("import wallpaper: %w", err)
			}
		}

		// 6. Fonts
		for _, fnb := range rawFonts {
			if _, err := fontStore.ImportItem(ctx, tx, fnb, 1, &defaultPublishedAt, actor); err != nil {
				return fmt.Errorf("import font: %w", err)
			}
		}

		// 7. Icon packs
		for _, ipb := range rawIconPacks {
			var p catalog.IconPack
			_ = json.Unmarshal(ipb, &p)
			var pPub *time.Time
			if p.PublishedAt != "" {
				if pt, err := time.Parse(time.RFC3339Nano, p.PublishedAt); err == nil {
					pPub = &pt
				} else if pt, err := time.Parse(time.RFC3339, p.PublishedAt); err == nil {
					pPub = &pt
				}
			}
			if pPub == nil {
				pPub = &defaultPublishedAt
			}
			if _, err := ipStore.ImportItem(ctx, tx, ipb, 1, pPub, actor); err != nil {
				return fmt.Errorf("import icon pack: %w", err)
			}
		}

		// 8. Banners
		for _, bnb := range rawBanners {
			if _, err := bannerStore.ImportItem(ctx, tx, bnb, 1, &defaultPublishedAt, actor); err != nil {
				return fmt.Errorf("import banner: %w", err)
			}
		}

		return nil
	})

	if err != nil {
		for _, f := range createdFiles {
			_ = os.Remove(f)
		}
		return nil, err
	}

	return &ImportResult{
		Festivals:     len(rawFestivals),
		Themes:        len(themeFiles),
		Wallpapers:    len(rawWallpapers),
		Fonts:         len(rawFonts),
		IconPacks:     len(rawIconPacks),
		Banners:       len(rawBanners),
		SkippedAssets: skippedAssets,
	}, nil
}

func RunExport(ctx context.Context, d *Deps) (*ExportBundle, error) {
	bundle := &ExportBundle{
		Festivals:  []json.RawMessage{},
		Themes:     []json.RawMessage{},
		Wallpapers: []json.RawMessage{},
		Fonts:      []json.RawMessage{},
		IconPacks:  []json.RawMessage{},
		Banners:    []json.RawMessage{},
	}

	// 1. Festivals (ordered by sort ASC, id ASC)
	var festRows []items.ItemRow
	if err := d.DB.NewSelect().Table("festivals").
		Where("status != ?", model.StatusArchived).
		Order("sort ASC", "id ASC").
		Column("data").
		Scan(ctx, &festRows); err != nil {
		return nil, err
	}
	for _, r := range festRows {
		bundle.Festivals = append(bundle.Festivals, json.RawMessage(r.Data))
	}

	// 2. Themes (full data, ordered by id ASC)
	var themeRows []items.ItemRow
	if err := d.DB.NewSelect().Table("themes").
		Where("status != ?", model.StatusArchived).
		Order("id ASC").
		Column("data").
		Scan(ctx, &themeRows); err != nil {
		return nil, err
	}
	for _, r := range themeRows {
		bundle.Themes = append(bundle.Themes, json.RawMessage(r.Data))
	}

	// 3. Wallpapers (ordered by id ASC)
	var wpRows []items.ItemRow
	if err := d.DB.NewSelect().Table("wallpapers").
		Where("status != ?", model.StatusArchived).
		Order("id ASC").
		Column("data").
		Scan(ctx, &wpRows); err != nil {
		return nil, err
	}
	for _, r := range wpRows {
		bundle.Wallpapers = append(bundle.Wallpapers, json.RawMessage(r.Data))
	}

	// 4. Fonts (ordered by id ASC)
	var fontRows []items.ItemRow
	if err := d.DB.NewSelect().Table("fonts").
		Where("status != ?", model.StatusArchived).
		Order("id ASC").
		Column("data").
		Scan(ctx, &fontRows); err != nil {
		return nil, err
	}
	for _, r := range fontRows {
		bundle.Fonts = append(bundle.Fonts, json.RawMessage(r.Data))
	}

	// 5. Icon packs (ordered by id ASC)
	var ipRows []items.ItemRow
	if err := d.DB.NewSelect().Table("icon_packs").
		Where("status != ?", model.StatusArchived).
		Order("id ASC").
		Column("data").
		Scan(ctx, &ipRows); err != nil {
		return nil, err
	}
	for _, r := range ipRows {
		bundle.IconPacks = append(bundle.IconPacks, json.RawMessage(r.Data))
	}

	// 6. Banners (ordered by sort ASC, id ASC)
	var bannerRows []items.ItemRow
	if err := d.DB.NewSelect().Table("banners").
		Where("status != ?", model.StatusArchived).
		Order("sort ASC", "id ASC").
		Column("data").
		Scan(ctx, &bannerRows); err != nil {
		return nil, err
	}
	for _, r := range bannerRows {
		bundle.Banners = append(bundle.Banners, json.RawMessage(r.Data))
	}

	// 7. Store settings
	var ss model.StoreSettings
	err := d.DB.NewSelect().Model(&ss).Where("id = 1").Scan(ctx)
	if err == nil {
		var ap catalog.AccentPresets
		if err := json.Unmarshal(ss.AccentPresets, &ap); err == nil {
			bundle.AccentPresets = &ap
		}
		var ssug []string
		if err := json.Unmarshal(ss.SearchSuggestions, &ssug); err == nil {
			bundle.SearchSuggestions = ssug
		}
	}
	if bundle.AccentPresets == nil {
		bundle.AccentPresets = &catalog.AccentPresets{
			Solids:    []catalog.Accent{},
			Gradients: []catalog.Accent{},
		}
	}
	if bundle.SearchSuggestions == nil {
		bundle.SearchSuggestions = []string{}
	}

	return bundle, nil
}

// insideDir reports whether p stays within dir.
func insideDir(dir, p string) bool {
	rel, err := filepath.Rel(dir, p)
	return err == nil && rel != ".." && !strings.HasPrefix(rel, ".."+string(filepath.Separator))
}

func isHidden(name string) bool { return strings.HasPrefix(filepath.Base(name), ".") }
