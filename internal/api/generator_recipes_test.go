package api_test

import (
	"encoding/json"
	"net/http"
	"os"
	"strings"
	"testing"

	"github.com/heinthant/wallp-backend/internal/catalog"
)

func TestRecipeCRUD(t *testing.T) {
	s := newServer(t)
	toks := setupRoleUsers(t, s)

	// 1. List recipes: all roles can list, seeds present
	t.Run("ListRecipesAllRolesAndSeeds", func(t *testing.T) {
		status, body := s.do(t, "GET", "/admin/v1/generator/recipes", toks.viewer, nil)
		if status != http.StatusOK {
			t.Fatalf("expected 200 listing recipes for viewer, got %d", status)
		}

		items, ok := body["items"].([]any)
		if !ok || len(items) < 4 {
			t.Fatalf("expected at least 4 seed recipes in list, got %v", items)
		}

		seedsFound := make(map[string]bool)
		for _, it := range items {
			m := it.(map[string]any)
			id, _ := m["id"].(string)
			seedsFound[id] = true
		}
		for _, expected := range []string{"halloween", "christmas", "thingyan", "default"} {
			if !seedsFound[expected] {
				t.Errorf("expected seed recipe %s in list, but missing", expected)
			}
		}
	})

	// 2. Create recipe: viewer forbidden, designer allowed
	t.Run("CreateRecipePermissionsAndValidation", func(t *testing.T) {
		validRecipe := map[string]any{
			"id":          "spooky-night",
			"name":        "Spooky Night",
			"festivalIds": []string{"halloween"},
			"tags":        []string{"spooky", "dark"},
			"moods":       []string{"cozy"},
			"hueRanges":   [][]float64{{270, 310}},
			"costBudget":  180,
		}

		// Viewer forbidden
		status, _ := s.do(t, "POST", "/admin/v1/generator/recipes", toks.viewer, validRecipe)
		if status != http.StatusForbidden {
			t.Fatalf("expected 403 creating recipe for viewer, got %d", status)
		}

		// Invalid kebab id validation
		invalidRecipe := map[string]any{
			"id":   "Spooky_Night",
			"name": "Invalid ID Recipe",
		}
		status, _ = s.do(t, "POST", "/admin/v1/generator/recipes", toks.designer, invalidRecipe)
		if status != http.StatusUnprocessableEntity {
			t.Fatalf("expected 422 for invalid kebab id, got %d", status)
		}

		// Designer succeeds
		status, body := s.do(t, "POST", "/admin/v1/generator/recipes", toks.designer, validRecipe)
		if status != http.StatusCreated {
			t.Fatalf("expected 201 creating recipe for designer, got %d; body: %v", status, body)
		}
		if body["id"] != "spooky-night" {
			t.Errorf("expected recipe id 'spooky-night', got %v", body["id"])
		}

		// Audit recorded
		status, auditBody := s.do(t, "GET", "/admin/v1/audit?itemType=generator_recipe&itemId=spooky-night", toks.admin, nil)
		if status == http.StatusOK {
			auditItems := auditBody["items"].([]any)
			if len(auditItems) == 0 {
				t.Errorf("expected audit entry for create generator_recipe, got none")
			}
		}
	})

	// 3. Get recipe by ID
	t.Run("GetRecipeByID", func(t *testing.T) {
		status, body := s.do(t, "GET", "/admin/v1/generator/recipes/spooky-night", toks.viewer, nil)
		if status != http.StatusOK {
			t.Fatalf("expected 200 for GET spooky-night, got %d", status)
		}
		if body["name"] != "Spooky Night" {
			t.Errorf("expected name 'Spooky Night', got %v", body["name"])
		}

		// Non-existent ID -> 404
		status, _ = s.do(t, "GET", "/admin/v1/generator/recipes/non-existent-recipe", toks.viewer, nil)
		if status != http.StatusNotFound {
			t.Fatalf("expected 404 for missing recipe, got %d", status)
		}
	})

	// 4. Update recipe + conflict detection
	t.Run("UpdateRecipeAndConflict", func(t *testing.T) {
		status, body := s.do(t, "GET", "/admin/v1/generator/recipes/spooky-night", toks.designer, nil)
		if status != http.StatusOK {
			t.Fatalf("failed to get spooky-night: %d", status)
		}
		updatedAtStr := body["updatedAt"].(string)

		// Successful update by reviewer
		updatePayload := map[string]any{
			"data": map[string]any{
				"id":          "spooky-night",
				"name":        "Spooky Night Updated",
				"festivalIds": []string{"halloween"},
				"moods":       []string{"cozy"},
				"hueRanges":   [][]float64{{270, 310}},
			},
			"updatedAt": updatedAtStr,
		}
		status, updatedBody := s.do(t, "PATCH", "/admin/v1/generator/recipes/spooky-night", toks.reviewer, updatePayload)
		if status != http.StatusOK {
			t.Fatalf("expected 200 updating recipe for reviewer, got %d; body: %v", status, updatedBody)
		}
		if updatedBody["name"] != "Spooky Night Updated" {
			t.Errorf("expected updated name 'Spooky Night Updated', got %v", updatedBody["name"])
		}

		// Stale update using old updatedAt -> 409 Conflict
		status, _ = s.do(t, "PATCH", "/admin/v1/generator/recipes/spooky-night", toks.designer, updatePayload)
		if status != http.StatusConflict {
			t.Fatalf("expected 409 Conflict for stale update, got %d", status)
		}
	})

	// 5. Delete recipe: designer forbidden, admin allowed
	t.Run("DeleteRecipePermissions", func(t *testing.T) {
		// Designer forbidden
		status, _ := s.do(t, "DELETE", "/admin/v1/generator/recipes/spooky-night", toks.designer, nil)
		if status != http.StatusForbidden {
			t.Fatalf("expected 403 deleting recipe for designer, got %d", status)
		}

		// Admin succeeds
		status, delBody := s.do(t, "DELETE", "/admin/v1/generator/recipes/spooky-night", toks.admin, nil)
		if status != http.StatusOK {
			t.Fatalf("expected 200 deleting recipe for admin, got %d; body: %v", status, delBody)
		}
		if delBody["ok"] != true {
			t.Errorf("expected ok: true, got %v", delBody["ok"])
		}

		// Recipe is gone -> 404
		status, _ = s.do(t, "GET", "/admin/v1/generator/recipes/spooky-night", toks.admin, nil)
		if status != http.StatusNotFound {
			t.Fatalf("expected 404 getting deleted recipe, got %d", status)
		}
	})
}

