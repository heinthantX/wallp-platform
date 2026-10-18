package migrations

import (
	"context"

	"github.com/uptrace/bun"
)

// status: building|live|superseded|rolled_back|failed. The summary of what
// changed lives in the existing "changes" column.
var up0005 = `alter table releases add column status text not null default 'live';
alter table releases add column catalog_sha256 text not null default ''`

var down0005 = `alter table releases drop column catalog_sha256;
alter table releases drop column status`

func init() {
	Migrations.MustRegister(func(ctx context.Context, db *bun.DB) error {
		return exec(ctx, db, up0005)
	}, func(ctx context.Context, db *bun.DB) error {
		return exec(ctx, db, down0005)
	})
}
