package api_test

import (
	"encoding/json"
	"net/http"
	"os"
	"reflect"
	"testing"

	"github.com/heinthant/wallp-backend/internal/catalog"
)

func TestThemeGenerate(t *testing.T) {
	if _, err := os.Stat(mockCatalogDir); os.IsNotExist(err) {
		t.Skipf("mock catalog directory not found at %s, skipping test", mockCatalogDir)
	}

	s := newServer(t)
	toks := setupRoleUsers(t, s)

	// 1. Viewer calling generate -> 403 Forbidden
	t.Run("ViewerForbidden", func(t *testing.T) {
		status, _ := s.do(t, "POST", "/admin/v1/themes/generate", toks.viewer, map[string]any{
			"festivalId": "christmas",
		})
		if status != http.StatusForbidden {
			t.Fatalf("expected 403 for viewer, got %d", status)
		}
	})

	// 2. 404 on missing festival
	t.Run("FestivalNotFound", func(t *testing.T) {
		status, _ := s.do(t, "POST", "/admin/v1/themes/generate", toks.designer, map[string]any{
			"festivalId": "nonexistent-festival",
		})
		if status != http.StatusNotFound {
			t.Fatalf("expected 404 for missing festival, got %d", status)
		}
	})

	// Import mock catalog first so festivals and fonts exist for subsequent tests
	status, _ := s.do(t, "POST", "/admin/v1/import", toks.admin, map[string]any{
		"dir": mockCatalogDir,
	})
	if status != http.StatusOK {
		t.Fatalf("failed to import mock catalog before generator tests: status %d", status)
	}

	// 3. 422 on bad mood and bad colour
	t.Run("ValidationErrors", func(t *testing.T) {
		// Bad mood
		status, body := s.do(t, "POST", "/admin/v1/themes/generate", toks.designer, map[string]any{
			"festivalId": "christmas",
			"mood":       "invalid_mood",
		})
		if status != http.StatusUnprocessableEntity {
			t.Fatalf("expected 422 for bad mood, got %d (body: %v)", status, body)
		}

		// Bad baseColor (not 6-digit hex)
		status, body = s.do(t, "POST", "/admin/v1/themes/generate", toks.designer, map[string]any{
			"festivalId": "christmas",
			"baseColor":  "red",
		})
		if status != http.StatusUnprocessableEntity {
			t.Fatalf("expected 422 for bad baseColor 'red', got %d (body: %v)", status, body)
		}

		status, body = s.do(t, "POST", "/admin/v1/themes/generate", toks.designer, map[string]any{
			"festivalId": "christmas",
			"baseColor":  "#12345",
		})
		if status != http.StatusUnprocessableEntity {
			t.Fatalf("expected 422 for bad baseColor '#12345', got %d (body: %v)", status, body)
		}
	})

	// 4. Fixed seed -> identical response twice
	t.Run("FixedSeedDeterminism", func(t *testing.T) {
		seed := int64(987654321)
		payload := map[string]any{
			"festivalId": "christmas",
			"mood":       "cozy",
			"seed":       seed,
			"count":      3,
		}

		status1, resp1 := s.doRaw(t, "POST", "/admin/v1/themes/generate", toks.designer, payload, nil)
		if status1 != http.StatusOK {
			t.Fatalf("first generate failed: status %d", status1)
		}

		status2, resp2 := s.doRaw(t, "POST", "/admin/v1/themes/generate", toks.designer, payload, nil)
		if status2 != http.StatusOK {
			t.Fatalf("second generate failed: status %d", status2)
		}

		if !semanticJSONEqual(t, resp1, resp2) {
			t.Fatalf("generate with fixed seed produced different outputs across calls")
		}
	})

	// 5. After import, generating 6 christmas cozy options succeeds and each passes validation
	var firstOption map[string]any
	t.Run("GenerateChristmasCozySixOptions", func(t *testing.T) {
		status, body := s.do(t, "POST", "/admin/v1/themes/generate", toks.designer, map[string]any{
			"festivalId": "christmas",
			"mood":       "cozy",
			"count":      6,
		})
		if status != http.StatusOK {
			t.Fatalf("expected 200 generating christmas cozy options, got %d; body: %v", status, body)
		}

		optionsRaw, ok := body["options"].([]any)
		if !ok || len(optionsRaw) != 6 {
			t.Fatalf("expected 6 options in response, got %v", body["options"])
		}

		for i, opt := range optionsRaw {
			optMap, ok := opt.(map[string]any)
			if !ok {
				t.Fatalf("option %d is not an object", i)
			}
			dataJSON, err := json.Marshal(optMap["data"])
			if err != nil {
				t.Fatalf("failed to marshal option %d data: %v", i, err)
			}
			var theme catalog.ThemeDetail
			if err := json.Unmarshal(dataJSON, &theme); err != nil {
				t.Fatalf("failed to unmarshal option %d into ThemeDetail: %v", i, err)
			}
			fieldErrors := theme.Validate()
			if len(fieldErrors) > 0 {
				t.Fatalf("generated option %d failed validation: %v", i, fieldErrors)
			}
		}

		firstOption = optionsRaw[0].(map[string]any)
	})

	// 6. Create theme with generatedFrom round-trips
	t.Run("CreateWithGeneratedFromRoundTrips", func(t *testing.T) {
		if firstOption == nil {
			t.Fatal("firstOption is nil, cannot proceed with round-trip test")
		}

		themeData := firstOption["data"].(map[string]any)
		themeID := "roundtrip-gen-theme"
		themeData["id"] = themeID

		genFrom := map[string]any{
			"seed":       firstOption["seed"],
			"mood":       "cozy",
			"festivalId": "christmas",
			"checks":     firstOption["checks"],
		}

		createPayload := map[string]any{
			"data":          themeData,
			"generatedFrom": genFrom,
		}

		// Create theme with designer role
		status, createBody := s.do(t, "POST", "/admin/v1/themes", toks.designer, createPayload)
		if status != http.StatusCreated {
			t.Fatalf("failed to create theme with generatedFrom: status %d, body: %v", status, createBody)
		}

		createdGF, ok := createBody["generatedFrom"].(map[string]any)
		if !ok {
			t.Fatalf("expected generatedFrom in create response, got %v", createBody["generatedFrom"])
		}
		if !reflect.DeepEqual(createdGF["mood"], genFrom["mood"]) {
			t.Fatalf("generatedFrom mood mismatch: expected %v, got %v", genFrom["mood"], createdGF["mood"])
		}

		// GET theme by ID
		status, getBody := s.do(t, "GET", "/admin/v1/themes/"+themeID, toks.designer, nil)
		if status != http.StatusOK {
			t.Fatalf("failed to get theme %s: status %d", themeID, status)
		}
		getGF, ok := getBody["generatedFrom"].(map[string]any)
		if !ok {
			t.Fatalf("expected generatedFrom in get response, got %v", getBody["generatedFrom"])
		}
		if !reflect.DeepEqual(getGF["mood"], genFrom["mood"]) {
			t.Fatalf("generatedFrom mood mismatch on GET: expected %v, got %v", genFrom["mood"], getGF["mood"])
		}

		// Filter list: generated=true
		status, listGenBody := s.do(t, "GET", "/admin/v1/themes?generated=true", toks.designer, nil)
		if status != http.StatusOK {
			t.Fatalf("failed to list themes with generated=true: status %d", status)
		}
		itemsGen := listGenBody["items"].([]any)
		found := false
		for _, it := range itemsGen {
			itemMap := it.(map[string]any)
			if itemMap["id"] == themeID {
				found = true
			}
			if itemMap["generatedFrom"] == nil {
				t.Fatalf("theme %s in generated=true list has nil generatedFrom", itemMap["id"])
			}
		}
		if !found {
			t.Fatalf("theme %s not found in generated=true list", themeID)
		}

		// Filter list: generated=false
		status, listNotGenBody := s.do(t, "GET", "/admin/v1/themes?generated=false", toks.designer, nil)
		if status != http.StatusOK {
			t.Fatalf("failed to list themes with generated=false: status %d", status)
		}
		itemsNotGen := listNotGenBody["items"].([]any)
		for _, it := range itemsNotGen {
			itemMap := it.(map[string]any)
			if itemMap["id"] == themeID {
				t.Fatalf("theme %s unexpectedly found in generated=false list", themeID)
			}
			if itemMap["generatedFrom"] != nil {
				t.Fatalf("theme %s in generated=false list has non-nil generatedFrom", itemMap["id"])
			}
		}
	})
}
