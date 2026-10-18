package api_test

import (
	"encoding/json"
	"image/color"
	"net/http"
	"testing"
)

// P6: icon packs may map Android package names to their own drawn icon.
func TestIconPackAppsChecks(t *testing.T) {
	upload := func(t *testing.T, s *testServer, token string, w, h int) map[string]any {
		t.Helper()
		img := generateSolidPNG(t, w, h, color.RGBA{R: 200, G: 30, B: 50, A: 255})
		status, a := uploadAssetMultipart(t, s, token, "/admin/v1/assets", "file", "icon.png", img)
		if status != http.StatusOK {
			t.Fatalf("upload: %d %v", status, a)
		}
		return map[string]any{"url": a["url"], "sha256": a["sha256"], "bytes": a["bytes"], "format": a["format"]}
	}
	setApps := func(t *testing.T, s *testServer, apps map[string]any) {
		mutate(t, s, "icon_packs", "web-slinger", func(m map[string]any) { m["apps"] = apps })
	}
	t.Run("good square icons pass", func(t *testing.T) {
		s := importedServer(t)
		toks := setupRoleUsers(t, s)
		setApps(t, s, map[string]any{"com.whatsapp": upload(t, s, toks.designer, 256, 256)})
		rep := runChecks(t, s)
		for _, i := range append(rep.Errors, rep.Warnings...) {
			if i.ItemID == "web-slinger" {
				t.Fatalf("unexpected issue on pack: %v %v", codes(rep.Errors), codes(rep.Warnings))
			}
		}
	})

	t.Run("bad package, small, not square, duplicate", func(t *testing.T) {
		s := importedServer(t)
		toks := setupRoleUsers(t, s)
		square := upload(t, s, toks.designer, 256, 256)
		setApps(t, s, map[string]any{
			"not a package":          upload(t, s, toks.designer, 300, 300),
			"com.small.app":          upload(t, s, toks.designer, 100, 100),
			"com.wide.app":           upload(t, s, toks.designer, 300, 200),
			"com.whatsapp":           square,
			"org.telegram.messenger": square,
		})
		rep := runChecks(t, s)
		for _, want := range []string{"icon_app_bad_package", "icon_app_too_small", "icon_app_not_square"} {
			if !has(rep.Errors, want, "web-slinger") {
				t.Errorf("want error %s, got %v", want, codes(rep.Errors))
			}
		}
		if !has(rep.Warnings, "icon_app_duplicate", "web-slinger") {
			t.Errorf("want warning icon_app_duplicate, got %v", codes(rep.Warnings))
		}
	})
}

func TestIconPackAppsSaveRoundTrip(t *testing.T) {
	s := newServer(t)
	toks := setupRoleUsers(t, s)
	img := generateSolidPNG(t, 256, 256, color.RGBA{R: 10, G: 120, B: 60, A: 255})
	status, a := uploadAssetMultipart(t, s, toks.designer, "/admin/v1/assets", "file", "com.whatsapp.png", img)
	if status != http.StatusOK {
		t.Fatalf("upload: %d %v", status, a)
	}
	asset := map[string]any{"url": a["url"], "sha256": a["sha256"], "bytes": a["bytes"], "format": a["format"]}
	status, body := s.do(t, "POST", "/admin/v1/icon-packs", toks.designer, map[string]any{
		"id": "xmas-apps", "festivalId": "christmas", "name": map[string]any{"en": "Xmas apps"}, "style": map[string]any{"en": "Drawn"},
		"kind": "images", "shape": "squircle", "glyph": "#FFFFFF", "ring": "#FFFFFF", "background": asset,
		"apps": map[string]any{"com.whatsapp": asset},
	})
	if status != http.StatusCreated && status != http.StatusOK {
		t.Fatalf("create: %d %v", status, body)
	}
	status, got := s.do(t, "GET", "/admin/v1/icon-packs/xmas-apps", toks.designer, nil)
	if status != http.StatusOK {
		t.Fatalf("get: %d", status)
	}
	var data map[string]any
	switch d := got["data"].(type) {
	case string:
		_ = json.Unmarshal([]byte(d), &data)
	case map[string]any:
		data = d
	}
	apps, _ := data["apps"].(map[string]any)
	if apps["com.whatsapp"] == nil {
		t.Fatalf("apps not saved: %v", data["apps"])
	}
}
