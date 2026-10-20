package api_test

import (
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/heinthant/wallp-backend/internal/api"
	"github.com/heinthant/wallp-backend/internal/checks"
)

// checkNow is a fixed clock so festival date checks do not drift.
var checkNow = time.Date(2026, 10, 18, 0, 0, 0, 0, time.UTC)

func importedServer(t *testing.T) *testServer {
	t.Helper()
	if _, err := os.Stat(mockCatalogDir); err != nil {
		t.Skipf("mock catalog not found at %s", mockCatalogDir)
	}
	s := newServer(t)
	if _, err := api.RunImportDir(t.Context(), s.deps, mockCatalogDir, "test"); err != nil {
		t.Fatalf("import: %v", err)
	}
	return s
}

func runChecks(t *testing.T, s *testServer) checks.Report {
	t.Helper()
	rep, err := checks.RunAt(t.Context(), s.db, s.deps.Cfg.StorageDir, checkNow)
	if err != nil {
		t.Fatalf("checks: %v", err)
	}
	return rep
}

// mutate rewrites an item's JSON in both data and published_data.
func mutate(t *testing.T, s *testServer, table, id string, f func(m map[string]any)) {
	t.Helper()
	var raw []byte
	if err := s.db.NewSelect().Table(table).Column("data").Where("id = ?", id).Scan(t.Context(), &raw); err != nil {
		t.Fatalf("read %s/%s: %v", table, id, err)
	}
	var m map[string]any
	if err := json.Unmarshal(raw, &m); err != nil {
		t.Fatalf("parse %s/%s: %v", table, id, err)
	}
	f(m)
	b, _ := json.Marshal(m)
	if _, err := s.db.NewUpdate().Table(table).Set("data = ?", string(b)).Set("published_data = ?", string(b)).Where("id = ?", id).Exec(t.Context()); err != nil {
		t.Fatalf("write %s/%s: %v", table, id, err)
	}
}

func has(issues []checks.Issue, code, itemID string) bool {
	for _, i := range issues {
		if i.Code == code && (itemID == "" || i.ItemID == itemID) {
			return true
		}
	}
	return false
}

func codes(issues []checks.Issue) []string {
	out := []string{}
	for _, i := range issues {
		out = append(out, i.Code+":"+i.ItemID)
	}
	return out
}

func TestChecksMockCatalog(t *testing.T) {
	s := importedServer(t)
	rep := runChecks(t, s)
	// The app's own mock catalog must publish: no errors.
	if len(rep.Errors) != 0 {
		t.Fatalf("unexpected errors: %+v", rep.Errors)
	}
	// Snowy Pines accents (Berry red 2.0:1, Pine 1.8:1) are under 3:1: the app says "Hard to read here", so a warning.
	// Collections (Heroes, Neon) have no dates; scene themes need no preview image.
	got := codes(rep.Warnings)
	if len(got) != 2 || got[0] != "accent_contrast_low:christmas-eve" || got[1] != "accent_contrast_low:christmas-eve" {
		t.Fatalf("unexpected warnings: %v", got)
	}
	if len(rep.Infos) != 0 {
		t.Fatalf("unexpected infos: %+v", rep.Infos)
	}
}

func appendLayer(m map[string]any, layer map[string]any) {
	p := m["scene"].(map[string]any)["params"].(map[string]any)
	layers, _ := p["layers"].([]any)
	p["layers"] = append(layers, layer)
}

