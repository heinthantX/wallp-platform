package migrations

import (
	"context"

	"github.com/uptrace/bun"
)

var up0007 = itemTable("categories", ",\n  published_data {json}")

var down0007 = `drop table if exists categories`

func init() {
	Migrations.MustRegister(func(ctx context.Context, db *bun.DB) error {
		return exec(ctx, db, up0007)
	}, func(ctx context.Context, db *bun.DB) error {
		return exec(ctx, db, down0007)
	})
}
