package api

import (
	"context"
	"encoding/json"
	"net/http"
	"time"

	"github.com/danielgtaylor/huma/v2"

	"github.com/heinthant/wallp-backend/internal/auth"
	"github.com/heinthant/wallp-backend/internal/model"
)

type AuditView struct {
	ID       int64           `json:"id"`
	UserID   *string         `json:"userId,omitempty"`
	UserName string          `json:"userName"`
	Action   string          `json:"action"`
	ItemType string          `json:"itemType"`
	ItemID   string          `json:"itemId"`
	Before   json.RawMessage `json:"before,omitempty"`
	After    json.RawMessage `json:"after,omitempty"`
	At       time.Time       `json:"at"`
}

type ListAuditInput struct {
	ListParams
	ItemType string `query:"itemType" maxLength:"40"`
	ItemID   string `query:"itemId" maxLength:"100"`
	UserID   string `query:"userId" maxLength:"100"`
	Action   string `query:"action" maxLength:"40"`
}

type ListAuditOutput struct{ Body Page[AuditView] }

var auditSorts = map[string]string{"at": "at", "itemType": "item_type", "action": "action"}

func registerAudit(h huma.API, d *Deps) {
	huma.Register(h, auth.Admin(huma.Operation{OperationID: "list-audit", Method: http.MethodGet, Path: adminPrefix + "/audit",
		Summary: "Audit log", Description: "Who changed what and when, with before and after JSON.", Tags: []string{"Audit"}},
		model.RoleAdmin, model.RoleReviewer),
		func(ctx context.Context, in *ListAuditInput) (*ListAuditOutput, error) {
			var rows []model.AuditEntry
			q := whereSearch(d.DB.NewSelect().Model(&rows), in.Q, "item_id", "user_name")
			for col, v := range map[string]string{"item_type": in.ItemType, "item_id": in.ItemID, "user_id": in.UserID, "action": in.Action} {
				if v != "" {
					q = q.Where("? = ?", ident(col), v)
				}
			}
			q, err := paginate(q, in.ListParams, auditSorts, "-at")
			if err != nil {
				return nil, err
			}
			total, err := q.ScanAndCount(ctx)
			if err != nil {
				return nil, err
			}
			out := &ListAuditOutput{Body: Page[AuditView]{Items: []AuditView{}, Total: int(total), Page: in.Page, PerPage: in.PerPage}}
			for _, r := range rows {
				out.Body.Items = append(out.Body.Items, AuditView{ID: r.ID, UserID: r.UserID, UserName: r.UserName,
					Action: r.Action, ItemType: r.ItemType, ItemID: r.ItemID,
					Before: json.RawMessage(r.Before), After: json.RawMessage(r.After), At: r.At})
			}
			return out, nil
		})
}
