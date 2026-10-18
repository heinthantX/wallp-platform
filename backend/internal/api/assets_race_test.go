package api_test

import (
	"image/color"
	"net/http"
	"sync"
	"testing"
)

// B16 (loop-2 P6): the same file uploaded twice at once (bulk per-app icons) must not 500 on the unique sha256.
func TestAssetUploadConcurrentSameBytes(t *testing.T) {
	s := newServer(t)
	toks := setupRoleUsers(t, s)
	img := generateSolidPNG(t, 64, 64, color.RGBA{R: 1, G: 2, B: 3, A: 255})

	const n = 6
	statuses := make([]int, n)
	var wg sync.WaitGroup
	for i := range n {
		wg.Add(1)
		go func() {
			defer wg.Done()
			statuses[i], _ = uploadAssetMultipart(t, s, toks.designer, "/admin/v1/assets", "file", "same.png", img)
		}()
	}
	wg.Wait()
	for i, st := range statuses {
		if st != http.StatusOK {
			t.Fatalf("upload %d: status %d, want 200 (all: %v)", i, st, statuses)
		}
	}
}
