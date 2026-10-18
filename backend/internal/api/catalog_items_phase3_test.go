package api_test

import (
	"encoding/json"
	"net/http"
	"testing"
	"time"
)

func validWallpaperPayload(id, festID string) map[string]any {
	return map[string]any{
		"id":         id,
		"festivalId": festID,
		"name":       map[string]any{"en": "Spooky Wall"},
		"kind":       "scene",
		"scene": map[string]any{
			"engine": "layers",
			"params": map[string]any{
				"layers": []any{
					map[string]any{
						"type":   "gradient",
						"colors": []string{"#120326", "#07010F"},
						"angle":  180,
					},
				},
			},
		},
		"tags":        []string{"spooky", "halloween"},
		"publishedAt": "2026-10-31T00:00:00Z",
		"popularity":  1,
	}
}

func validFontPayload(id string) map[string]any {
	return map[string]any{
		"id":       id,
		"family":   "Orbitron",
		"category": "display",
		"scripts":  []string{"latin"},
		"tags":     []string{"display", "neon"},
		"license":  "OFL-1.1",
		"files": []any{
			map[string]any{
				"weight": 400,
				"style":  "normal",
				"asset": map[string]any{
					"url":    "assets/1234567890123456789012345678901234567890123456789012345678901234.ttf",
					"sha256": "1234567890123456789012345678901234567890123456789012345678901234",
					"bytes":  5000,
					"format": "ttf",
				},
			},
		},
	}
}

func validIconPackPayload(id, festID string) map[string]any {
	return map[string]any{
		"id":          id,
		"festivalId":  festID,
		"name":        map[string]any{"en": "Spooky Icons"},
		"style":       map[string]any{"en": "Spooky"},
		"kind":        "painted",
		"painter":     "halloween",
		"shape":       "squircle",
		"glyph":       "#FFFFFF",
		"ring":        "#000000",
		"publishedAt": "2026-10-31T00:00:00Z",
	}
}

func validBannerPayload(id, festID string, sort int) map[string]any {
	return map[string]any{
		"id":       id,
		"title":    map[string]any{"en": "Snowy Christmas"},
		"subtitle": map[string]any{"en": "Snowy pines and cabins"},
		"tag":      map[string]any{"en": "WALLPAPERS"},
		"cta":      map[string]any{"en": "Browse"},
		"action": map[string]any{
			"type": "festival",
			"id":   festID,
		},
		"look": map[string]any{
			"background": "#0F3D2E",
			"accent":     "#F2B33D",
			"titleColor": "#F5F1EA",
			"font":       "playfair-display",
		},
		"sort": sort,
	}
}