func TestRecipePreviewAndInterpret(t *testing.T) {
	if _, err := os.Stat(mockCatalogDir); os.IsNotExist(err) {
		t.Skipf("mock catalog directory not found at %s, skipping test", mockCatalogDir)
	}

	s := newServer(t)
	toks := setupRoleUsers(t, s)

	// Import mock catalog so festivals and fonts are loaded
	status, _ := s.do(t, "POST", "/admin/v1/import", toks.admin, map[string]any{
		"dir": mockCatalogDir,
	})
	if status != http.StatusOK {
		t.Fatalf("failed to import mock catalog: %d", status)
	}

	// 1. Preview recipe -> 6 options
	t.Run("PreviewRecipe6Options", func(t *testing.T) {
		status, body := s.do(t, "POST", "/admin/v1/generator/recipes/christmas/preview", toks.designer, map[string]any{
			"mood": "cozy",
		})
		if status != http.StatusOK {
			t.Fatalf("expected 200 for preview christmas recipe, got %d; body: %v", status, body)
		}

		options, ok := body["options"].([]any)
		if !ok || len(options) != 6 {
			t.Fatalf("expected 6 options in preview, got %v", body["options"])
		}

		for i, opt := range options {
			optMap := opt.(map[string]any)
			dataJSON, err := json.Marshal(optMap["data"])
			if err != nil {
				t.Fatalf("opt %d marshal data failed: %v", i, err)
			}
			var theme catalog.ThemeDetail
			if err := json.Unmarshal(dataJSON, &theme); err != nil {
				t.Fatalf("opt %d unmarshal into ThemeDetail failed: %v", i, err)
			}
			if errs := theme.Validate(); len(errs) > 0 {
				t.Errorf("opt %d ThemeDetail validation errors: %v", i, errs)
			}
		}

		// Preview non-existent recipe -> 404
		status, errBody := s.do(t, "POST", "/admin/v1/generator/recipes/unknown-recipe/preview", toks.designer, nil)
		if status != http.StatusNotFound {
			t.Fatalf("expected 404 for missing recipe preview, got %d; body: %v", status, errBody)
		}
	})

	// 2. Interpret description endpoint
	t.Run("InterpretEndpoint", func(t *testing.T) {
		status, body := s.do(t, "POST", "/admin/v1/themes/generate/interpret", toks.designer, map[string]any{
			"description": "snow cozy cabin in the woods",
		})
		if status != http.StatusOK {
			t.Fatalf("expected 200 for interpret, got %d; body: %v", status, body)
		}

		matched, ok := body["matched"].([]any)
		if !ok || len(matched) == 0 {
			t.Fatalf("expected matched words, got %v", body["matched"])
		}

		if body["mood"] != "cozy" {
			t.Errorf("expected mood cozy, got %v", body["mood"])
		}

		// Interpret with recipeId merging keywords
		status, bodyWithRecipe := s.do(t, "POST", "/admin/v1/themes/generate/interpret", toks.designer, map[string]any{
			"description": "spooky ghost night",
			"recipeId":    "halloween",
		})
		if status != http.StatusOK {
			t.Fatalf("expected 200 for interpret with recipeId, got %d", status)
		}
		matchedWithRec := bodyWithRecipe["matched"].([]any)
		if len(matchedWithRec) == 0 {
			t.Errorf("expected matched words for spooky ghost night, got none")
		}
	})
}

