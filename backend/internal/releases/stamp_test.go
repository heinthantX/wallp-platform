package releases

import (
	"testing"
	"time"
)

func TestStampPublishedAt(t *testing.T) {
	now := time.Date(2026, 10, 20, 9, 30, 0, 0, time.FixedZone("MMT", 23400))
	out, err := stampPublishedAt([]byte(`{"id":"a","publishedAt":""}`), now)
	if err != nil || string(out) != `{"id":"a","publishedAt":"2026-10-20T03:00:00Z"}` {
		t.Fatalf("got %s, %v", out, err)
	}
	keep := []byte(`{"publishedAt":"2026-01-01T00:00:00Z"}`)
	if out, _ := stampPublishedAt(keep, now); string(out) != string(keep) {
		t.Fatalf("existing publishedAt was changed: %s", out)
	}
}
