package migrations

import (
	"context"

	"github.com/uptrace/bun"
)

var up0004 = `alter table assets add column blurhash text;
alter table assets add column dominant text`

var down0004 = `alter table assets drop column dominant;
alter table assets drop column blurhash`

func init() {
	Migrations.MustRegister(func(ctx context.Context, db *bun.DB) error {
		return exec(ctx, db, up0004)
	}, func(ctx context.Context, db *bun.DB) error {
		return exec(ctx, db, down0004)
	})
}
