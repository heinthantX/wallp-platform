package api_test

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/heinthant/wallp-backend/internal/api"
	"github.com/heinthant/wallp-backend/internal/auth"
	"github.com/heinthant/wallp-backend/internal/config"
	"github.com/heinthant/wallp-backend/internal/db"
	"github.com/heinthant/wallp-backend/internal/server"

	"context"
	"os"
	"path/filepath"

	"github.com/uptrace/bun"
)

// minimalTTFBytes is a 12-byte minimal TrueType font stub (just the sfVersion = 0x00010000).
var minimalTTFBytes = []byte{0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00}

// makeGoogleFontsServer starts an httptest.Server that serves a mock Google Fonts metadata and TTF files.
// It returns the server and a URL to use for the metadata endpoint.
func makeGoogleFontsServer(t *testing.T, families []map[string]any, fontData []byte) *httptest.Server {
	t.Helper()
	mux := http.NewServeMux()

	// Metadata endpoint
	mux.HandleFunc("/metadata/fonts", func(w http.ResponseWriter, r *http.Request) {
		type entry struct {
			Family   string            `json:"family"`
			Category string            `json:"category"`
			Subsets  []string          `json:"subsets"`
			Variants []string          `json:"variants"`
			License  string            `json:"license,omitempty"`
			Files    map[string]string `json:"files,omitempty"`
		}
		var entries []entry
		for _, fm := range families {
			e := entry{
				Family:   fm["family"].(string),
				Category: fm["category"].(string),
			}
			if ss, ok := fm["subsets"].([]string); ok {
				e.Subsets = ss
			}
			if vv, ok := fm["variants"].([]string); ok {
				e.Variants = vv
			}
			if lic, ok := fm["license"].(string); ok {
				e.License = lic
			}
			if files, ok := fm["files"].(map[string]string); ok {
				e.Files = files
			}
			entries = append(entries, e)
		}
		type resp struct {
			FamilyMetadataList []entry `json:"familyMetadataList"`
		}
		_ = json.NewEncoder(w).Encode(resp{FamilyMetadataList: entries})
	})

	// Font download endpoint — serves the font binary directly.
	mux.HandleFunc("/download/list", func(w http.ResponseWriter, r *http.Request) {
		fd := fontData
		if fd == nil {
			fd = minimalTTFBytes
		}
		w.Header().Set("Content-Type", "application/octet-stream")
		_, _ = w.Write(fd)
	})

	// Also serve /font.ttf for direct file-URL tests.
	mux.HandleFunc("/font.ttf", func(w http.ResponseWriter, r *http.Request) {
		fd := fontData
		if fd == nil {
			fd = minimalTTFBytes
		}
		w.Header().Set("Content-Type", "application/octet-stream")
		_, _ = w.Write(fd)
	})

	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)
	return srv
}

// newServerWithGoogleFonts creates a testServer whose config points at the given httptest server URLs.
func newServerWithGoogleFonts(t *testing.T, metaURL, downloadURL string) *testServer {
	t.Helper()

	api.ResetGoogleFontsCache()

	ctx := context.Background()
	testDBURL := os.Getenv("TEST_DATABASE_URL")
	var bdb *bun.DB
	var err error
	if testDBURL != "" {
		bdb, err = db.Open(testDBURL)
		if err != nil {
			t.Fatalf("failed to open TEST_DATABASE_URL: %v", err)
		}
		if _, err := bdb.ExecContext(ctx, "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"); err != nil {
			t.Fatalf("failed to reset schema: %v", err)
		}
		if err := db.Migrate(ctx, bdb); err != nil {
			t.Fatalf("failed to migrate: %v", err)
		}
	} else {
		dbPath := filepath.Join(t.TempDir(), "gf-test.db")
		bdb, err = db.Open("file:" + dbPath)
		if err != nil {
			t.Fatalf("failed to open sqlite: %v", err)
		}
		if err := db.Migrate(ctx, bdb); err != nil {
			t.Fatalf("failed to migrate sqlite: %v", err)
		}
	}
	t.Cleanup(func() { _ = bdb.Close() })

	cfg := config.Config{
		Env:                    "test",
		JWTSecret:              "a-very-long-test-jwt-secret-with-more-than-32-characters!",
		AccessTokenTTL:         15 * time.Minute,
		RefreshTokenTTL:        720 * time.Hour,
		TOTPIssuer:             "wallp-test",
		CORSOrigins:            []string{"*"},
		AuthRateLimit:          1000,
		StorageDir:             filepath.Join(t.TempDir(), "storage"),
		GoogleFontsMetadataURL: metaURL,
		GoogleFontsDownloadURL: downloadURL,
	}
	authSvc := &auth.Service{
		DB:         bdb,
		Secret:     []byte(cfg.JWTSecret),
		AccessTTL:  cfg.AccessTokenTTL,
		RefreshTTL: cfg.RefreshTokenTTL,
		Issuer:     cfg.TOTPIssuer,
	}
	deps := &api.Deps{
		Cfg:  cfg,
		DB:   bdb,
		Auth: authSvc,
	}
	handler, _ := server.New(deps)
	srv := httptest.NewServer(handler)
	t.Cleanup(srv.Close)
	return &testServer{server: srv, db: bdb, deps: deps}
}

