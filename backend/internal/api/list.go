package api

import (
	"strings"

	"github.com/uptrace/bun"

	"github.com/heinthant/wallp-backend/internal/apierr"
)

// ListParams are the shared paging, sorting and search query params.
type ListParams struct {
	Page    int    `query:"page" minimum:"1" default:"1"`
	PerPage int    `query:"perPage" minimum:"1" maximum:"200" default:"50"`
	Sort    string `query:"sort" maxLength:"40" doc:"Field name, '-' prefix for descending, e.g. -updatedAt"`
	Q       string `query:"q" maxLength:"100" doc:"Search text"`
}

type Page[T any] struct {
	Items   []T `json:"items"`
	Total   int `json:"total"`
	Page    int `json:"page"`
	PerPage int `json:"perPage"`
}

// paginate applies sort (API name → column, from an allowlist only: never
// user text in SQL) and limit/offset.
func paginate(q *bun.SelectQuery, p ListParams, sortable map[string]string, def string) (*bun.SelectQuery, error) {
	s := p.Sort
	if s == "" {
		s = def
	}
	desc := strings.HasPrefix(s, "-")
	col, ok := sortable[strings.TrimPrefix(s, "-")]
	if !ok {
		return nil, apierr.Invalid("sort", "Can't sort by "+strings.TrimPrefix(s, "-"))
	}
	dir := "ASC"
	if desc {
		dir = "DESC"
	}
	if p.PerPage == 0 {
		p.PerPage = 50
	}
	if p.Page == 0 {
		p.Page = 1
	}
	return q.OrderExpr("? "+dir, bun.Ident(col)).Limit(int64(p.PerPage)).Offset(int64((p.Page - 1) * p.PerPage)), nil
}

// likeContains builds a LIKE pattern that matches s literally (with ESCAPE '\').
func likeContains(s string) string {
	r := strings.NewReplacer(`\`, `\\`, `%`, `\%`, `_`, `\_`)
	return "%" + r.Replace(strings.ToLower(s)) + "%"
}

// whereSearch adds a case-insensitive contains filter over the given columns.
func whereSearch(q *bun.SelectQuery, text string, cols ...string) *bun.SelectQuery {
	text = strings.TrimSpace(text)
	if text == "" {
		return q
	}
	pat := likeContains(text)
	return q.WhereGroup(" AND ", func(q *bun.SelectQuery) *bun.SelectQuery {
		for _, c := range cols {
			q = q.WhereOr("LOWER(?) LIKE ? ESCAPE '\\'", bun.Ident(c), pat)
		}
		return q
	})
}

// ident quotes a column name. Only call it with names written in code.
func ident(col string) bun.Ident { return bun.Ident(col) }
