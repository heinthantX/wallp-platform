package releases

import (
	"context"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/uptrace/bun"

	"github.com/heinthant/wallp-backend/internal/apierr"
	"github.com/heinthant/wallp-backend/internal/db"
)

func TestFailGateBacksOffUntilEditOrTimeout(t *testing.T) {
	g := failGate{every: time.Minute}
	now := time.Date(2026, 10, 20, 3, 0, 0, 0, time.UTC)
	errA := apierr.Invalid("x", "4 check error(s)")

	if !g.ready(now, "m1") {
		t.Fatal("a fresh gate must be ready")
	}
	if !g.failed(now, "m1", errA) {
		t.Fatal("the first failure must be logged")
	}
	if g.ready(now.Add(time.Minute), "m1") {
		t.Fatal("retried before the backoff ran out")
	}
	if !g.ready(now.Add(time.Minute), "m2") {
		t.Fatal("an item edit must allow a retry")
	}
	if !g.ready(now.Add(2*time.Minute), "m1") {
		t.Fatal("the backoff ran out but the gate is closed")
	}
	if g.failed(now.Add(2*time.Minute), "m1", errA) {
		t.Fatal("the same failure must not be logged again")
	}
	if g.ready(now.Add(5*time.Minute), "m1") {
		t.Fatal("the backoff did not double")
	}
	for range 10 {
		g.failed(now, "m1", errA)
	}
	if g.backoff != time.Hour {
		t.Fatalf("backoff = %v, want the 1h cap", g.backoff)
	}
	if !g.failed(now, "m1", apierr.Invalid("x", "other")) {
		t.Fatal("a different failure must be logged")
	}
	g.reset()
	if !g.ready(now, "m1") || !g.failed(now, "m1", errA) {
		t.Fatal("reset must clear the backoff and the last error")
	}
}

func TestEditMarkChangesOnItemEdit(t *testing.T) {
	ctx := context.Background()
	bdb := openTestDB(t)

	m1, err := editMark(ctx, bdb)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := bdb.ExecContext(ctx, `INSERT INTO categories (id, status, sort, search, data, rev, created_by, updated_by, created_at, updated_at)
		VALUES ('dark', 'draft', 0, '', '{}', 0, 't', 't', ?, ?)`, time.Now().UTC(), time.Now().UTC()); err != nil {
		t.Fatal(err)
	}
	m2, err := editMark(ctx, bdb)
	if err != nil {
		t.Fatal(err)
	}
	if m1 == m2 {
		t.Fatalf("mark did not change: %q", m1)
	}
}

func openTestDB(t *testing.T) *bun.DB {
	t.Helper()
	ctx := context.Background()
	url := os.Getenv("TEST_DATABASE_URL")
	if url == "" {
		url = "file:" + filepath.Join(t.TempDir(), "test.db")
	}
	bdb, err := db.Open(url)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = bdb.Close() })
	if os.Getenv("TEST_DATABASE_URL") != "" {
		if _, err := bdb.ExecContext(ctx, "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"); err != nil {
			t.Fatal(err)
		}
	}
	if err := db.Migrate(ctx, bdb); err != nil {
		t.Fatal(err)
	}
	return bdb
}
