package api_test

import (
	"testing"
	"time"
)

// Quick themes save their wallpaper as a draft; approving or scheduling the theme must
// carry that wallpaper along, or the release ships a theme with a missing wallpaper.
func TestThemeApproveCarriesDraftWallpaper(t *testing.T) {
	s := newServer(t)
	toks := setupRoleUsers(t, s)
	s.do(t, "POST", "/admin/v1/festivals", toks.admin, validFestivalPayload("halloween", 10))
	s.do(t, "POST", "/admin/v1/wallpapers", toks.designer, validWallpaperPayload("quick-wall", "halloween"))
	th := validThemePayload("quick-theme", "halloween")
	th["wallpaperIds"] = []string{"quick-wall"}
	if status, body := s.do(t, "POST", "/admin/v1/themes", toks.designer, th); status != 201 {
		t.Fatalf("create theme: %d %v", status, body)
	}
	wall := func() map[string]any {
		_, body := s.do(t, "GET", "/admin/v1/wallpapers/quick-wall", toks.admin, nil)
		return body
	}

	if status, body := s.do(t, "POST", "/admin/v1/themes/quick-theme/review", toks.admin, map[string]any{"action": "approve"}); status != 200 {
		t.Fatalf("approve theme: %d %v", status, body)
	}
	if w := wall(); w["status"] != "approved" {
		t.Fatalf("wallpaper after theme approve = %v, want approved", w["status"])
	}

	at := time.Now().Add(48 * time.Hour).UTC().Format(time.RFC3339)
	if status, body := s.do(t, "POST", "/admin/v1/themes/quick-theme/schedule", toks.reviewer, map[string]any{"at": at}); status != 200 {
		t.Fatalf("schedule theme: %d %v", status, body)
	}
	if w := wall(); w["status"] != "scheduled" || w["scheduledAt"] == nil {
		t.Fatalf("wallpaper after theme schedule = %v at %v, want scheduled", w["status"], w["scheduledAt"])
	}

	if status, body := s.do(t, "POST", "/admin/v1/themes/quick-theme/schedule", toks.reviewer, map[string]any{"at": nil}); status != 200 {
		t.Fatalf("unschedule theme: %d %v", status, body)
	}
	if w := wall(); w["status"] != "approved" {
		t.Fatalf("wallpaper after theme unschedule = %v, want approved", w["status"])
	}
}

// Admins skip the approve step: Save draft, then Schedule release.
func TestAdminSchedulesDraftDirectly(t *testing.T) {
	s := newServer(t)
	toks := setupRoleUsers(t, s)
	s.do(t, "POST", "/admin/v1/festivals", toks.admin, validFestivalPayload("halloween", 10))
	s.do(t, "POST", "/admin/v1/wallpapers", toks.designer, validWallpaperPayload("draft-wall", "halloween"))
	th := validThemePayload("draft-theme", "halloween")
	th["wallpaperIds"] = []string{"draft-wall"}
	s.do(t, "POST", "/admin/v1/themes", toks.designer, th)
	at := time.Now().Add(48 * time.Hour).UTC().Format(time.RFC3339)

	if status, _ := s.do(t, "POST", "/admin/v1/themes/draft-theme/schedule", toks.reviewer, map[string]any{"at": at}); status == 200 {
		t.Fatal("reviewer scheduled a draft; want it to need approval first")
	}
	status, body := s.do(t, "POST", "/admin/v1/themes/draft-theme/schedule", toks.admin, map[string]any{"at": at})
	if status != 200 || body["status"] != "scheduled" {
		t.Fatalf("admin schedule draft: %d %v", status, body)
	}
	if _, w := s.do(t, "GET", "/admin/v1/wallpapers/draft-wall", toks.admin, nil); w["status"] != "scheduled" {
		t.Fatalf("draft wallpaper = %v, want scheduled with its theme", w["status"])
	}
}