// TestGoogleFontsSearch verifies that the search endpoint maps fields correctly
// and returns the expected {family, category, subsets, variants}.
func TestGoogleFontsSearch(t *testing.T) {
	families := []map[string]any{
		{
			"family":   "Roboto",
			"category": "SANS_SERIF",
			"subsets":  []string{"latin", "latin-ext"},
			"variants": []string{"regular", "italic", "700"},
		},
		{
			"family":   "Dancing Script",
			"category": "HANDWRITING",
			"subsets":  []string{"latin"},
			"variants": []string{"regular", "700"},
		},
		{
			"family":   "Boogaloo",
			"category": "DISPLAY",
			"subsets":  []string{"latin"},
			"variants": []string{"regular"},
		},
	}
	fontSrv := makeGoogleFontsServer(t, families, minimalTTFBytes)
	s := newServerWithGoogleFonts(t, fontSrv.URL+"/metadata/fonts", fontSrv.URL+"/download/list")
	toks := setupRoleUsers(t, s)

	search := func(q string) []gfSearchResult {
		t.Helper()
		st, raw := s.doRaw(t, "GET", "/admin/v1/fonts/google"+q, toks.admin, nil, nil)
		if st != http.StatusOK {
			t.Fatalf("search %q: expected 200, got %d %s", q, st, raw)
		}
		var out []gfSearchResult
		if err := json.Unmarshal(raw, &out); err != nil {
			t.Fatalf("search %q: bad body %s: %v", q, raw, err)
		}
		return out
	}

	if all := search(""); len(all) != len(families) {
		t.Fatalf("expected %d results with no q, got %d", len(families), len(all))
	}
	rob := search("?q=roboto")
	if len(rob) != 1 || rob[0].Family != "Roboto" || rob[0].Category != "clean" ||
		len(rob[0].Subsets) == 0 || len(rob[0].Variants) == 0 {
		t.Fatalf("unexpected roboto result: %+v", rob)
	}
	if d := search("?q=dancing"); len(d) != 1 || d[0].Category != "handwritten" {
		t.Fatalf("expected handwritten, got %+v", d)
	}
	if d := search("?q=boogaloo"); len(d) != 1 || d[0].Category != "display" {
		t.Fatalf("expected display, got %+v", d)
	}
}

type gfSearchResult struct {
	Family   string   `json:"family"`
	Category string   `json:"category"`
	Subsets  []string `json:"subsets"`
	Variants []string `json:"variants"`
}

