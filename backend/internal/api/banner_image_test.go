package api_test

import (
	"image/color"
	"net/http"
	"testing"
)

// P3: banners may carry an optional look.image; release checks treat it like every other asset.
func TestBannerImageChecks(t *testing.T) {
	t.Run("missing asset", func(t *testing.T) {
		s := importedServer(t)
		mutate(t, s, "banners", "halloween-2026", func(m map[string]any) {
			m["look"].(map[string]any)["image"] = map[string]any{
				"url":    "/assets/0000000000000000000000000000000000000000000000000000000000000000.png",
				"sha256": "0000000000000000000000000000000000000000000000000000000000000000", "bytes": 10, "format": "png",
			}
		})
		rep := runChecks(t, s)
		for _, i := range rep.Errors {
			if i.Code == "asset_missing" && i.ItemID == "halloween-2026" && i.Field == "look.image" {
				return
			}
		}
		t.Fatalf("want asset_missing on look.image, got %v", codes(rep.Errors))
	})

	t.Run("stored asset passes, low title contrast warns", func(t *testing.T) {
		s := importedServer(t)
		toks := setupRoleUsers(t, s)
		img := generateSolidPNG(t, 64, 64, color.RGBA{R: 250, G: 250, B: 250, A: 255})
		status, a := uploadAssetMultipart(t, s, toks.designer, "/admin/v1/assets", "file", "banner.png", img)
		if status != http.StatusOK {
			t.Fatalf("upload: %d %v", status, a)
		}
		mutate(t, s, "banners", "halloween-2026", func(m map[string]any) {
			look := m["look"].(map[string]any)
			look["titleColor"] = "#FFFFFF"
			look["image"] = map[string]any{"url": a["url"], "sha256": a["sha256"], "bytes": a["bytes"], "format": a["format"]}
		})
		rep := runChecks(t, s)
		for _, i := range rep.Errors {
			if i.ItemID == "halloween-2026" {
				t.Fatalf("unexpected error on banner: %v", codes(rep.Errors))
			}
		}
		if !has(rep.Warnings, "banner_image_contrast", "halloween-2026") {
			t.Fatalf("want banner_image_contrast, got %v", codes(rep.Warnings))
		}
	})
}