func TestCatalogItemsGenericKindsCRUD(t *testing.T) {
	s := newServer(t)
	toks := setupRoleUsers(t, s)

	// Create a shared festival for items that reference one
	s.do(t, "POST", "/admin/v1/festivals", toks.admin, validFestivalPayload("halloween", 10))

	tests := []struct {
		name           string
		path           string
		validPayload   map[string]any
		invalidPayload map[string]any // invalid for review request
		updateField    string
		updateVal      any
	}{
		{
			name:         "wallpapers",
			path:         "/admin/v1/wallpapers",
			validPayload: validWallpaperPayload("wall-item-1", "halloween"),
			invalidPayload: func() map[string]any {
				p := validWallpaperPayload("wall-inv-1", "halloween")
				sc := p["scene"].(map[string]any)
				params := sc["params"].(map[string]any)
				layers := params["layers"].([]any)
				l0 := layers[0].(map[string]any)
				l0["colors"] = []string{"#BADHEX1", "#BADHEX2"}
				return p
			}(),
			updateField: "tags",
			updateVal:   []string{"updated-tag"},
		},
		{
			name:         "fonts",
			path:         "/admin/v1/fonts",
			validPayload: validFontPayload("font-item-1"),
			invalidPayload: func() map[string]any {
				p := validFontPayload("font-inv-1")
				p["license"] = "GPL-3.0"
				return p
			}(),
			updateField: "tags",
			updateVal:   []string{"updated-font-tag"},
		},
		{
			name:         "icon-packs",
			path:         "/admin/v1/icon-packs",
			validPayload: validIconPackPayload("pack-item-1", "halloween"),
			invalidPayload: func() map[string]any {
				p := validIconPackPayload("pack-inv-1", "halloween")
				p["glyph"] = "#BADGLYPH"
				return p
			}(),
			updateField: "style",
			updateVal:   map[string]any{"en": "Updated Style"},
		},
		{
			name:         "banners",
			path:         "/admin/v1/banners",
			validPayload: validBannerPayload("banner-item-1", "halloween", 10),
			invalidPayload: func() map[string]any {
				p := validBannerPayload("banner-inv-1", "halloween", 20)
				look := p["look"].(map[string]any)
				look["background"] = "#BADCOLOR"
				return p
			}(),
			updateField: "cta",
			updateVal:   map[string]any{"en": "Updated CTA"},
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			itemPath := tc.path + "/" + tc.validPayload["id"].(string)

			// 1. Viewer 403 on Create
			status, _ := s.do(t, "POST", tc.path, toks.viewer, tc.validPayload)
			if status != http.StatusForbidden {
				t.Fatalf("[%s] expected 403 for viewer create, got %d", tc.name, status)
			}

			// 2. Designer 201 Create
			status, body := s.do(t, "POST", tc.path, toks.designer, tc.validPayload)
			if status != http.StatusCreated {
				t.Fatalf("[%s] create failed: status=%d body=%v", tc.name, status, body)
			}
			if body["id"] != tc.validPayload["id"] || body["status"] != "draft" {
				t.Fatalf("[%s] unexpected created body: %v", tc.name, body)
			}

			// 3. Viewer 200 Read
			status, body = s.do(t, "GET", itemPath, toks.viewer, nil)
			if status != http.StatusOK || body["id"] != tc.validPayload["id"] {
				t.Fatalf("[%s] get failed: status=%d body=%v", tc.name, status, body)
			}

			// 4. Viewer 200 List
			status, body = s.do(t, "GET", tc.path, toks.viewer, nil)
			if status != http.StatusOK {
				t.Fatalf("[%s] list failed: status=%d body=%v", tc.name, status, body)
			}
			total, ok := body["total"].(float64)
			if !ok || total < 1 {
				t.Fatalf("[%s] list expected at least 1 item, got %v", tc.name, body["total"])
			}

			// 5. Viewer 403 on Update
			tc.validPayload[tc.updateField] = tc.updateVal
			status, _ = s.do(t, "PATCH", itemPath, toks.viewer, tc.validPayload)
			if status != http.StatusForbidden {
				t.Fatalf("[%s] expected 403 for viewer update, got %d", tc.name, status)
			}

			// 6. Designer 200 Update
			status, body = s.do(t, "PATCH", itemPath, toks.designer, tc.validPayload)
			if status != http.StatusOK {
				t.Fatalf("[%s] update failed: status=%d body=%v", tc.name, status, body)
			}

			// 7. Viewer 403 on Duplicate
			status, _ = s.do(t, "POST", itemPath+"/duplicate", toks.viewer, nil)
			if status != http.StatusForbidden {
				t.Fatalf("[%s] expected 403 for viewer duplicate, got %d", tc.name, status)
			}

			// 8. Designer 201 Duplicate
			status, body = s.do(t, "POST", itemPath+"/duplicate", toks.designer, nil)
			if status != http.StatusCreated {
				t.Fatalf("[%s] duplicate failed: status=%d body=%v", tc.name, status, body)
			}
			expectedDupID := tc.validPayload["id"].(string) + "-copy"
			if body["id"] != expectedDupID {
				t.Fatalf("[%s] expected dup id %s, got %v", tc.name, expectedDupID, body["id"])
			}

			// 9. Viewer 403 on Review
			status, _ = s.do(t, "POST", itemPath+"/review", toks.viewer, map[string]any{"action": "request"})
			if status != http.StatusForbidden {
				t.Fatalf("[%s] expected 403 for viewer review request, got %d", tc.name, status)
			}

			// 10. Designer 200 Review Request (draft -> in_review)
			status, body = s.do(t, "POST", itemPath+"/review", toks.designer, map[string]any{"action": "request"})
			if status != http.StatusOK || body["status"] != "in_review" {
				t.Fatalf("[%s] review request failed: status=%d body=%v", tc.name, status, body)
			}

			// 11. Reviewer 200 Review Approve (in_review -> approved)
			status, body = s.do(t, "POST", itemPath+"/review", toks.reviewer, map[string]any{"action": "approve"})
			if status != http.StatusOK || body["status"] != "approved" {
				t.Fatalf("[%s] review approve failed: status=%d body=%v", tc.name, status, body)
			}

			// 12. Viewer 403 on Schedule
			future := time.Now().Add(24 * time.Hour).UTC().Format(time.RFC3339)
			status, _ = s.do(t, "POST", itemPath+"/schedule", toks.viewer, map[string]any{"at": future})
			if status != http.StatusForbidden {
				t.Fatalf("[%s] expected 403 for viewer schedule, got %d", tc.name, status)
			}

			// 13. Reviewer 200 Schedule (approved -> scheduled)
			status, body = s.do(t, "POST", itemPath+"/schedule", toks.reviewer, map[string]any{"at": future})
			if status != http.StatusOK || body["status"] != "scheduled" {
				t.Fatalf("[%s] schedule failed: status=%d body=%v", tc.name, status, body)
			}

			// Unschedule (scheduled -> approved)
			status, body = s.do(t, "POST", itemPath+"/schedule", toks.reviewer, map[string]any{"at": nil})
			if status != http.StatusOK || body["status"] != "approved" {
				t.Fatalf("[%s] unschedule failed: status=%d body=%v", tc.name, status, body)
			}

			// 14. Viewer 200 Export
			req, _ := http.NewRequest("GET", s.server.URL+itemPath+"/export", nil)
			req.Header.Set("Authorization", "Bearer "+toks.viewer)
			resp, err := s.server.Client().Do(req)
			if err != nil {
				t.Fatalf("[%s] export request failed: %v", tc.name, err)
			}
			defer resp.Body.Close()
			if resp.StatusCode != http.StatusOK {
				t.Fatalf("[%s] export expected 200, got %d", tc.name, resp.StatusCode)
			}
			disp := resp.Header.Get("Content-Disposition")
			if disp == "" {
				t.Fatalf("[%s] expected Content-Disposition header on export", tc.name)
			}
			var expMap map[string]any
			if err := json.NewDecoder(resp.Body).Decode(&expMap); err != nil {
				t.Fatalf("[%s] failed to decode export JSON: %v", tc.name, err)
			}
			if expMap["id"] != tc.validPayload["id"] {
				t.Fatalf("[%s] export id mismatch: %v", tc.name, expMap)
			}

			// 15. Viewer 403 on Archive (DELETE)
			status, _ = s.do(t, "DELETE", itemPath, toks.viewer, nil)
			if status != http.StatusForbidden {
				t.Fatalf("[%s] expected 403 for viewer delete, got %d", tc.name, status)
			}

			// 16. Admin 200 Archive (DELETE)
			status, body = s.do(t, "DELETE", itemPath, toks.admin, nil)
			if status != http.StatusOK || body["status"] != "archived" {
				t.Fatalf("[%s] admin delete failed: status=%d body=%v", tc.name, status, body)
			}

			// 17. Viewer 403 on Restore
			status, _ = s.do(t, "POST", itemPath+"/restore", toks.viewer, nil)
			if status != http.StatusForbidden {
				t.Fatalf("[%s] expected 403 for viewer restore, got %d", tc.name, status)
			}

			// 18. Admin 200 Restore
			status, body = s.do(t, "POST", itemPath+"/restore", toks.admin, nil)
			if status != http.StatusOK || body["status"] != "draft" {
				t.Fatalf("[%s] admin restore failed: status=%d body=%v", tc.name, status, body)
			}

			// Also test POST /{id}/archive
			status, body = s.do(t, "POST", itemPath+"/archive", toks.admin, nil)
			if status != http.StatusOK || body["status"] != "archived" {
				t.Fatalf("[%s] post archive failed: status=%d body=%v", tc.name, status, body)
			}
			status, _ = s.do(t, "POST", itemPath+"/restore", toks.admin, nil)

			// 19. 404 Tests
			nonExistent := tc.path + "/non-existent-id"
			status, _ = s.do(t, "GET", nonExistent, toks.viewer, nil)
			if status != http.StatusNotFound {
				t.Fatalf("[%s] expected 404 for non-existent get, got %d", tc.name, status)
			}
			nonExistentPayload := make(map[string]any)
			for k, v := range tc.validPayload {
				nonExistentPayload[k] = v
			}
			nonExistentPayload["id"] = "non-existent-id"
			status, _ = s.do(t, "PATCH", nonExistent, toks.designer, nonExistentPayload)
			if status != http.StatusNotFound {
				t.Fatalf("[%s] expected 404 for non-existent patch, got %d", tc.name, status)
			}
			status, _ = s.do(t, "DELETE", nonExistent, toks.admin, nil)
			if status != http.StatusNotFound {
				t.Fatalf("[%s] expected 404 for non-existent delete, got %d", tc.name, status)
			}

			// 20. 422 Tests
			// A) Invalid ID on Create -> 422
			badIDPayload := make(map[string]any)
			for k, v := range tc.validPayload {
				badIDPayload[k] = v
			}
			badIDPayload["id"] = "INVALID_UPPERCASE_ID"
			status, body = s.do(t, "POST", tc.path, toks.designer, badIDPayload)
			if status != http.StatusUnprocessableEntity {
				t.Fatalf("[%s] expected 422 for invalid id, got %d (body=%v)", tc.name, status, body)
			}

			// B) Changing ID on PATCH -> 422 id_fixed
			patchBadID := make(map[string]any)
			for k, v := range tc.validPayload {
				patchBadID[k] = v
			}
			patchBadID["id"] = "different-id"
			status, body = s.do(t, "PATCH", itemPath, toks.designer, patchBadID)
			if status != http.StatusUnprocessableEntity {
				t.Fatalf("[%s] expected 422 for changing id on patch, got %d (body=%v)", tc.name, status, body)
			}

			// C) Save invalid draft then review request -> 422 invalid_item
			status, body = s.do(t, "POST", tc.path, toks.designer, tc.invalidPayload)
			if status != http.StatusCreated {
				t.Fatalf("[%s] expected invalid draft to save (201), got %d (body=%v)", tc.name, status, body)
			}
			invPath := tc.path + "/" + tc.invalidPayload["id"].(string)
			status, body = s.do(t, "POST", invPath+"/review", toks.designer, map[string]any{"action": "request"})
			if status != http.StatusUnprocessableEntity {
				t.Fatalf("[%s] expected 422 on review request for invalid item, got %d (body=%v)", tc.name, status, body)
			}
		})
	}
}