// TestGoogleFontsSearchCache verifies that a second call does not hit the server again.
func TestGoogleFontsSearchCache(t *testing.T) {
	hitCount := 0
	mux := http.NewServeMux()
	mux.HandleFunc("/metadata/fonts", func(w http.ResponseWriter, r *http.Request) {
		hitCount++
		type entry struct {
			Family   string   `json:"family"`
			Category string   `json:"category"`
			Subsets  []string `json:"subsets"`
			Variants []string `json:"variants"`
		}
		type resp struct {
			FamilyMetadataList []entry `json:"familyMetadataList"`
		}
		_ = json.NewEncoder(w).Encode(resp{
			FamilyMetadataList: []entry{
				{Family: "Roboto", Category: "SANS_SERIF", Subsets: []string{"latin"}, Variants: []string{"regular"}},
			},
		})
	})
	fontSrv := httptest.NewServer(mux)
	t.Cleanup(fontSrv.Close)

	api.ResetGoogleFontsCache()

	s := newServerWithGoogleFonts(t, fontSrv.URL+"/metadata/fonts", fontSrv.URL+"/download/list")
	toks := setupRoleUsers(t, s)

	// First call
	status, _ := s.do(t, "GET", "/admin/v1/fonts/google?q=roboto", toks.admin, nil)
	if status != 200 {
		t.Fatalf("first search failed: %d", status)
	}
	if hitCount != 1 {
		t.Fatalf("expected 1 server hit after first search, got %d", hitCount)
	}

	// Second call — must NOT hit the server again (cache hit)
	status, _ = s.do(t, "GET", "/admin/v1/fonts/google?q=roboto", toks.admin, nil)
	if status != 200 {
		t.Fatalf("second search failed: %d", status)
	}
	if hitCount != 1 {
		t.Fatalf("expected still 1 server hit after second search (cache), got %d", hitCount)
	}
}

// TestGoogleFontsImport verifies that the import endpoint:
//   - downloads TTF files, creates assets, creates a draft font item with license OFL-1.1,
//     correct category mapping, scripts from subsets.
func TestGoogleFontsImport(t *testing.T) {
	families := []map[string]any{
		{
			"family":   "Roboto",
			"category": "SANS_SERIF",
			"subsets":  []string{"latin", "latin-ext"},
			"variants": []string{"regular", "700"},
			"license":  "OFL-1.1",
		},
		{
			"family":   "Noto Sans Myanmar",
			"category": "SANS_SERIF",
			"subsets":  []string{"myanmar", "latin"},
			"variants": []string{"regular"},
			"license":  "OFL-1.1",
		},
	}
	fontSrv := makeGoogleFontsServer(t, families, minimalTTFBytes)
	s := newServerWithGoogleFonts(t, fontSrv.URL+"/metadata/fonts", fontSrv.URL+"/download/list")
	toks := setupRoleUsers(t, s)

	// Import Roboto
	status, body := s.do(t, "POST", "/admin/v1/fonts/google/import", toks.admin, map[string]any{
		"family":   "Roboto",
		"variants": []string{"regular"},
	})
	if status != http.StatusCreated {
		t.Fatalf("import Roboto failed: status=%d body=%v", status, body)
	}

	// Check returned item
	if body["id"] != "roboto" {
		t.Fatalf("expected id=roboto, got %v", body["id"])
	}
	if body["status"] != "draft" {
		t.Fatalf("expected status=draft, got %v", body["status"])
	}

	// Parse the data field to verify internals
	dataRaw, _ := json.Marshal(body["data"])
	var fontData map[string]any
	_ = json.Unmarshal(dataRaw, &fontData)
	if fontData == nil {
		// data might be nested in the body differently; try body itself
		fontData = body
	}
	if lic, _ := fontData["license"].(string); lic != "OFL-1.1" {
		t.Fatalf("expected license OFL-1.1, got %q", lic)
	}
	if cat, _ := fontData["category"].(string); cat != "clean" {
		t.Fatalf("expected category clean for SANS_SERIF, got %q", cat)
	}
	if scripts, _ := fontData["scripts"].([]any); len(scripts) == 0 {
		t.Fatalf("expected non-empty scripts, got %v", fontData["scripts"])
	}
	if files, _ := fontData["files"].([]any); len(files) == 0 {
		t.Fatalf("expected at least one font file, got %v", fontData["files"])
	}

	// Import Myanmar font → category should be "myanmar"
	status, body = s.do(t, "POST", "/admin/v1/fonts/google/import", toks.admin, map[string]any{
		"family":   "Noto Sans Myanmar",
		"variants": []string{"regular"},
	})
	if status != http.StatusCreated {
		t.Fatalf("import Myanmar failed: status=%d body=%v", status, body)
	}
	dataRaw, _ = json.Marshal(body["data"])
	var myanmarData map[string]any
	_ = json.Unmarshal(dataRaw, &myanmarData)
	if myanmarData == nil {
		myanmarData = body
	}
	if cat, _ := myanmarData["category"].(string); cat != "myanmar" {
		t.Fatalf("expected category myanmar for myanmar subset, got %q", cat)
	}
	// Scripts should include "myanmar"
	scriptsRaw, _ := myanmarData["scripts"].([]any)
	hasMyanmarScript := false
	for _, sc := range scriptsRaw {
		if sc.(string) == "myanmar" {
			hasMyanmarScript = true
		}
	}
	if !hasMyanmarScript {
		t.Fatalf("expected myanmar in scripts, got %v", scriptsRaw)
	}
}

