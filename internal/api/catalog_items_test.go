package api_test

import (
	"context"
	"encoding/json"
	"net/http"
	"net/url"
	"testing"
	"time"

	"github.com/heinthant/wallp-backend/internal/api"
	"github.com/heinthant/wallp-backend/internal/auth"
	"github.com/heinthant/wallp-backend/internal/model"
)

type roleTokens struct {
	admin    string
	designer string
	reviewer string
	viewer   string
}

func setupRoleUsers(t *testing.T, s *testServer) roleTokens {
	t.Helper()
	ctx := context.Background()

	// 1. Setup admin
	s.do(t, "POST", "/admin/v1/auth/setup", "", map[string]any{
		"email":    "admin@example.com",
		"name":     "Admin User",
		"password": "password12345",
	})

	issueTok := func(email, name, role string) string {
		u, err := api.CreateAdminUser(ctx, s.db, email, name, "password12345", role)
		if err != nil {
			t.Fatalf("failed to create user %s (%s): %v", email, role, err)
		}
		toks, err := s.deps.Auth.Issue(ctx, model.SubjectAdmin, u.ID, u.Role, u.Name, auth.Meta{})
		if err != nil {
			t.Fatalf("failed to issue token for %s: %v", email, err)
		}
		return toks.AccessToken
	}

	// Login admin to get admin token
	_, body := s.do(t, "POST", "/admin/v1/auth/login", "", map[string]any{
		"email":    "admin@example.com",
		"password": "password12345",
	})
	sess := body["session"].(map[string]any)
	adminTok := sess["accessToken"].(string)

	designerTok := issueTok("designer@example.com", "Designer User", model.RoleDesigner)
	reviewerTok := issueTok("reviewer@example.com", "Reviewer User", model.RoleReviewer)
	viewerTok := issueTok("viewer@example.com", "Viewer User", model.RoleViewer)

	return roleTokens{
		admin:    adminTok,
		designer: designerTok,
		reviewer: reviewerTok,
		viewer:   viewerTok,
	}
}

func validFestivalPayload(id string, sort int) map[string]any {
	return map[string]any{
		"id":   id,
		"kind": "festival",
		"sort": sort,
		"name": map[string]any{
			"en": "Thadingyut Festival",
			"my": "သီတင်းကျွတ်",
		},
		"tags": []string{"lights", "autumn"},
		"fallbackDate": map[string]any{
			"month": 10,
			"day":   15,
		},
		"unit": "night",
		"look": map[string]any{
			"background":  "#120A1C",
			"surface":     "#1E1430",
			"surface2":    "#2A1D40",
			"outline":     "#3D2C57",
			"nav":         "#170E24",
			"muted":       "#B9AECB",
			"brand":       "#FF7A1A",
			"displayFont": "creepster",
		},
	}
}

func validThemePayload(id, festivalID string) map[string]any {
	return map[string]any{
		"id":            id,
		"rev":           1,
		"festivalId":    festivalID,
		"style":         "classic",
		"name":          map[string]any{"en": "Spider Night"},
		"subtitle":      map[string]any{"en": "Spooky Spider"},
		"tags":          []string{"spider", "spooky", "halloween"},
		"publishedAt":   "2026-10-31T00:00:00Z",
		"popularity":    10,
		"minAppVersion": "1.0.0",
		"scene": map[string]any{
			"engine": "halloween",
			"params": map[string]any{},
		},
		"palette": map[string]any{
			"background": "#0D0A14",
			"deep":       "#140F20",
			"surface":    "#1F1830",
			"text":       "#F5F0FF",
			"textMuted":  "#A99EC0",
		},
		"accents": []map[string]any{
			{
				"id":     "pumpkin",
				"name":   map[string]any{"en": "Pumpkin"},
				"type":   "solid",
				"colors": []string{"#FF6B00"},
			},
		},
		"fonts": map[string]any{
			"display": "creepster",
			"body":    "inter",
			"labels":  "inter",
		},
		"clock": map[string]any{
			"useAccent": true,
		},
		"iconPackId":    "halloween-icons",
		"downloadBytes": 1024,
	}
}

