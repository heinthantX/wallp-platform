package items_test

import (
	"context"
	"path/filepath"
	"testing"

	"github.com/heinthant/wallp-backend/internal/db"
	"github.com/heinthant/wallp-backend/internal/items"
)

func TestStoreBasics(t *testing.T) {
	ctx := context.Background()
	dbPath := filepath.Join(t.TempDir(), "test.db")
	bdb, err := db.Open("file:" + dbPath)
	if err != nil {
		t.Fatalf("failed to open test db: %v", err)
	}
	defer bdb.Close()

	if err := db.Migrate(ctx, bdb); err != nil {
		t.Fatalf("failed to migrate: %v", err)
	}

	festivals := items.NewStore(bdb, items.FestivalKind)

	data := []byte(`{"id":"thadingyut","name":{"en":"Thadingyut"},"kind":"dated","sort":10,"look":{"background":"#111111","surface":"#222222","surface2":"#333333","outline":"#444444","nav":"#555555","muted":"#666666","brand":"#777777","displayFont":"padauk"}}`)
	item, err := festivals.Create(ctx, data, "admin")
	if err != nil {
		t.Fatalf("failed to create festival: %v", err)
	}
	if item.ID != "thadingyut" {
		t.Fatalf("expected id thadingyut, got %s", item.ID)
	}

	got, err := festivals.Get(ctx, "thadingyut")
	if err != nil {
		t.Fatalf("failed to get festival: %v", err)
	}
	if got.ID != "thadingyut" {
		t.Fatalf("expected id thadingyut, got %s", got.ID)
	}

	list, err := festivals.List(ctx, items.ListFilter{Page: 1, PerPage: 10})
	if err != nil {
		t.Fatalf("failed to list festivals: %v", err)
	}
	if list.Total != 1 || len(list.Items) != 1 {
		t.Fatalf("expected 1 festival in list, got total=%d len=%d", list.Total, len(list.Items))
	}
}
