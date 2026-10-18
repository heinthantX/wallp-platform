package migrations

import (
	"context"
	"strings"

	"github.com/uptrace/bun"
)

const itemColumns = `
  id text primary key,
  status text not null,
  festival_id text,
  sort integer not null default 0,
  search text not null default '',
  data {json} not null,
  rev integer not null default 0,
  published_hash text not null default '',
  first_published {ts},
  scheduled_at {ts},
  created_by text not null,
  updated_by text not null,
  created_at {ts} not null,
  updated_at {ts} not null`

func itemTable(name, extra string) string {
	return `create table ` + name + ` (` + itemColumns + extra + `);
create index ` + name + `_status_idx on ` + name + ` (status);
create index ` + name + `_festival_idx on ` + name + ` (festival_id);
`
}

var up0001 = `
create table admin_users (
  id text primary key,
  email text not null unique,
  name text not null,
  password_hash text not null,
  role text not null,
  totp_secret text,
  totp_enabled boolean not null default false,
  disabled boolean not null default false,
  last_login_at {ts},
  created_at {ts} not null,
  updated_at {ts} not null
);
create table app_users (
  id text primary key,
  email text not null unique,
  display_name text not null,
  password_hash text not null,
  created_at {ts} not null,
  updated_at {ts} not null
);
create table refresh_tokens (
  id text primary key,
  subject_kind text not null,
  user_id text not null,
  family_id text not null,
  token_hash text not null unique,
  expires_at {ts} not null,
  revoked_at {ts},
  user_agent text not null default '',
  ip text not null default '',
  created_at {ts} not null
);
create index refresh_tokens_user_idx on refresh_tokens (subject_kind, user_id);
create index refresh_tokens_family_idx on refresh_tokens (family_id);
create table app_installs (
  install_id text primary key,
  app_user_id text references app_users(id) on delete set null,
  app_version text not null default '',
  last_seen_at {ts} not null,
  created_at {ts} not null
);
create table favourites (
  app_user_id text not null references app_users(id) on delete cascade,
  item_type text not null,
  item_id text not null,
  created_at {ts} not null,
  primary key (app_user_id, item_type, item_id)
);
create table audit_log (
  id {serial_pk},
  user_id text,
  user_name text not null default '',
  action text not null,
  item_type text not null,
  item_id text not null,
  before {json},
  after {json},
  at {ts} not null
);
create index audit_log_item_idx on audit_log (item_type, item_id);
create index audit_log_at_idx on audit_log (at);
` + itemTable("festivals", "") +
	itemTable("themes", `,
  style text not null default '',
  engine text not null default '',
  generated_from {json},
  review_note text not null default ''`) +
	itemTable("wallpapers", `,
  kind text not null default ''`) +
	itemTable("fonts", `,
  family text not null default '',
  category text not null default '',
  listed boolean not null default true`) +
	itemTable("icon_packs", `,
  kind text not null default ''`) +
	itemTable("banners", `,
  starts_at {ts},
  ends_at {ts}`) + `
create table store_settings (
  id integer primary key,
  accent_presets {json} not null,
  search_suggestions {json} not null,
  updated_at {ts} not null
);
create table assets (
  sha256 text primary key,
  format text not null,
  mime text not null,
  bytes bigint not null,
  width integer not null default 0,
  height integer not null default 0,
  meta {json},
  created_by text not null default '',
  created_at {ts} not null
);
create table releases (
  id {serial_pk},
  target text not null,
  version text not null,
  manifest {json} not null,
  changes {json} not null,
  notes text not null default '',
  current boolean not null default false,
  published_by text not null,
  published_at {ts} not null
);
create unique index releases_target_version_idx on releases (target, version);
create table events (
  id {serial_pk},
  install_id text not null,
  app_user_id text,
  type text not null,
  item_id text not null,
  at {ts} not null,
  created_at {ts} not null
);
create index events_item_idx on events (type, item_id, at);
create index events_install_idx on events (install_id, created_at)
`

var tables0001 = []string{
	"events", "releases", "assets", "store_settings", "banners", "icon_packs", "fonts",
	"wallpapers", "themes", "festivals", "audit_log", "favourites", "app_installs",
	"refresh_tokens", "app_users", "admin_users",
}

func init() {
	Migrations.MustRegister(func(ctx context.Context, db *bun.DB) error {
		return exec(ctx, db, up0001)
	}, func(ctx context.Context, db *bun.DB) error {
		return exec(ctx, db, "drop table if exists "+strings.Join(tables0001, ";\ndrop table if exists "))
	})
}
