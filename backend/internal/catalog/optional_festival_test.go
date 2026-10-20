package catalog_test

import (
	"testing"

	"github.com/heinthant/wallp-backend/internal/catalog"
)

// Festival and publishedAt are optional: drafts carry neither, and the release stamps publishedAt.
func TestNoFestivalNoPublishedAtIsValid(t *testing.T) {
	th := baseValidTheme()
	th.FestivalID, th.PublishedAt = "", ""
	w := baseValidWallpaper()
	w.FestivalID, w.PublishedAt = "", ""
	p := baseValidIconPack()
	p.FestivalID, p.PublishedAt = "", ""
	for name, errs := range map[string][]catalog.FieldError{"theme": th.Validate(), "wallpaper": w.Validate(), "iconPack": p.Validate()} {
		if len(errs) != 0 {
			t.Errorf("%s: unexpected errors %+v", name, errs)
		}
	}
	th.PublishedAt = "2026-10-20 10:00"
	if len(th.Validate()) == 0 {
		t.Error("a non-empty, non-UTC publishedAt must still fail")
	}
}

func TestCategoryFestivalIDs(t *testing.T) {
	c := catalog.Category{ID: "myanmar", Name: catalog.Localized{"en": "Myanmar"}, FestivalIDs: []string{"thingyan", "thingyan", "Bad_Id"}}
	got := map[string]bool{}
	for _, e := range c.Validate() {
		got[e.Field+" "+e.Code] = true
	}
	if !got["festivalIds[1] duplicate_id"] || !got["festivalIds[2] invalid_id"] || len(got) != 2 {
		t.Fatalf("unexpected errors: %v", got)
	}
}