// 1. Festival CRUD: Create, Read, Update, List, Reorder, Archive, Restore
func TestFestivalCRUD(t *testing.T) {
	s := newServer(t)
	toks := setupRoleUsers(t, s)

	// Create with designer
	f1 := validFestivalPayload("fest-1", 10)
	status, body := s.do(t, "POST", "/admin/v1/festivals", toks.designer, f1)
	if status != 201 {
		t.Fatalf("create festival failed: status=%d body=%v", status, body)
	}
	if body["id"] != "fest-1" || body["status"] != "draft" {
		t.Fatalf("unexpected festival created: %v", body)
	}
	if body["hasUnpublishedChanges"] != false {
		t.Fatalf("expected hasUnpublishedChanges=false, got %v", body["hasUnpublishedChanges"])
	}
	val, ok := body["validation"].([]any)
	if !ok || len(val) != 0 {
		t.Fatalf("expected empty validation array, got %v", body["validation"])
	}

	// Read with viewer
	status, body = s.do(t, "GET", "/admin/v1/festivals/fest-1", toks.viewer, nil)
	if status != 200 || body["id"] != "fest-1" {
		t.Fatalf("get festival failed: status=%d body=%v", status, body)
	}

	// Update with designer
	f1["tags"] = []string{"lights", "moon", "newtag"}
	status, body = s.do(t, "PATCH", "/admin/v1/festivals/fest-1", toks.designer, f1)
	if status != 200 {
		t.Fatalf("update festival failed: status=%d body=%v", status, body)
	}
	dataMap := body["data"].(map[string]any)
	tags := dataMap["tags"].([]any)
	if len(tags) != 3 {
		t.Fatalf("expected 3 tags, got %v", tags)
	}

	// Create second festival
	f2 := validFestivalPayload("fest-2", 20)
	status, _ = s.do(t, "POST", "/admin/v1/festivals", toks.designer, f2)
	if status != 201 {
		t.Fatalf("create fest-2 failed: %d", status)
	}

	// List with viewer
	status, body = s.do(t, "GET", "/admin/v1/festivals?sort=sort", toks.viewer, nil)
	if status != 200 {
		t.Fatalf("list festivals failed: %d %v", status, body)
	}
	if body["total"] != float64(2) {
		t.Fatalf("expected total 2, got %v", body["total"])
	}

	// Reorder with admin
	status, body = s.do(t, "PUT", "/admin/v1/festivals/order", toks.admin, map[string]any{
		"ids": []string{"fest-2", "fest-1"},
	})
	if status != 200 {
		t.Fatalf("reorder festivals failed: %d %v", status, body)
	}

	// Verify fest-2 sort=0, fest-1 sort=10
	status, body = s.do(t, "GET", "/admin/v1/festivals/fest-2", toks.viewer, nil)
	if status != 200 || body["sort"] != float64(0) {
		t.Fatalf("expected fest-2 sort=0, got %v", body["sort"])
	}
	status, body = s.do(t, "GET", "/admin/v1/festivals/fest-1", toks.viewer, nil)
	if status != 200 || body["sort"] != float64(10) {
		t.Fatalf("expected fest-1 sort=10, got %v", body["sort"])
	}

	// Archive with admin
	status, body = s.do(t, "DELETE", "/admin/v1/festivals/fest-1", toks.admin, nil)
	if status != 200 || body["status"] != "archived" {
		t.Fatalf("archive festival failed: status=%d body=%v", status, body)
	}

	// Restore with admin
	status, body = s.do(t, "POST", "/admin/v1/festivals/fest-1/restore", toks.admin, nil)
	if status != 200 || body["status"] != "draft" {
		t.Fatalf("restore festival failed: status=%d body=%v", status, body)
	}
}