// TestGoogleFontsImportDisallowedHost verifies that a font URL pointing to a non-allowlisted host is rejected.
func TestGoogleFontsImportDisallowedHost(t *testing.T) {
	// We serve metadata that points directly to an external (disallowed) host for the file.
	families := []map[string]any{
		{
			"family":   "EvilFont",
			"category": "SANS_SERIF",
			"subsets":  []string{"latin"},
			"variants": []string{"regular"},
			"license":  "OFL-1.1",
			"files":    map[string]string{"regular": "https://evil.example.com/font.ttf"},
		},
	}
	fontSrv := makeGoogleFontsServer(t, families, minimalTTFBytes)
	s := newServerWithGoogleFonts(t, fontSrv.URL+"/metadata/fonts", fontSrv.URL+"/download/list")
	toks := setupRoleUsers(t, s)

	status, body := s.do(t, "POST", "/admin/v1/fonts/google/import", toks.admin, map[string]any{
		"family":   "EvilFont",
		"variants": []string{"regular"},
	})
	// Should get 502 (disallowed host)
	if status != http.StatusBadGateway {
		t.Fatalf("expected 502 for disallowed host, got %d %v", status, body)
	}
	errObj, _ := body["error"].(map[string]any)
	if errObj == nil || errObj["code"] != "disallowed_host" {
		t.Fatalf("expected error code disallowed_host, got %v", body)
	}
}

// TestGoogleFontsImportOversizeFile verifies that a font file exceeding 10 MB is rejected with 422 font_too_large.
func TestGoogleFontsImportOversizeFile(t *testing.T) {
	// Build a TTF-like blob that is > 10 MB.
	bigFont := make([]byte, 10*1024*1024+2)
	// Put a valid TrueType magic at offset 0 so it's recognised as a font binary.
	bigFont[0] = 0x00
	bigFont[1] = 0x01
	bigFont[2] = 0x00
	bigFont[3] = 0x00

	families := []map[string]any{
		{
			"family":   "HugeFont",
			"category": "SANS_SERIF",
			"subsets":  []string{"latin"},
			"variants": []string{"regular"},
			"license":  "OFL-1.1",
		},
	}
	fontSrv := makeGoogleFontsServer(t, families, bigFont)
	s := newServerWithGoogleFonts(t, fontSrv.URL+"/metadata/fonts", fontSrv.URL+"/download/list")
	toks := setupRoleUsers(t, s)

	status, body := s.do(t, "POST", "/admin/v1/fonts/google/import", toks.admin, map[string]any{
		"family":   "HugeFont",
		"variants": []string{"regular"},
	})
	if status != http.StatusUnprocessableEntity {
		t.Fatalf("expected 422 for oversize font, got %d %v", status, body)
	}
	errObj, _ := body["error"].(map[string]any)
	if errObj == nil || errObj["code"] != "font_too_large" {
		t.Fatalf("expected error code font_too_large, got %v", body)
	}
}