func TestBannersReorder(t *testing.T) {
	s := newServer(t)
	toks := setupRoleUsers(t, s)

	s.do(t, "POST", "/admin/v1/festivals", toks.admin, validFestivalPayload("halloween", 10))

	// Create 2 banners
	b1 := validBannerPayload("bn-1", "halloween", 10)
	b2 := validBannerPayload("bn-2", "halloween", 20)
	status, _ := s.do(t, "POST", "/admin/v1/banners", toks.designer, b1)
	if status != 201 {
		t.Fatalf("create bn-1 failed: %d", status)
	}
	status, _ = s.do(t, "POST", "/admin/v1/banners", toks.designer, b2)
	if status != 201 {
		t.Fatalf("create bn-2 failed: %d", status)
	}

	// Viewer reorder -> 403
	status, _ = s.do(t, "PUT", "/admin/v1/banners/order", toks.viewer, map[string]any{
		"ids": []string{"bn-2", "bn-1"},
	})
	if status != http.StatusForbidden {
		t.Fatalf("expected 403 for viewer banners reorder, got %d", status)
	}

	// Designer reorder -> 403
	status, _ = s.do(t, "PUT", "/admin/v1/banners/order", toks.designer, map[string]any{
		"ids": []string{"bn-2", "bn-1"},
	})
	if status != http.StatusForbidden {
		t.Fatalf("expected 403 for designer banners reorder, got %d", status)
	}

	// Admin reorder -> 200
	status, body := s.do(t, "PUT", "/admin/v1/banners/order", toks.admin, map[string]any{
		"ids": []string{"bn-2", "bn-1"},
	})
	if status != http.StatusOK {
		t.Fatalf("banners reorder failed: %d %v", status, body)
	}

	// Verify sort values: bn-2 sort=0, bn-1 sort=10
	status, body = s.do(t, "GET", "/admin/v1/banners/bn-2", toks.viewer, nil)
	if status != 200 || body["sort"] != float64(0) {
		t.Fatalf("expected bn-2 sort=0, got %v", body["sort"])
	}
	status, body = s.do(t, "GET", "/admin/v1/banners/bn-1", toks.viewer, nil)
	if status != 200 || body["sort"] != float64(10) {
		t.Fatalf("expected bn-1 sort=10, got %v", body["sort"])
	}
}
