package migrations

import (
	"context"

	"github.com/uptrace/bun"
)

// TOTP replay protection and per-user MFA lockout.
var up0006 = `alter table admin_users add column totp_last_step bigint;
alter table admin_users add column mfa_failed_count integer not null default 0;
alter table admin_users add column mfa_locked_until {ts};
create table setup_lock (id integer primary key, created_at {ts} not null)`

var down0006 = `drop table setup_lock;
alter table admin_users drop column mfa_locked_until;
alter table admin_users drop column mfa_failed_count;
alter table admin_users drop column totp_last_step`

func init() {
	Migrations.MustRegister(func(ctx context.Context, db *bun.DB) error {
		return exec(ctx, db, up0006)
	}, func(ctx context.Context, db *bun.DB) error {
		return exec(ctx, db, down0006)
	})
}