// TestGoogleFontsImportViewerForbidden verifies that a viewer cannot import fonts.
func TestGoogleFontsImportViewerForbidden(t *testing.T) {
	families := []map[string]any{
		{
			"family":   "Roboto",
			"category": "SANS_SERIF",
			"subsets":  []string{"latin"},
			"variants": []string{"regular"},
			"license":  "OFL-1.1",
		},
	}
	fontSrv := makeGoogleFontsServer(t, families, minimalTTFBytes)
	s := newServerWithGoogleFonts(t, fontSrv.URL+"/metadata/fonts", fontSrv.URL+"/download/list")
	toks := setupRoleUsers(t, s)

	status, body := s.do(t, "POST", "/admin/v1/fonts/google/import", toks.viewer, map[string]any{
		"family":   "Roboto",
		"variants": []string{"regular"},
	})
	if status != http.StatusForbidden {
		t.Fatalf("expected 403 for viewer import, got %d %v", status, body)
	}
}

// TestGoogleFontsImportInvalidLicense verifies that importing a font with an invalid license
// returns 422 with field "license".
func TestGoogleFontsImportInvalidLicense(t *testing.T) {
	families := []map[string]any{
		{
			"family":   "GPLFont",
			"category": "SANS_SERIF",
			"subsets":  []string{"latin"},
			"variants": []string{"regular"},
			"license":  "GPL-3.0",
		},
	}
	fontSrv := makeGoogleFontsServer(t, families, minimalTTFBytes)
	s := newServerWithGoogleFonts(t, fontSrv.URL+"/metadata/fonts", fontSrv.URL+"/download/list")
	toks := setupRoleUsers(t, s)

	status, body := s.do(t, "POST", "/admin/v1/fonts/google/import", toks.admin, map[string]any{
		"family":   "GPLFont",
		"variants": []string{"regular"},
	})
	if status != http.StatusUnprocessableEntity {
		t.Fatalf("expected 422 for invalid license, got %d %v", status, body)
	}
	errObj, _ := body["error"].(map[string]any)
	if errObj == nil {
		t.Fatalf("expected error object, got %v", body)
	}
	if errObj["field"] != "license" {
		t.Fatalf("expected field=license, got %v", errObj["field"])
	}
}

// TestGoogleFontsImportApacheLicense verifies that Apache-2.0 license fonts can be imported.
func TestGoogleFontsImportApacheLicense(t *testing.T) {
	families := []map[string]any{
		{
			"family":   "Roboto Apache",
			"category": "SANS_SERIF",
			"subsets":  []string{"latin"},
			"variants": []string{"regular"},
			"license":  "Apache",
		},
	}
	fontSrv := makeGoogleFontsServer(t, families, minimalTTFBytes)
	s := newServerWithGoogleFonts(t, fontSrv.URL+"/metadata/fonts", fontSrv.URL+"/download/list")
	toks := setupRoleUsers(t, s)

	status, body := s.do(t, "POST", "/admin/v1/fonts/google/import", toks.admin, map[string]any{
		"family":   "Roboto Apache",
		"variants": []string{"regular"},
	})
	if status != http.StatusCreated {
		t.Fatalf("expected 201 for Apache-2.0 license import, got %d %v", status, body)
	}
	dataRaw, _ := json.Marshal(body["data"])
	var fd map[string]any
	_ = json.Unmarshal(dataRaw, &fd)
	if fd == nil {
		fd = body
	}
	if lic, _ := fd["license"].(string); lic != "Apache-2.0" {
		t.Fatalf("expected license Apache-2.0, got %q", lic)
	}
}

// TestGoogleFontsImportHTTPSOnly verifies that a direct file URL with http:// scheme is rejected.
func TestGoogleFontsImportHTTPSOnly(t *testing.T) {
	families := []map[string]any{
		{
			"family":   "HttpFont",
			"category": "SANS_SERIF",
			"subsets":  []string{"latin"},
			"variants": []string{"regular"},
			"license":  "OFL-1.1",
			// http:// URL to fonts.gstatic.com — https enforcement should block it.
			"files": map[string]string{"regular": "http://fonts.gstatic.com/font.ttf"},
		},
	}
	fontSrv := makeGoogleFontsServer(t, families, minimalTTFBytes)
	s := newServerWithGoogleFonts(t, fontSrv.URL+"/metadata/fonts", fontSrv.URL+"/download/list")
	toks := setupRoleUsers(t, s)

	status, body := s.do(t, "POST", "/admin/v1/fonts/google/import", toks.admin, map[string]any{
		"family":   "HttpFont",
		"variants": []string{"regular"},
	})
	// fonts.gstatic.com is in the permanent allowlist but http:// scheme is not https.
	if status != http.StatusBadGateway {
		t.Fatalf("expected 502 for http:// scheme to allowlisted host, got %d %v", status, body)
	}
	errObj, _ := body["error"].(map[string]any)
	if errObj == nil || errObj["code"] != "disallowed_host" {
		t.Fatalf("expected error code disallowed_host, got %v", body)
	}
}

