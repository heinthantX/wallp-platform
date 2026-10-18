package api_test

import (
	"net/http"
	"strings"
	"testing"
)

// B17 (loop-2 P4): CORS answers depend on Origin, so responses must say Vary: Origin, or a copy
// cached by an <img> (no Origin) is reused for a fetch() and fails with "Failed to fetch".
func TestResponsesVaryOnOrigin(t *testing.T) {
	s := newServer(t)
	res, err := http.Get(s.server.URL + "/catalog/v1/manifest.json")
	if err != nil {
		t.Fatal(err)
	}
	res.Body.Close()
	if !strings.Contains(strings.Join(res.Header.Values("Vary"), ","), "Origin") {
		t.Fatalf("Vary = %q, want it to include Origin", res.Header.Values("Vary"))
	}
}
