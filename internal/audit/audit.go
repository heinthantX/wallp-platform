// Package audit records who changed what (dashboard doc §4.11).
package audit

import (
	"context"
	"encoding/json"
	"time"

	"github.com/uptrace/bun"

	"github.com/heinthant/wallp-backend/internal/auth"
	"github.com/heinthant/wallp-backend/internal/model"
)

// Record writes one entry as the caller in ctx. before/after are marshalled
// to JSON; pass nil for create (before) or delete (after).
func Record(ctx context.Context, db bun.IDB, action, itemType, itemID string, before, after any) error {
	e := &model.AuditEntry{Action: action, ItemType: itemType, ItemID: itemID,
		Before: toJSON(before), After: toJSON(after), At: time.Now().UTC()}
	if p := auth.From(ctx); p != nil {
		e.UserID, e.UserName = &p.ID, p.Name
	} else {
		e.UserName = "system"
	}
	_, err := db.NewInsert().Model(e).Exec(ctx)
	return err
}

func toJSON(v any) model.JSON {
	switch x := v.(type) {
	case nil:
		return nil
	case model.JSON:
		return x
	}
	b, err := json.Marshal(v)
	if err != nil {
		return nil
	}
	return b
}