// TestGoogleFontsNotFound verifies that importing a family not in the metadata returns 404.
func TestGoogleFontsNotFound(t *testing.T) {
	families := []map[string]any{
		{
			"family":   "Roboto",
			"category": "SANS_SERIF",
			"subsets":  []string{"latin"},
			"variants": []string{"regular"},
			"license":  "OFL-1.1",
		},
	}
	fontSrv := makeGoogleFontsServer(t, families, minimalTTFBytes)
	s := newServerWithGoogleFonts(t, fontSrv.URL+"/metadata/fonts", fontSrv.URL+"/download/list")
	toks := setupRoleUsers(t, s)

	status, body := s.do(t, "POST", "/admin/v1/fonts/google/import", toks.admin, map[string]any{
		"family": "NoSuchFont",
	})
	if status != http.StatusNotFound {
		t.Fatalf("expected 404 for unknown family, got %d %v", status, body)
	}
}

// setupRoleUsersForGF is an alias that reuses the common helper in catalog_items_test.go.
// We use the generic setupRoleUsers already defined in that file (same package).
// This file only needs the local helpers above.

// Ensure the test function names are non-trivial and do not collide.
var _ = fmt.Sprintf // keep fmt imported
var _ = strings.NewReader

// TestGoogleFontsImportRealManifest mirrors fonts.google.com/download/list as served in 2026: an anti-XSSI
// `)]}'` prefix, licence text inline in manifest.files and font URLs in manifest.fileRefs (loop-2 P1 B7).
func TestGoogleFontsImportRealManifest(t *testing.T) {
	families := []map[string]any{{
		"family": "Lobster", "category": "DISPLAY", "subsets": []string{"latin"},
		"variants": []string{"regular", "700"}, "license": "OFL-1.1",
	}}
	meta := makeGoogleFontsServer(t, families, nil)
	served := map[string]int{}
	mux := http.NewServeMux()
	var base string
	mux.HandleFunc("/download/list", func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(")]}'\n" + `{"zipName":"Lobster.zip","manifest":{"files":[{"filename":"OFL.txt","contents":"Copyright"}],` +
			`"fileRefs":[{"filename":"Lobster-Regular.ttf","url":"` + base + `/s/regular.ttf"},{"filename":"Lobster-Bold.ttf","url":"` + base + `/s/bold.ttf"}]}}`))
	})
	mux.HandleFunc("/s/", func(w http.ResponseWriter, r *http.Request) {
		served[r.URL.Path]++
		_, _ = w.Write(minimalTTFBytes)
	})
	dl := httptest.NewServer(mux)
	t.Cleanup(dl.Close)
	base = dl.URL

	// Metadata and downloads come from different test hosts in this test; only the download host is allowlisted.
	s := newServerWithGoogleFonts(t, meta.URL+"/metadata/fonts", dl.URL+"/download/list")
	_ = s
	toks := setupRoleUsers(t, s)
	status, body := s.do(t, "POST", "/admin/v1/fonts/google/import", toks.admin, map[string]any{
		"family": "Lobster", "variants": []string{"regular", "700"},
	})
	if status != http.StatusCreated {
		t.Fatalf("import Lobster: status=%d body=%v", status, body)
	}
	if served["/s/regular.ttf"] != 1 || served["/s/bold.ttf"] != 1 {
		t.Fatalf("expected one download per variant from fileRefs, got %v", served)
	}
}
