package api_test

import (
	"encoding/json"
	"net/http"
	"testing"

	"github.com/heinthant/wallp-backend/internal/api"
	"github.com/heinthant/wallp-backend/internal/catalog"
)

func TestCategoriesLifecycleAndRefs(t *testing.T) {
	s := importedServer(t)
	toks := setupRoleUsers(t, s)

	// 1. Create a category via admin API
	catPayload := map[string]any{
		"id":   "anime",
		"name": map[string]string{"en": "Anime", "my": "အန်နီမေး"},
		"sort": 10,
		"tags": []string{"japanese", "art"},
	}
	status, body := s.do(t, "POST", "/admin/v1/categories", toks.designer, catPayload)
	if status != http.StatusCreated {
		t.Fatalf("create category: status %d %v", status, body)
	}
	if body["id"] != "anime" || body["status"] != "draft" {
		t.Fatalf("unexpected category body: %v", body)
	}

	// Create a second category to test reordering
	naturePayload := map[string]any{
		"id":   "nature",
		"name": map[string]string{"en": "Nature"},
		"sort": 20,
	}
	if st, b := s.do(t, "POST", "/admin/v1/categories", toks.designer, naturePayload); st != http.StatusCreated {
		t.Fatalf("create nature category: status %d %v", st, b)
	}

	// Test reorder categories
	st, _ := s.do(t, "PUT", "/admin/v1/categories/order", toks.admin, map[string]any{
		"ids": []string{"nature", "anime"},
	})
	if st != http.StatusOK {
		t.Fatalf("reorder categories: status %d", st)
	}

	// List categories
	st, listBody := s.do(t, "GET", "/admin/v1/categories", toks.viewer, nil)
	if st != http.StatusOK {
		t.Fatalf("list categories: status %d", st)
	}
	itemsList, ok := listBody["items"].([]any)
	if !ok || len(itemsList) < 2 {
		t.Fatalf("list categories items: %v", listBody)
	}

	// Approve both categories so they can be published
	reviewItem(t, s, toks, "/admin/v1/categories", "anime")
	reviewItem(t, s, toks, "/admin/v1/categories", "nature")

	// 2 & 3. Set categoryIds and verify checks report ref_missing for unknown category id
	// Test theme with unknown category
	mutate(t, s, "themes", "christmas-eve", func(m map[string]any) {
		m["categoryIds"] = []any{"unknown-category-id"}
	})
	rep := runChecks(t, s)
	if !has(rep.Errors, "ref_missing", "christmas-eve") {
		t.Fatalf("expected ref_missing error for theme christmas-eve, got: %+v", rep.Errors)
	}

	// Restore valid category on theme and set unknown category on wallpaper
	mutate(t, s, "themes", "christmas-eve", func(m map[string]any) {
		m["categoryIds"] = []any{"anime", "nature"}
	})
	mutate(t, s, "wallpapers", "silent-night", func(m map[string]any) {
		m["categoryIds"] = []any{"unknown-wallpaper-cat"}
	})
	rep = runChecks(t, s)
	if !has(rep.Errors, "ref_missing", "silent-night") {
		t.Fatalf("expected ref_missing error for wallpaper silent-night, got: %+v", rep.Errors)
	}

	// Set valid categoryIds on wallpaper
	mutate(t, s, "wallpapers", "silent-night", func(m map[string]any) {
		m["categoryIds"] = []any{"anime"}
	})

	// Validation checks should now be clear of ref_missing
	rep = runChecks(t, s)
	if has(rep.Errors, "ref_missing", "christmas-eve") || has(rep.Errors, "ref_missing", "silent-night") {
		t.Fatalf("unexpected ref_missing errors after fixing categories: %+v", rep.Errors)
	}

	// 4. Publish then GET the public catalog includes categories and theme summary categoryIds
	st, pubBody := publish(t, s, toks.admin, map[string]any{"ackWarnings": true})
	if st != http.StatusCreated {
		t.Fatalf("publish release failed: status %d %v", st, pubBody)
	}

	m := manifestOf(t, s)
	catalogFile, ok := m["catalog"].(string)
	if !ok || catalogFile == "" {
		t.Fatalf("manifest missing catalog filename: %v", m)
	}

	getCatStatus, catBytes := getPublic(t, s, "/catalog/v1/"+catalogFile)
	if getCatStatus != http.StatusOK {
		t.Fatalf("get catalog: status %d", getCatStatus)
	}

	var pubCatalog catalog.Catalog
	if err := json.Unmarshal(catBytes, &pubCatalog); err != nil {
		t.Fatalf("unmarshal public catalog: %v", err)
	}

	if len(pubCatalog.Categories) < 2 {
		t.Fatalf("expected at least 2 categories in public catalog, got %d", len(pubCatalog.Categories))
	}
	foundAnimeCat := false
	for _, c := range pubCatalog.Categories {
		if c.ID == "anime" {
			foundAnimeCat = true
			if c.Name["en"] != "Anime" {
				t.Fatalf("category anime name.en expected 'Anime', got %q", c.Name["en"])
			}
		}
	}
	if !foundAnimeCat {
		t.Fatalf("published catalog missing 'anime' category: %+v", pubCatalog.Categories)
	}

	foundTheme := false
	for _, th := range pubCatalog.Themes {
		if th.ID == "christmas-eve" {
			foundTheme = true
			if len(th.CategoryIDs) != 2 || th.CategoryIDs[0] != "anime" || th.CategoryIDs[1] != "nature" {
				t.Fatalf("theme summary christmas-eve categoryIds: got %v, want [anime nature]", th.CategoryIDs)
			}
		}
	}
	if !foundTheme {
		t.Fatalf("published catalog missing christmas-eve theme")
	}

	foundWallpaper := false
	for _, wp := range pubCatalog.Wallpapers {
		if wp.ID == "silent-night" {
			foundWallpaper = true
			if len(wp.CategoryIDs) != 1 || wp.CategoryIDs[0] != "anime" {
				t.Fatalf("wallpaper silent-night categoryIds: got %v, want [anime]", wp.CategoryIDs)
			}
		}
	}
	if !foundWallpaper {
		t.Fatalf("published catalog missing silent-night wallpaper")
	}

	// 5. Export then import round trip keeps them
	bundle, err := api.RunExport(t.Context(), s.deps)
	if err != nil {
		t.Fatalf("RunExport failed: %v", err)
	}
	if len(bundle.Categories) < 2 {
		t.Fatalf("exported bundle expected at least 2 categories, got %d", len(bundle.Categories))
	}

	bundleBytes, err := json.Marshal(bundle)
	if err != nil {
		t.Fatalf("marshal export bundle: %v", err)
	}

	s2 := newServer(t)
	importRes, err := api.RunImport(t.Context(), s2.deps, bundleBytes, nil, nil, "test", "")
	if err != nil {
		t.Fatalf("RunImport round trip failed: %v", err)
	}
	if importRes.Categories < 2 {
		t.Fatalf("import result categories: got %d, want >= 2", importRes.Categories)
	}

	// Verify imported category and categoryIds in s2 database
	var importedCat catalog.Category
	var catData []byte
	if err := s2.db.NewSelect().Table("categories").Column("data").Where("id = ?", "anime").Scan(t.Context(), &catData); err != nil {
		t.Fatalf("read imported category anime: %v", err)
	}
	if err := json.Unmarshal(catData, &importedCat); err != nil {
		t.Fatalf("unmarshal imported category: %v", err)
	}
	if importedCat.ID != "anime" || importedCat.Name["en"] != "Anime" {
		t.Fatalf("imported category data mismatch: %+v", importedCat)
	}

	var importedTheme catalog.ThemeDetail
	var themeData []byte
	if err := s2.db.NewSelect().Table("themes").Column("data").Where("id = ?", "christmas-eve").Scan(t.Context(), &themeData); err != nil {
		t.Fatalf("read imported theme christmas-eve: %v", err)
	}
	if err := json.Unmarshal(themeData, &importedTheme); err != nil {
		t.Fatalf("unmarshal imported theme: %v", err)
	}
	if len(importedTheme.CategoryIDs) != 2 || importedTheme.CategoryIDs[0] != "anime" || importedTheme.CategoryIDs[1] != "nature" {
		t.Fatalf("imported theme categoryIds mismatch: got %v, want [anime nature]", importedTheme.CategoryIDs)
	}

	var importedWp catalog.Wallpaper
	var wpData []byte
	if err := s2.db.NewSelect().Table("wallpapers").Column("data").Where("id = ?", "silent-night").Scan(t.Context(), &wpData); err != nil {
		t.Fatalf("read imported wallpaper: %v", err)
	}
	if err := json.Unmarshal(wpData, &importedWp); err != nil {
		t.Fatalf("unmarshal imported wallpaper: %v", err)
	}
	if len(importedWp.CategoryIDs) != 1 || importedWp.CategoryIDs[0] != "anime" {
		t.Fatalf("imported wallpaper categoryIds mismatch: got %v, want [anime]", importedWp.CategoryIDs)
	}
}
