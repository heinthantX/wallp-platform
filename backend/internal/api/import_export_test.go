package api_test

import (
	"bytes"
	"encoding/json"
	"mime/multipart"
	"net/http"
	"os"
	"path/filepath"
	"reflect"
	"testing"

	"github.com/heinthant/wallp-backend/internal/api"
	"github.com/heinthant/wallp-backend/internal/model"
)

const mockCatalogDir = "/Users/heinthant/Development/wallp/wallp/assets/mock/catalog/v1"

func semanticJSONEqual(t *testing.T, a, b []byte) bool {
	t.Helper()
	var v1, v2 any
	if err := json.Unmarshal(a, &v1); err != nil {
		t.Fatalf("failed to unmarshal JSON a: %v\nJSON: %s", err, string(a))
	}
	if err := json.Unmarshal(b, &v2); err != nil {
		t.Fatalf("failed to unmarshal JSON b: %v\nJSON: %s", err, string(b))
	}
	return reflect.DeepEqual(v1, v2)
}

func TestImportExport(t *testing.T) {
	if _, err := os.Stat(mockCatalogDir); os.IsNotExist(err) {
		t.Skipf("mock catalog directory not found at %s, skipping test", mockCatalogDir)
	}

	s := newServer(t)
	toks := setupRoleUsers(t, s)

	// 1. Viewer role calling import -> 403 Forbidden
	t.Run("ViewerForbidden", func(t *testing.T) {
		status, _ := s.do(t, "POST", "/admin/v1/import", toks.viewer, map[string]any{
			"dir": mockCatalogDir,
		})
		if status != http.StatusForbidden {
			t.Fatalf("expected 403 for viewer import, got %d", status)
		}
	})

	// 2. Production env with dir -> 403 Forbidden
	t.Run("ProductionEnvDirForbidden", func(t *testing.T) {
		origEnv := s.deps.Cfg.Env
		s.deps.Cfg.Env = "production"
		defer func() { s.deps.Cfg.Env = origEnv }()

		status, _ := s.do(t, "POST", "/admin/v1/import", toks.admin, map[string]any{
			"dir": mockCatalogDir,
		})
		if status != http.StatusForbidden {
			t.Fatalf("expected 403 for production dir import, got %d", status)
		}
	})

	// 3. First import: counts 5 festivals, 5 themes, 6 wallpapers, 8 fonts, 5 icon packs, 6 banners
	t.Run("ImportMockCatalog", func(t *testing.T) {
		status, body := s.do(t, "POST", "/admin/v1/import", toks.admin, map[string]any{
			"dir": mockCatalogDir,
		})
		if status != http.StatusOK {
			t.Fatalf("expected 200 on import, got %d; body: %v", status, body)
		}

		counts := map[string]int{
			"festivals":  5,
			"themes":     5,
			"wallpapers": 6,
			"fonts":      8,
			"iconPacks":  5,
			"banners":    6,
		}

		for k, expected := range counts {
			val, ok := body[k]
			if !ok {
				t.Fatalf("missing key %q in import response: %v", k, body)
			}
			if int(val.(float64)) != expected {
				t.Fatalf("count mismatch for %s: expected %d, got %v", k, expected, val)
			}
		}

		// Also verify via counts field
		countsMap, ok := body["counts"].(map[string]any)
		if ok {
			for k, expected := range counts {
				if int(countsMap[k].(float64)) != expected {
					t.Fatalf("nested counts mismatch for %s: expected %d, got %v", k, expected, countsMap[k])
				}
			}
		}
	})

	// 4. For each theme: GET /admin/v1/themes/{id}/export JSON-equals themes/<id>.<rev>.json
	t.Run("ThemeExportEqualsFiles", func(t *testing.T) {
		themesDir := filepath.Join(mockCatalogDir, "themes")
		entries, err := os.ReadDir(themesDir)
		if err != nil {
			t.Fatalf("failed to read themes dir: %v", err)
		}

		for _, e := range entries {
			if e.IsDir() || filepath.Ext(e.Name()) != ".json" {
				continue
			}
			filePath := filepath.Join(themesDir, e.Name())
			fileBytes, err := os.ReadFile(filePath)
			if err != nil {
				t.Fatalf("failed to read theme file %s: %v", e.Name(), err)
			}

			var themeObj map[string]any
			if err := json.Unmarshal(fileBytes, &themeObj); err != nil {
				t.Fatalf("failed to parse theme file %s: %v", e.Name(), err)
			}
			themeID := themeObj["id"].(string)

			status, respBytes := s.doRaw(t, "GET", "/admin/v1/themes/"+themeID+"/export", toks.admin, nil, nil)
			if status != http.StatusOK {
				t.Fatalf("GET /themes/%s/export returned status %d", themeID, status)
			}

			if !semanticJSONEqual(t, fileBytes, respBytes) {
				t.Fatalf("theme %s export does not semantically match file %s", themeID, e.Name())
			}
		}
	})

	// 5. Export bundle festivals JSON-equal the catalog's festivals
	t.Run("ExportBundleFestivalsEqualsCatalog", func(t *testing.T) {
		status, exportResp := s.doRaw(t, "GET", "/admin/v1/export", toks.admin, nil, nil)
		if status != http.StatusOK {
			t.Fatalf("GET /admin/v1/export returned status %d", status)
		}

		var bundle struct {
			Festivals []json.RawMessage `json:"festivals"`
		}
		if err := json.Unmarshal(exportResp, &bundle); err != nil {
			t.Fatalf("failed to unmarshal export bundle: %v", err)
		}

		// Find catalog file in mock dir
		matches, err := filepath.Glob(filepath.Join(mockCatalogDir, "catalog*.json"))
		if err != nil || len(matches) == 0 {
			t.Fatalf("catalog JSON file not found in mock dir: %v", err)
		}
		catBytes, err := os.ReadFile(matches[0])
		if err != nil {
			t.Fatalf("failed to read catalog file: %v", err)
		}

		var catObj struct {
			Festivals []json.RawMessage `json:"festivals"`
		}
		if err := json.Unmarshal(catBytes, &catObj); err != nil {
			t.Fatalf("failed to unmarshal catalog file: %v", err)
		}

		bundleFestivalsJSON, _ := json.Marshal(bundle.Festivals)
		catFestivalsJSON, _ := json.Marshal(catObj.Festivals)

		if !semanticJSONEqual(t, catFestivalsJSON, bundleFestivalsJSON) {
			t.Fatalf("export bundle festivals do not semantically match catalog festivals")
		}
	})

	// 6. Second import keeps counts (idempotent upsert)
	t.Run("SecondImportKeepsCounts", func(t *testing.T) {
		status, body := s.do(t, "POST", "/admin/v1/import", toks.admin, map[string]any{
			"dir": mockCatalogDir,
		})
		if status != http.StatusOK {
			t.Fatalf("expected 200 on second import, got %d", status)
		}

		counts := map[string]int{
			"festivals":  5,
			"themes":     5,
			"wallpapers": 6,
			"fonts":      8,
			"iconPacks":  5,
			"banners":    6,
		}

		for k, expected := range counts {
			val := int(body[k].(float64))
			if val != expected {
				t.Fatalf("count mismatch on second import for %s: expected %d, got %d", k, expected, val)
			}
		}

		// Verify database row counts directly
		tables := map[string]int{
			"festivals":  5,
			"themes":     5,
			"wallpapers": 6,
			"fonts":      8,
			"icon_packs": 5,
			"banners":    6,
		}
		for table, expected := range tables {
			cnt, err := s.db.NewSelect().Table(table).Where("status != ?", model.StatusArchived).Count(t.Context())
			if err != nil {
				t.Fatalf("failed to count rows in %s: %v", table, err)
			}
			if int(cnt) != expected {
				t.Fatalf("database row count mismatch for %s: expected %d, got %d", table, expected, cnt)
			}
		}
	})

	// 7. Direct RunImportDir call (same logic as CLI wallp import --dir)
	t.Run("RunImportDirDirectly", func(t *testing.T) {
		res, err := api.RunImportDir(t.Context(), s.deps, mockCatalogDir, "cli")
		if err != nil {
			t.Fatalf("RunImportDir failed: %v", err)
		}
		if res.Festivals != 5 || res.Themes != 5 || res.Wallpapers != 6 || res.Fonts != 8 || res.IconPacks != 5 || res.Banners != 6 {
			t.Fatalf("unexpected counts from RunImportDir: %+v", res)
		}

		// Invalid directory
		_, err = api.RunImportDir(t.Context(), s.deps, "/nonexistent/path/for/import", "cli")
		if err == nil {
			t.Fatal("expected error for nonexistent directory")
		}
	})

	// 8. Multipart import
	t.Run("MultipartImport", func(t *testing.T) {
		var buf bytes.Buffer
		mw := multipart.NewWriter(&buf)

		// Catalog file
		matches, err := filepath.Glob(filepath.Join(mockCatalogDir, "catalog*.json"))
		if err != nil || len(matches) == 0 {
			t.Fatalf("catalog JSON file not found in mock dir")
		}
		catBytes, err := os.ReadFile(matches[0])
		if err != nil {
			t.Fatalf("failed to read catalog file: %v", err)
		}
		part, err := mw.CreateFormFile("catalog", filepath.Base(matches[0]))
		if err != nil {
			t.Fatalf("create form file catalog: %v", err)
		}
		if _, err := part.Write(catBytes); err != nil {
			t.Fatalf("write catalog bytes: %v", err)
		}

		// Themes
		themesDir := filepath.Join(mockCatalogDir, "themes")
		entries, _ := os.ReadDir(themesDir)
		for _, e := range entries {
			if e.IsDir() || filepath.Ext(e.Name()) != ".json" {
				continue
			}
			tb, _ := os.ReadFile(filepath.Join(themesDir, e.Name()))
			tp, err := mw.CreateFormFile("themes[]", e.Name())
			if err != nil {
				t.Fatalf("create form file theme %s: %v", e.Name(), err)
			}
			_, _ = tp.Write(tb)
		}

		// Assets
		assetsDir := filepath.Join(mockCatalogDir, "assets")
		if aEntries, err := os.ReadDir(assetsDir); err == nil {
			for _, ae := range aEntries {
				if ae.IsDir() {
					continue
				}
				ab, _ := os.ReadFile(filepath.Join(assetsDir, ae.Name()))
				ap, err := mw.CreateFormFile("assets[]", ae.Name())
				if err != nil {
					t.Fatalf("create form file asset %s: %v", ae.Name(), err)
				}
				_, _ = ap.Write(ab)
			}
		}

		if err := mw.Close(); err != nil {
			t.Fatalf("close multipart writer: %v", err)
		}

		status, body := s.doWithHeaders(t, "POST", "/admin/v1/import", toks.admin, buf.Bytes(), map[string]string{
			"Content-Type": mw.FormDataContentType(),
		})
		if status != http.StatusOK {
			t.Fatalf("expected 200 on multipart import, got %d; body: %v", status, body)
		}
	})

	// 9. The export bundle imports back on its own, themes included.
	t.Run("ExportBundleRoundTrip", func(t *testing.T) {
		status, exportResp := s.doRaw(t, "GET", "/admin/v1/export", toks.admin, nil, nil)
		if status != http.StatusOK {
			t.Fatalf("GET /admin/v1/export returned status %d", status)
		}
		var bundle struct {
			Themes []json.RawMessage `json:"themes"`
		}
		if err := json.Unmarshal(exportResp, &bundle); err != nil {
			t.Fatalf("unmarshal export bundle: %v", err)
		}
		if len(bundle.Themes) == 0 {
			t.Fatal("export bundle has no themes")
		}

		var buf bytes.Buffer
		mw := multipart.NewWriter(&buf)
		part, _ := mw.CreateFormFile("catalog", "catalog.json")
		_, _ = part.Write(exportResp)
		_ = mw.Close()
		status, body := s.doWithHeaders(t, "POST", "/admin/v1/import", toks.admin, buf.Bytes(), map[string]string{
			"Content-Type": mw.FormDataContentType(),
		})
		if status != http.StatusOK {
			t.Fatalf("expected 200 importing the export bundle, got %d; body: %v", status, body)
		}
		if got := body["themes"]; got != float64(len(bundle.Themes)) {
			t.Fatalf("imported themes = %v, want %d", got, len(bundle.Themes))
		}
	})

	// 10. B15: export is a backup — a draft stays a draft after export → import.
	t.Run("ExportKeepsDraftStatus", func(t *testing.T) {
		status, body := s.do(t, "POST", "/admin/v1/banners", toks.admin, map[string]any{
			"id": "draft-banner", "title": map[string]any{"en": "Draft"}, "subtitle": map[string]any{"en": "x"},
			"tag": map[string]any{"en": "x"}, "cta": map[string]any{"en": "x"},
			"action": map[string]any{"type": "store"},
			"look":   map[string]any{"background": "#000000", "accent": "#FFFFFF", "titleColor": "#FFFFFF", "font": "creepster"},
		})
		if status != http.StatusCreated && status != http.StatusOK {
			t.Fatalf("create draft banner: %d %v", status, body)
		}
		status, exportResp := s.doRaw(t, "GET", "/admin/v1/export", toks.admin, nil, nil)
		if status != http.StatusOK {
			t.Fatalf("export: %d", status)
		}
		var buf bytes.Buffer
		mw := multipart.NewWriter(&buf)
		part, _ := mw.CreateFormFile("catalog", "catalog.json")
		_, _ = part.Write(exportResp)
		_ = mw.Close()
		status, body = s.doWithHeaders(t, "POST", "/admin/v1/import", toks.admin, buf.Bytes(), map[string]string{
			"Content-Type": mw.FormDataContentType(),
		})
		if status != http.StatusOK {
			t.Fatalf("import: %d %v", status, body)
		}
		status, item := s.do(t, "GET", "/admin/v1/banners/draft-banner", toks.admin, nil)
		if status != http.StatusOK || item["status"] != "draft" {
			t.Fatalf("draft-banner after round trip: %d status=%v", status, item["status"])
		}
		if item["firstPublishedAt"] != nil {
			t.Fatalf("draft-banner got firstPublishedAt %v", item["firstPublishedAt"])
		}
	})
}
