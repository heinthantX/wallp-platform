package migrations

import (
	"context"

	"github.com/uptrace/bun"
)

var up0002 = `alter table festivals add column published_data {json};
alter table themes add column published_data {json};
alter table wallpapers add column published_data {json};
alter table fonts add column published_data {json};
alter table icon_packs add column published_data {json};
alter table banners add column published_data {json}`

var down0002 = `alter table banners drop column published_data;
alter table icon_packs drop column published_data;
alter table fonts drop column published_data;
alter table wallpapers drop column published_data;
alter table themes drop column published_data;
alter table festivals drop column published_data`

func init() {
	Migrations.MustRegister(func(ctx context.Context, db *bun.DB) error {
		return exec(ctx, db, up0002)
	}, func(ctx context.Context, db *bun.DB) error {
		return exec(ctx, db, down0002)
	})
}
