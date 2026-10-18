package items_test

import (
	"context"
	"errors"
	"net/http"
	"path/filepath"
	"testing"

	"github.com/heinthant/wallp-backend/internal/apierr"
	"github.com/heinthant/wallp-backend/internal/db"
	"github.com/heinthant/wallp-backend/internal/items"
	"github.com/heinthant/wallp-backend/internal/model"
)

const validFestival = `{"id":"thadingyut","name":{"en":"Thadingyut"},"kind":"collection","sort":10,"look":{"background":"#111111","surface":"#222222","surface2":"#333333","outline":"#444444","nav":"#555555","muted":"#666666","brand":"#777777","displayFont":"padauk"}}`

func newFestivals(t *testing.T) *items.Store {
	t.Helper()
	ctx := context.Background()
	bdb, err := db.Open("file:" + filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	t.Cleanup(func() { bdb.Close() })
	if err := db.Migrate(ctx, bdb); err != nil {
		t.Fatalf("migrate: %v", err)
	}
	return items.NewStore(bdb, items.FestivalKind)
}

func wantStatus(t *testing.T, err error, status int, code string) {
	t.Helper()
	var ae *apierr.Error
	if !errors.As(err, &ae) {
		t.Fatalf("want *apierr.Error, got %v", err)
	}
	if ae.GetStatus() != status || (code != "" && ae.Err.Code != code) {
		t.Fatalf("want %d/%q, got %d/%q", status, code, ae.GetStatus(), ae.Err.Code)
	}
}

func TestAdminApproveDraft(t *testing.T) {
	ctx := context.Background()
	s := newFestivals(t)
	if _, err := s.Create(ctx, []byte(validFestival), "admin"); err != nil {
		t.Fatal(err)
	}

	_, err := s.Transition(ctx, "thadingyut", "approve", nil, "rev", model.RoleReviewer)
	wantStatus(t, err, http.StatusConflict, "invalid_state")

	v, err := s.Transition(ctx, "thadingyut", "approve", nil, "admin", model.RoleAdmin)
	if err != nil {
		t.Fatalf("admin approve draft: %v", err)
	}
	if v.Status != model.StatusApproved {
		t.Fatalf("want approved, got %s", v.Status)
	}
}

func TestAdminApproveInvalidDraft(t *testing.T) {
	ctx := context.Background()
	s := newFestivals(t)
	bad := `{"id":"bad-one","name":{"en":""},"kind":"dated","sort":10,"look":{"background":"nope"}}`
	if _, err := s.Create(ctx, []byte(bad), "admin"); err != nil {
		t.Fatal(err)
	}
	_, err := s.Transition(ctx, "bad-one", "approve", nil, "admin", model.RoleAdmin)
	if err == nil {
		t.Fatal("want validation error")
	}
	wantStatus(t, err, http.StatusUnprocessableEntity, "")
}

func TestDesignerCannotApprove(t *testing.T) {
	ctx := context.Background()
	s := newFestivals(t)
	if _, err := s.Create(ctx, []byte(validFestival), "admin"); err != nil {
		t.Fatal(err)
	}
	if _, err := s.Transition(ctx, "thadingyut", "request", nil, "des", model.RoleDesigner); err != nil {
		t.Fatal(err)
	}
	_, err := s.Transition(ctx, "thadingyut", "approve", nil, "des", model.RoleDesigner)
	wantStatus(t, err, http.StatusForbidden, "")
}
