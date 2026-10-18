// Package migrations holds schema changes that run on Postgres and SQLite.
// DDL is written once with placeholders that each dialect fills in:
//
//	{json}   jsonb       / text
//	{ts}     timestamptz / timestamp
//	{serial} bigserial   / integer (with autoincrement on the pk)
package migrations

import (
	"context"
	"strings"

	"github.com/uptrace/bun"
	"github.com/uptrace/bun/migrate"
)

var Migrations = migrate.NewMigrations()

// exec runs portable DDL statements separated by ";\n".
func exec(ctx context.Context, db *bun.DB, ddl string) error {
	pg := db.Dialect().Name().String() == "pg"
	r := strings.NewReplacer(
		"{json}", pick(pg, "jsonb", "text"),
		"{ts}", pick(pg, "timestamptz", "timestamp"),
		"{serial_pk}", pick(pg, "bigserial primary key", "integer primary key autoincrement"),
	)
	for _, stmt := range strings.Split(r.Replace(ddl), ";\n") {
		if strings.TrimSpace(stmt) == "" {
			continue
		}
		if _, err := db.ExecContext(ctx, stmt); err != nil {
			return err
		}
	}
	return nil
}

func pick(pg bool, a, b string) string {
	if pg {
		return a
	}
	return b
}