func TestChecksNegative(t *testing.T) {
	type tc struct {
		name, code, id string
		mut            func(t *testing.T, s *testServer)
	}
	for _, c := range []tc{
		{"contrast", "contrast_too_low", "spider-night", func(t *testing.T, s *testServer) {
			mutate(t, s, "themes", "spider-night", func(m map[string]any) {
				m["palette"].(map[string]any)["text"] = m["palette"].(map[string]any)["background"]
			})
		}},
		{"hard ref", "ref_missing", "christmas-eve", func(t *testing.T, s *testServer) {
			mutate(t, s, "themes", "christmas-eve", func(m map[string]any) { m["iconPackId"] = "nope" })
		}},
		{"soft ref", "ref_missing", "halloween", func(t *testing.T, s *testServer) {
			mutate(t, s, "festivals", "halloween", func(m map[string]any) { m["coverThemeId"] = "ghost" })
		}},
		{"banner target", "banner_target_missing", "halloween-2026", func(t *testing.T, s *testServer) {
			mutate(t, s, "banners", "halloween-2026", func(m map[string]any) { m["action"].(map[string]any)["id"] = "ghost" })
		}},
		{"scene limits", "scene_limits", "spider-night", func(t *testing.T, s *testServer) {
			mutate(t, s, "themes", "spider-night", func(m map[string]any) {
				appendLayer(m, map[string]any{"type": "particles", "effect": "snow", "count": 999, "color": "#FFFFFF"})
			})
		}},
		{"banner time order", "banner_time_order", "halloween-2026", func(t *testing.T, s *testServer) {
			mutate(t, s, "banners", "halloween-2026", func(m map[string]any) {
				m["startsAt"], m["endsAt"] = "2026-11-02T00:00:00Z", "2026-11-01T00:00:00Z"
			})
		}},
		{"font license", "font_license", "creepster", func(t *testing.T, s *testServer) {
			mutate(t, s, "fonts", "creepster", func(m map[string]any) { m["license"] = "GPL-3.0" })
		}},
		{"id changed", "id_changed", "neon-night", func(t *testing.T, s *testServer) {
			mutate(t, s, "themes", "neon-night", func(m map[string]any) { m["id"] = "other-night" })
		}},
		{"scene tokens in wallpaper", "scene_tokens", "neon-horizon", func(t *testing.T, s *testServer) {
			mutate(t, s, "wallpapers", "neon-horizon", func(m map[string]any) {
				appendLayer(m, map[string]any{"type": "gradient", "colors": []string{"@background", "#000000"}})
			})
		}},
		{"myanmar glyphs", "myanmar_glyphs_missing", "thingyan-water", func(t *testing.T, s *testServer) {
			mutate(t, s, "fonts", "baloo-2", func(m map[string]any) { delete(m, "fallbackFor") })
		}},
		{"asset sha mismatch", "asset_sha_mismatch", "creepster", func(t *testing.T, s *testServer) {
			var raw []byte
			if err := s.db.NewSelect().Table("fonts").Column("data").Where("id = ?", "creepster").Scan(t.Context(), &raw); err != nil {
				t.Fatal(err)
			}
			var f struct {
				Files []struct {
					Asset struct{ SHA256, Format string } `json:"asset"`
				} `json:"files"`
			}
			if err := json.Unmarshal(raw, &f); err != nil {
				t.Fatal(err)
			}
			a := f.Files[0].Asset
			if err := os.WriteFile(filepath.Join(s.deps.Cfg.StorageDir, "assets", a.SHA256+"."+a.Format), []byte("tampered"), 0o644); err != nil {
				t.Fatal(err)
			}
		}},
	} {
		t.Run(c.name, func(t *testing.T) {
			s := importedServer(t)
			c.mut(t, s)
			rep := runChecks(t, s)
			if !has(rep.Errors, c.code, c.id) {
				t.Fatalf("want error %s on %s, got %v", c.code, c.id, codes(rep.Errors))
			}
		})
	}
}

func TestChecksEndpoint(t *testing.T) {
	s := importedServer(t)
	toks := setupRoleUsers(t, s)
	if status, _ := s.do(t, "POST", "/admin/v1/releases/check", toks.viewer, nil); status != http.StatusForbidden {
		t.Fatalf("viewer: want 403, got %d", status)
	}
	status, body := s.do(t, "POST", "/admin/v1/releases/check", toks.reviewer, nil)
	if status != http.StatusOK {
		t.Fatalf("reviewer: want 200, got %d: %v", status, body)
	}
	for _, k := range []string{"errors", "warnings", "infos"} {
		if _, ok := body[k].([]any); !ok {
			t.Fatalf("%s must be an array, got %T", k, body[k])
		}
	}
}