func TestThemesGenerateWithRecipeAndLocked(t *testing.T) {
	if _, err := os.Stat(mockCatalogDir); os.IsNotExist(err) {
		t.Skipf("mock catalog directory not found at %s, skipping test", mockCatalogDir)
	}

	s := newServer(t)
	toks := setupRoleUsers(t, s)

	// Import mock catalog
	status, _ := s.do(t, "POST", "/admin/v1/import", toks.admin, map[string]any{
		"dir": mockCatalogDir,
	})
	if status != http.StatusOK {
		t.Fatalf("failed to import mock catalog: %d", status)
	}

	// 1. Generate with specific recipeId
	t.Run("GenerateWithRecipeId", func(t *testing.T) {
		status, body := s.do(t, "POST", "/admin/v1/themes/generate", toks.designer, map[string]any{
			"festivalId": "halloween",
			"recipeId":   "halloween",
			"count":      3,
		})
		if status != http.StatusOK {
			t.Fatalf("expected 200 generating with recipeId, got %d; body: %v", status, body)
		}
		options := body["options"].([]any)
		if len(options) != 3 {
			t.Fatalf("expected 3 options, got %d", len(options))
		}
	})

	// 2. Generate with missing recipeId -> 404
	t.Run("GenerateWithMissingRecipeId", func(t *testing.T) {
		status, _ := s.do(t, "POST", "/admin/v1/themes/generate", toks.designer, map[string]any{
			"festivalId": "halloween",
			"recipeId":   "does-not-exist",
		})
		if status != http.StatusNotFound {
			t.Fatalf("expected 404 for unknown recipeId, got %d", status)
		}
	})

	// 3. Generate with locked swatches
	t.Run("GenerateWithLockedSwatches", func(t *testing.T) {
		lockedBG := "#181024"
		lockedText := "#FDEFE8"
		status, body := s.do(t, "POST", "/admin/v1/themes/generate", toks.designer, map[string]any{
			"festivalId": "christmas",
			"count":      3,
			"locked": map[string]any{
				"background": lockedBG,
				"text":       lockedText,
			},
		})
		if status != http.StatusOK {
			t.Fatalf("expected 200 generating with locked swatches, got %d; body: %v", status, body)
		}

		options := body["options"].([]any)
		for i, opt := range options {
			optMap := opt.(map[string]any)
			themeData := optMap["data"].(map[string]any)
			palette := themeData["palette"].(map[string]any)

			if !strings.EqualFold(palette["background"].(string), lockedBG) {
				t.Errorf("opt %d: background %s != locked %s", i, palette["background"], lockedBG)
			}
			if !strings.EqualFold(palette["text"].(string), lockedText) {
				t.Errorf("opt %d: text %s != locked %s", i, palette["text"], lockedText)
			}
		}
	})

	// 4. Generate with description inferring mood
	t.Run("GenerateWithDescriptionInferringMood", func(t *testing.T) {
		status, body := s.do(t, "POST", "/admin/v1/themes/generate", toks.designer, map[string]any{
			"festivalId":  "christmas",
			"description": "snowy cozy winter cabin",
			"count":       1,
		})
		if status != http.StatusOK {
			t.Fatalf("expected 200 generating with description, got %d; body: %v", status, body)
		}
		options := body["options"].([]any)
		if len(options) != 1 {
			t.Fatalf("expected 1 option, got %d", len(options))
		}
		opt0 := options[0].(map[string]any)
		themeData := opt0["data"].(map[string]any)
		if themeData["style"] != "cozy" {
			t.Errorf("expected inferred style 'cozy', got %v", themeData["style"])
		}
	})
}
