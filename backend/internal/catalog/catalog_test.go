package catalog_test

import (
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"testing"

	"github.com/heinthant/wallp-backend/internal/catalog"
)

const mockDir = "/Users/heinthant/Development/wallp/wallp/assets/mock/catalog/v1"

func TestMockCatalogParsesAndValidates(t *testing.T) {
	if _, err := os.Stat(mockDir); os.IsNotExist(err) {
		t.Skip("mock catalog directory missing:", mockDir)
	}

	catalogFiles, err := filepath.Glob(filepath.Join(mockDir, "catalog.*.json"))
	if err != nil {
		t.Fatalf("failed to glob catalog files: %v", err)
	}
	if len(catalogFiles) == 0 {
		t.Fatal("no catalog.*.json files found in mock directory")
	}

	for _, cFile := range catalogFiles {
		t.Run(filepath.Base(cFile), func(t *testing.T) {
			data, err := os.ReadFile(cFile)
			if err != nil {
				t.Fatalf("failed to read %s: %v", cFile, err)
			}
			var cat catalog.Catalog
			if err := json.Unmarshal(data, &cat); err != nil {
				t.Fatalf("failed to unmarshal catalog %s: %v", cFile, err)
			}

			// Validate Catalog
			if errs := cat.Validate(); len(errs) > 0 {
				t.Errorf("cat.Validate() returned errors: %v", errs)
			}

			// Validate festivals
			for _, f := range cat.Festivals {
				if errs := f.Validate(); len(errs) > 0 {
					t.Errorf("festival %s failed validation: %v", f.ID, errs)
				}
			}

			// Validate theme summaries
			for _, th := range cat.Themes {
				if errs := th.Validate(); len(errs) > 0 {
					t.Errorf("theme summary %s failed validation: %v", th.ID, errs)
				}
			}

			// Validate wallpapers
			for _, w := range cat.Wallpapers {
				if errs := w.Validate(); len(errs) > 0 {
					t.Errorf("wallpaper %s failed validation: %v", w.ID, errs)
				}
			}

			// Validate fonts
			for _, fn := range cat.Fonts {
				if errs := fn.Validate(); len(errs) > 0 {
					t.Errorf("font %s failed validation: %v", fn.ID, errs)
				}
			}

			// Validate icon packs
			for _, p := range cat.IconPacks {
				if errs := p.Validate(); len(errs) > 0 {
					t.Errorf("icon pack %s failed validation: %v", p.ID, errs)
				}
			}

			// Validate banners
			for _, b := range cat.Banners {
				if errs := b.Validate(); len(errs) > 0 {
					t.Errorf("banner %s failed validation: %v", b.ID, errs)
				}
			}

			// Validate accent presets
			if errs := cat.AccentPresets.Validate(); len(errs) > 0 {
				t.Errorf("accent presets failed validation: %v", errs)
			}
		})
	}

	themeFiles, err := filepath.Glob(filepath.Join(mockDir, "themes", "*.json"))
	if err != nil {
		t.Fatalf("failed to glob theme files: %v", err)
	}
	if len(themeFiles) == 0 {
		t.Fatal("no theme files found in mock/themes directory")
	}

	for _, tFile := range themeFiles {
		t.Run(filepath.Base(tFile), func(t *testing.T) {
			data, err := os.ReadFile(tFile)
			if err != nil {
				t.Fatalf("failed to read %s: %v", tFile, err)
			}
			var detail catalog.ThemeDetail
			if err := json.Unmarshal(data, &detail); err != nil {
				t.Fatalf("failed to unmarshal theme %s: %v", tFile, err)
			}
			if errs := detail.Validate(); len(errs) > 0 {
				t.Errorf("theme detail %s failed validation: %v", detail.ID, errs)
			}
		})
	}
}

func TestSummaryEqualsCatalogSummary(t *testing.T) {
	if _, err := os.Stat(mockDir); os.IsNotExist(err) {
		t.Skip("mock catalog directory missing:", mockDir)
	}

	catalogFiles, err := filepath.Glob(filepath.Join(mockDir, "catalog.*.json"))
	if err != nil || len(catalogFiles) == 0 {
		t.Fatalf("no catalog file found: %v", err)
	}
	catData, err := os.ReadFile(catalogFiles[0])
	if err != nil {
		t.Fatalf("failed to read catalog file: %v", err)
	}
	var cat catalog.Catalog
	if err := json.Unmarshal(catData, &cat); err != nil {
		t.Fatalf("failed to unmarshal catalog: %v", err)
	}

	catalogSummaryMap := make(map[string]catalog.ThemeSummary, len(cat.Themes))
	for _, s := range cat.Themes {
		catalogSummaryMap[s.ID] = s
	}

	themeFiles, err := filepath.Glob(filepath.Join(mockDir, "themes", "*.json"))
	if err != nil || len(themeFiles) == 0 {
		t.Fatalf("no theme files found: %v", err)
	}

	if len(themeFiles) != 5 {
		t.Fatalf("expected 5 theme files, found %d", len(themeFiles))
	}

	for _, tFile := range themeFiles {
		t.Run(filepath.Base(tFile), func(t *testing.T) {
			data, err := os.ReadFile(tFile)
			if err != nil {
				t.Fatalf("failed to read %s: %v", tFile, err)
			}
			var detail catalog.ThemeDetail
			if err := json.Unmarshal(data, &detail); err != nil {
				t.Fatalf("failed to unmarshal %s: %v", tFile, err)
			}

			catSummary, exists := catalogSummaryMap[detail.ID]
			if !exists {
				t.Fatalf("theme %s not found in catalog summary list", detail.ID)
			}

			computed := catalog.Summary(detail)

			// Compare as JSON values
			compJSON, err := json.Marshal(computed)
			if err != nil {
				t.Fatalf("failed to marshal computed summary: %v", err)
			}
			catJSON, err := json.Marshal(catSummary)
			if err != nil {
				t.Fatalf("failed to marshal catalog summary: %v", err)
			}

			var compMap, catMap map[string]any
			if err := json.Unmarshal(compJSON, &compMap); err != nil {
				t.Fatalf("failed to unmarshal compJSON to map: %v", err)
			}
			if err := json.Unmarshal(catJSON, &catMap); err != nil {
				t.Fatalf("failed to unmarshal catJSON to map: %v", err)
			}

			if !reflect.DeepEqual(compMap, catMap) {
				t.Errorf("Summary(%s) mismatch:\ncomputed:\n%s\ncatalog:\n%s", detail.ID, string(compJSON), string(catJSON))
			}
		})
	}
}
