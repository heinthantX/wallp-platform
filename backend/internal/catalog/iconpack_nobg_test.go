package catalog_test

import "testing"

// An image pack with no background and no tile is transparent: only the app logo is drawn.
func TestImagePackWithoutBackgroundIsValid(t *testing.T) {
	p := baseValidIconPack()
	p.Kind = "images"
	p.Painter = nil
	p.Background = nil
	p.Tile = nil
	if errs := p.Validate(); len(errs) != 0 {
		t.Fatalf("unexpected errors: %+v", errs)
	}
}