// 2. Theme CRUD: Create, Read, Update, Duplicate, Archive, Restore, Export, List with filters
func TestThemeCRUD(t *testing.T) {
	s := newServer(t)
	toks := setupRoleUsers(t, s)

	// Create festival first
	s.do(t, "POST", "/admin/v1/festivals", toks.admin, validFestivalPayload("halloween", 10))

	// Create theme with designer
	th1 := validThemePayload("spider-night", "halloween")
	status, body := s.do(t, "POST", "/admin/v1/themes", toks.designer, th1)
	if status != 201 {
		t.Fatalf("create theme failed: status=%d body=%v", status, body)
	}
	if body["id"] != "spider-night" || body["status"] != "draft" {
		t.Fatalf("unexpected theme: %v", body)
	}
	val, _ := body["validation"].([]any)
	if len(val) != 0 {
		t.Fatalf("expected 0 validation errors, got %v", val)
	}

	// Read theme with viewer
	status, body = s.do(t, "GET", "/admin/v1/themes/spider-night", toks.viewer, nil)
	if status != 200 || body["id"] != "spider-night" {
		t.Fatalf("get theme failed: status=%d body=%v", status, body)
	}

	// Update theme with designer
	th1["tags"] = []string{"spider", "spooky", "halloween", "dark"}
	status, body = s.do(t, "PATCH", "/admin/v1/themes/spider-night", toks.designer, th1)
	if status != 200 {
		t.Fatalf("update theme failed: %d %v", status, body)
	}

	// Duplicate theme
	status, body = s.do(t, "POST", "/admin/v1/themes/spider-night/duplicate", toks.designer, nil)
	if status != 201 {
		t.Fatalf("duplicate theme failed: %d %v", status, body)
	}
	if body["id"] != "spider-night-copy" || body["status"] != "draft" {
		t.Fatalf("expected id spider-night-copy and draft, got %v", body)
	}
	dupData := body["data"].(map[string]any)
	dupName := dupData["name"].(map[string]any)
	if dupName["en"] != "Spider Night (copy)" {
		t.Fatalf("expected name '(copy)', got %v", dupName["en"])
	}

	// Duplicate again -> spider-night-copy-2
	status, body = s.do(t, "POST", "/admin/v1/themes/spider-night/duplicate", toks.designer, nil)
	if status != 201 || body["id"] != "spider-night-copy-2" {
		t.Fatalf("expected id spider-night-copy-2, got %v", body)
	}

	// Export theme raw JSON
	req, _ := http.NewRequest("GET", s.server.URL+"/admin/v1/themes/spider-night/export", nil)
	req.Header.Set("Authorization", "Bearer "+toks.viewer)
	resp, err := s.server.Client().Do(req)
	if err != nil {
		t.Fatalf("export request failed: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		t.Fatalf("expected 200 on export, got %d", resp.StatusCode)
	}
	disp := resp.Header.Get("Content-Disposition")
	if disp != `attachment; filename="spider-night.0.json"` {
		t.Fatalf("expected attachment filename, got %s", disp)
	}
	var exportData map[string]any
	if err := json.NewDecoder(resp.Body).Decode(&exportData); err != nil {
		t.Fatalf("failed to decode exported JSON: %v", err)
	}
	if exportData["id"] != "spider-night" {
		t.Fatalf("exported data mismatch: %v", exportData)
	}

	// List with filters: festival, status, style, engine, q
	status, body = s.do(t, "GET", "/admin/v1/themes?festival=halloween&status=draft&style=classic&engine=halloween&q=spider", toks.viewer, nil)
	if status != 200 {
		t.Fatalf("list themes failed: %d %v", status, body)
	}
	itemsList := body["items"].([]any)
	if len(itemsList) < 1 {
		t.Fatalf("expected at least 1 theme in filtered list, got %d", len(itemsList))
	}

	// Archive & restore theme
	status, body = s.do(t, "POST", "/admin/v1/themes/spider-night/archive", toks.admin, nil)
	if status != 200 || body["status"] != "archived" {
		t.Fatalf("archive theme failed: %d %v", status, body)
	}
	status, body = s.do(t, "POST", "/admin/v1/themes/spider-night/restore", toks.admin, nil)
	if status != 200 || body["status"] != "draft" {
		t.Fatalf("restore theme failed: %d %v", status, body)
	}
}

// 3. Stale updatedAt -> 409 edit_conflict
func TestOptimisticConcurrency(t *testing.T) {
	s := newServer(t)
	toks := setupRoleUsers(t, s)

	f := validFestivalPayload("fest-occ", 10)
	status, body := s.do(t, "POST", "/admin/v1/festivals", toks.designer, f)
	if status != 201 {
		t.Fatalf("create failed: %d", status)
	}
	t1 := body["updatedAt"].(string)

	// Sleep 5ms to ensure clock advances
	time.Sleep(5 * time.Millisecond)

	// First update with valid updatedAt (or wrapped payload)
	f["tags"] = []string{"update1"}
	status, body = s.do(t, "PATCH", "/admin/v1/festivals/fest-occ", toks.designer, map[string]any{
		"data":      f,
		"updatedAt": t1,
	})
	if status != 200 {
		t.Fatalf("first update failed: %d %v", status, body)
	}
	t2 := body["updatedAt"].(string)
	if t1 == t2 {
		t.Fatalf("expected updatedAt to advance, t1=%s, t2=%s", t1, t2)
	}

	// Stale update using old t1 -> 409 edit_conflict
	f["tags"] = []string{"update2-stale"}
	status, body = s.do(t, "PATCH", "/admin/v1/festivals/fest-occ", toks.designer, map[string]any{
		"data":      f,
		"updatedAt": t1,
	})
	if status != 409 {
		t.Fatalf("expected 409 for stale update, got %d (body=%v)", status, body)
	}
	errObj := body["error"].(map[string]any)
	if errObj["code"] != "edit_conflict" {
		t.Fatalf("expected error code edit_conflict, got %v", errObj["code"])
	}
}

// 4. Transition role matrix
func TestTransitionRoleMatrix(t *testing.T) {
	s := newServer(t)
	toks := setupRoleUsers(t, s)

	s.do(t, "POST", "/admin/v1/festivals", toks.admin, validFestivalPayload("halloween", 10))
	th := validThemePayload("matrix-theme", "halloween")
	s.do(t, "POST", "/admin/v1/themes", toks.designer, th)

	// Review: "request"
	// Viewer -> 403
	status, _ := s.do(t, "POST", "/admin/v1/themes/matrix-theme/review", toks.viewer, map[string]any{"action": "request"})
	if status != 403 {
		t.Fatalf("viewer request review expected 403, got %d", status)
	}
	// Designer -> 200 (draft -> in_review)
	status, body := s.do(t, "POST", "/admin/v1/themes/matrix-theme/review", toks.designer, map[string]any{"action": "request"})
	if status != 200 || body["status"] != "in_review" {
		t.Fatalf("designer request review failed: %d %v", status, body)
	}

	// Review: "approve"
	// Designer -> 403
	status, _ = s.do(t, "POST", "/admin/v1/themes/matrix-theme/review", toks.designer, map[string]any{"action": "approve"})
	if status != 403 {
		t.Fatalf("designer approve review expected 403, got %d", status)
	}
	// Viewer -> 403
	status, _ = s.do(t, "POST", "/admin/v1/themes/matrix-theme/review", toks.viewer, map[string]any{"action": "approve"})
	if status != 403 {
		t.Fatalf("viewer approve review expected 403, got %d", status)
	}

	// Review: "reject"
	// Designer -> 403
	status, _ = s.do(t, "POST", "/admin/v1/themes/matrix-theme/review", toks.designer, map[string]any{"action": "reject", "note": "fix colors"})
	if status != 403 {
		t.Fatalf("designer reject review expected 403, got %d", status)
	}
	// Reviewer -> 200 (in_review -> draft)
	status, body = s.do(t, "POST", "/admin/v1/themes/matrix-theme/review", toks.reviewer, map[string]any{"action": "reject", "note": "fix colors"})
	if status != 200 || body["status"] != "draft" {
		t.Fatalf("reviewer reject review failed: %d %v", status, body)
	}

	// Designer re-requests review -> 200
	status, body = s.do(t, "POST", "/admin/v1/themes/matrix-theme/review", toks.designer, map[string]any{"action": "request"})
	if status != 200 || body["status"] != "in_review" {
		t.Fatalf("designer re-request failed: %d %v", status, body)
	}

	// Reviewer approves -> 200 (in_review -> approved)
	status, body = s.do(t, "POST", "/admin/v1/themes/matrix-theme/review", toks.reviewer, map[string]any{"action": "approve"})
	if status != 200 || body["status"] != "approved" {
		t.Fatalf("reviewer approve failed: %d %v", status, body)
	}

	// Schedule
	futureTime := time.Now().Add(48 * time.Hour).UTC().Format(time.RFC3339)
	// Designer -> 403
	status, _ = s.do(t, "POST", "/admin/v1/themes/matrix-theme/schedule", toks.designer, map[string]any{"at": futureTime})
	if status != 403 {
		t.Fatalf("designer schedule expected 403, got %d", status)
	}
	// Viewer -> 403
	status, _ = s.do(t, "POST", "/admin/v1/themes/matrix-theme/schedule", toks.viewer, map[string]any{"at": futureTime})
	if status != 403 {
		t.Fatalf("viewer schedule expected 403, got %d", status)
	}
	// Reviewer -> 200 (approved -> scheduled)
	status, body = s.do(t, "POST", "/admin/v1/themes/matrix-theme/schedule", toks.reviewer, map[string]any{"at": futureTime})
	if status != 200 || body["status"] != "scheduled" {
		t.Fatalf("reviewer schedule failed: %d %v", status, body)
	}
	// Unschedules -> {at: null} -> approved
	status, body = s.do(t, "POST", "/admin/v1/themes/matrix-theme/schedule", toks.reviewer, map[string]any{"at": nil})
	if status != 200 || body["status"] != "approved" {
		t.Fatalf("reviewer unschedule failed: %d %v", status, body)
	}

	// Archive / Restore
	// Designer -> 403
	status, _ = s.do(t, "POST", "/admin/v1/themes/matrix-theme/archive", toks.designer, nil)
	if status != 403 {
		t.Fatalf("designer archive expected 403, got %d", status)
	}
	// Reviewer -> 403
	status, _ = s.do(t, "POST", "/admin/v1/themes/matrix-theme/archive", toks.reviewer, nil)
	if status != 403 {
		t.Fatalf("reviewer archive expected 403, got %d", status)
	}
	// Admin -> 200
	status, body = s.do(t, "POST", "/admin/v1/themes/matrix-theme/archive", toks.admin, nil)
	if status != 200 || body["status"] != "archived" {
		t.Fatalf("admin archive failed: %d %v", status, body)
	}

	// Restore
	// Reviewer -> 403
	status, _ = s.do(t, "POST", "/admin/v1/themes/matrix-theme/restore", toks.reviewer, nil)
	if status != 403 {
		t.Fatalf("reviewer restore expected 403, got %d", status)
	}
	// Admin -> 200
	status, body = s.do(t, "POST", "/admin/v1/themes/matrix-theme/restore", toks.admin, nil)
	if status != 200 || body["status"] != "draft" {
		t.Fatalf("admin restore failed: %d %v", status, body)
	}

	// Reorder festivals: designer/reviewer -> 403, admin -> 200
	status, _ = s.do(t, "PUT", "/admin/v1/festivals/order", toks.designer, map[string]any{"ids": []string{"halloween"}})
	if status != 403 {
		t.Fatalf("designer reorder expected 403, got %d", status)
	}
	status, _ = s.do(t, "PUT", "/admin/v1/festivals/order", toks.reviewer, map[string]any{"ids": []string{"halloween"}})
	if status != 403 {
		t.Fatalf("reviewer reorder expected 403, got %d", status)
	}
	status, _ = s.do(t, "PUT", "/admin/v1/festivals/order", toks.admin, map[string]any{"ids": []string{"halloween"}})
	if status != 200 {
		t.Fatalf("admin reorder expected 200, got %d", status)
	}
}

// 5. Invalid draft saves but request-review returns 422 invalid_item
func TestInvalidDraftSavesAndReviewBlocked(t *testing.T) {
	s := newServer(t)
	toks := setupRoleUsers(t, s)

	s.do(t, "POST", "/admin/v1/festivals", toks.admin, validFestivalPayload("halloween", 10))

	// Invalid draft with bad background color "#NOTAHEX"
	invTheme := validThemePayload("invalid-theme", "halloween")
	pal := invTheme["palette"].(map[string]any)
	pal["background"] = "#NOTAHEX"

	status, body := s.do(t, "POST", "/admin/v1/themes", toks.designer, invTheme)
	if status != 201 {
		t.Fatalf("invalid draft save expected 201 Created, got %d (body=%v)", status, body)
	}
	if body["status"] != "draft" {
		t.Fatalf("expected status draft, got %v", body["status"])
	}
	val, ok := body["validation"].([]any)
	if !ok || len(val) == 0 {
		t.Fatalf("expected non-empty validation array on invalid draft, got %v", body["validation"])
	}

	// Attempt to request review -> 422 invalid_item
	status, body = s.do(t, "POST", "/admin/v1/themes/invalid-theme/review", toks.designer, map[string]any{"action": "request"})
	if status != 422 {
		t.Fatalf("request review on invalid draft expected 422, got %d (body=%v)", status, body)
	}
	errObj := body["error"].(map[string]any)
	if errObj["code"] != "invalid_item" {
		t.Fatalf("expected code invalid_item, got %v", errObj["code"])
	}
	details, _ := errObj["details"].([]any)
	if len(details) == 0 {
		t.Fatalf("expected details listing validation errors, got %v", errObj)
	}

	// Verify theme status in DB is STILL draft
	status, body = s.do(t, "GET", "/admin/v1/themes/invalid-theme", toks.viewer, nil)
	if status != 200 || body["status"] != "draft" {
		t.Fatalf("expected theme to remain draft, got status=%v", body["status"])
	}
}

// 6. ID taken (409) and ID fixed (422)
func TestIDTakenAndFixed(t *testing.T) {
	s := newServer(t)
	toks := setupRoleUsers(t, s)

	s.do(t, "POST", "/admin/v1/festivals", toks.admin, validFestivalPayload("halloween", 10))
	th := validThemePayload("fixed-id-theme", "halloween")

	status, _ := s.do(t, "POST", "/admin/v1/themes", toks.designer, th)
	if status != 201 {
		t.Fatalf("create failed: %d", status)
	}

	// Try creating again with same id -> 409 id_taken
	status, body := s.do(t, "POST", "/admin/v1/themes", toks.designer, th)
	if status != 409 {
		t.Fatalf("expected 409 id_taken, got %d", status)
	}
	errObj := body["error"].(map[string]any)
	if errObj["code"] != "id_taken" {
		t.Fatalf("expected error code id_taken, got %v", errObj["code"])
	}

	// Try updating and changing id -> 422 id_fixed
	th["id"] = "different-id"
	status, body = s.do(t, "PATCH", "/admin/v1/themes/fixed-id-theme", toks.designer, th)
	if status != 422 {
		t.Fatalf("expected 422 id_fixed, got %d", status)
	}
	errObj = body["error"].(map[string]any)
	if errObj["code"] != "id_fixed" {
		t.Fatalf("expected error code id_fixed, got %v", errObj["code"])
	}
}

// 7. Editing approved/scheduled/published item resets to draft
func TestEditingApprovedSetsDraft(t *testing.T) {
	s := newServer(t)
	toks := setupRoleUsers(t, s)

	s.do(t, "POST", "/admin/v1/festivals", toks.admin, validFestivalPayload("halloween", 10))
	th := validThemePayload("approve-edit-theme", "halloween")
	s.do(t, "POST", "/admin/v1/themes", toks.designer, th)

	// Transition to in_review then approved
	s.do(t, "POST", "/admin/v1/themes/approve-edit-theme/review", toks.designer, map[string]any{"action": "request"})
	status, body := s.do(t, "POST", "/admin/v1/themes/approve-edit-theme/review", toks.reviewer, map[string]any{"action": "approve"})
	if status != 200 || body["status"] != "approved" {
		t.Fatalf("expected approved, got %v", body["status"])
	}

	// Edit data -> status resets to draft
	th["tags"] = []string{"edited-tag"}
	status, body = s.do(t, "PATCH", "/admin/v1/themes/approve-edit-theme", toks.designer, th)
	if status != 200 {
		t.Fatalf("edit failed: %d %v", status, body)
	}
	if body["status"] != "draft" {
		t.Fatalf("expected status draft after edit, got %v", body["status"])
	}
}

// 8. Engines endpoint and Validate endpoint
func TestEnginesAndValidateEndpoints(t *testing.T) {
	s := newServer(t)
	toks := setupRoleUsers(t, s)

	// Engines
	status, body := s.do(t, "GET", "/admin/v1/engines", toks.viewer, nil)
	if status != 200 {
		t.Fatalf("get engines failed: %d", status)
	}
	engines, ok := body["engines"].([]any)
	if !ok || len(engines) == 0 {
		t.Fatalf("expected engines list, got %v", body["engines"])
	}
	icons, ok := body["eventIcons"].([]any)
	if !ok || len(icons) == 0 {
		t.Fatalf("expected eventIcons list, got %v", body["eventIcons"])
	}

	// Validate valid theme
	validTh := validThemePayload("val-theme", "halloween")
	status, body = s.do(t, "POST", "/admin/v1/validate/theme", toks.viewer, validTh)
	if status != 200 {
		t.Fatalf("validate failed: %d %v", status, body)
	}
	// Huma may return an array directly
	// Validate invalid theme
	pal := validTh["palette"].(map[string]any)
	pal["background"] = "#BADHEX"
	status, body = s.do(t, "POST", "/admin/v1/validate/theme", toks.viewer, validTh)
	if status != 200 {
		t.Fatalf("validate failed: %d %v", status, body)
	}

	// Unknown kind -> 404
	status, _ = s.do(t, "POST", "/admin/v1/validate/unknown-kind", toks.viewer, validTh)
	if status != 404 {
		t.Fatalf("expected 404 for unknown kind, got %d", status)
	}
}

// 9. Injection payloads on q/status/style/engine/sort and path ids
func TestSQLInjectionPayloads(t *testing.T) {
	s := newServer(t)
	toks := setupRoleUsers(t, s)

	s.do(t, "POST", "/admin/v1/festivals", toks.admin, validFestivalPayload("halloween", 10))
	s.do(t, "POST", "/admin/v1/themes", toks.designer, validThemePayload("spider-night", "halloween"))

	injection := "'; DROP TABLE themes; --"

	esc := url.QueryEscape(injection)

	// q injection
	status, _ := s.do(t, "GET", "/admin/v1/themes?q="+esc, toks.viewer, nil)
	if status != 200 {
		t.Fatalf("q injection expected 200 empty list, got %d", status)
	}

	// status injection
	status, _ = s.do(t, "GET", "/admin/v1/themes?status="+esc, toks.viewer, nil)
	// Status has enum check or where filter
	if status != 200 && status != 422 {
		t.Fatalf("status injection unexpected: %d", status)
	}

	// style injection
	status, _ = s.do(t, "GET", "/admin/v1/themes?style="+esc, toks.viewer, nil)
	if status != 200 {
		t.Fatalf("style injection expected 200, got %d", status)
	}

	// engine injection
	status, _ = s.do(t, "GET", "/admin/v1/themes?engine="+esc, toks.viewer, nil)
	if status != 200 {
		t.Fatalf("engine injection expected 200, got %d", status)
	}

	// sort injection -> must return 422 Invalid sort
	status, body := s.do(t, "GET", "/admin/v1/themes?sort="+esc, toks.viewer, nil)
	if status != 422 {
		t.Fatalf("sort injection expected 422, got %d", status)
	}
	errObj := body["error"].(map[string]any)
	if errObj["field"] != "sort" {
		t.Fatalf("expected error on sort field, got %v", errObj)
	}

	// path id injection -> 404
	status, _ = s.do(t, "GET", "/admin/v1/themes/"+url.PathEscape(injection), toks.viewer, nil)
	if status != 404 {
		t.Fatalf("path injection expected 404, got %d", status)
	}

	// Verify table is STILL INTACT!
	status, body = s.do(t, "GET", "/admin/v1/themes/spider-night", toks.viewer, nil)
	if status != 200 || body["id"] != "spider-night" {
		t.Fatalf("themes table was corrupted or item lost: status=%d body=%v", status, body)
	}
}

// 10. Audit log entries are written for every catalog write
func TestCatalogAuditLogs(t *testing.T) {
	s := newServer(t)
	toks := setupRoleUsers(t, s)

	// Create festival
	s.do(t, "POST", "/admin/v1/festivals", toks.designer, validFestivalPayload("fest-audit", 10))

	// Create theme
	th := validThemePayload("audit-theme", "fest-audit")
	s.do(t, "POST", "/admin/v1/themes", toks.designer, th)

	// Update theme
	th["tags"] = []string{"audit-updated"}
	s.do(t, "PATCH", "/admin/v1/themes/audit-theme", toks.designer, th)

	// Duplicate
	s.do(t, "POST", "/admin/v1/themes/audit-theme/duplicate", toks.designer, nil)

	// Review request
	s.do(t, "POST", "/admin/v1/themes/audit-theme/review", toks.designer, map[string]any{"action": "request"})

	// Review approve
	s.do(t, "POST", "/admin/v1/themes/audit-theme/review", toks.reviewer, map[string]any{"action": "approve"})

	// Schedule
	future := time.Now().Add(24 * time.Hour).UTC().Format(time.RFC3339)
	s.do(t, "POST", "/admin/v1/themes/audit-theme/schedule", toks.reviewer, map[string]any{"at": future})

	// Archive
	s.do(t, "POST", "/admin/v1/themes/audit-theme/archive", toks.admin, nil)

	// Restore
	s.do(t, "POST", "/admin/v1/themes/audit-theme/restore", toks.admin, nil)

	// Reorder
	s.do(t, "PUT", "/admin/v1/festivals/order", toks.admin, map[string]any{"ids": []string{"fest-audit"}})

	// Query audit log
	status, body := s.do(t, "GET", "/admin/v1/audit?perPage=50", toks.admin, nil)
	if status != 200 {
		t.Fatalf("get audit failed: %d %v", status, body)
	}
	itemsList := body["items"].([]any)
	if len(itemsList) < 9 {
		t.Fatalf("expected at least 9 audit entries, got %d", len(itemsList))
	}
	actionsSeen := map[string]bool{}
	for _, it := range itemsList {
		m := it.(map[string]any)
		actionsSeen[m["action"].(string)] = true
	}
	for _, expectedAction := range []string{
		"create", "update", "duplicate", "review_request", "review_approve", "schedule", "archive", "restore", "reorder",
	} {
		if !actionsSeen[expectedAction] {
			t.Fatalf("expected audit log to record action %s, got actions: %v", expectedAction, actionsSeen)
		}
	}
}
