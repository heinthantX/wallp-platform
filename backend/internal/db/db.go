// Package db opens a Bun database on Postgres or SQLite, chosen by the URL.
package db

import (
	"context"
	"database/sql"
	"fmt"
	"strings"

	"github.com/uptrace/bun"
	"github.com/uptrace/bun/dialect/pgdialect"
	"github.com/uptrace/bun/dialect/sqlitedialect"
	"github.com/uptrace/bun/driver/pgdriver"
	"github.com/uptrace/bun/migrate"

	"github.com/heinthant/wallp-backend/internal/db/migrations"
	_ "modernc.org/sqlite" // pure-Go driver, registers "sqlite"
)

// Open connects to postgres://… / postgresql://… or file:… / sqlite:… URLs.
func Open(url string) (*bun.DB, error) {
	switch {
	case strings.HasPrefix(url, "postgres://"), strings.HasPrefix(url, "postgresql://"):
		sqldb := sql.OpenDB(pgdriver.NewConnector(pgdriver.WithDSN(url)))
		return bun.NewDB(sqldb, pgdialect.New()), nil
	case strings.HasPrefix(url, "file:"), strings.HasPrefix(url, "sqlite:"):
		dsn := strings.TrimPrefix(url, "sqlite:")
		sqldb, err := sql.Open("sqlite", withPragmas(dsn))
		if err != nil {
			return nil, err
		}
		// SQLite allows one writer; a single connection avoids SQLITE_BUSY.
		// ponytail: one connection, use WAL + a read pool if read load grows.
		sqldb.SetMaxOpenConns(1)
		return bun.NewDB(sqldb, sqlitedialect.New()), nil
	}
	return nil, fmt.Errorf("db: unsupported DATABASE_URL scheme (want postgres:// or file:)")
}

func withPragmas(dsn string) string {
	sep := "?"
	if strings.Contains(dsn, "?") {
		sep = "&"
	}
	return dsn + sep + "_pragma=foreign_keys(1)&_pragma=journal_mode(WAL)&_pragma=busy_timeout(5000)&_time_format=sqlite"
}

// IsSQLite reports the dialect, for the rare query that differs.
func IsSQLite(db bun.IDB) bool {
	return db.Dialect().Name().String() == "sqlite"
}

// Migrate applies every pending migration.
func Migrate(ctx context.Context, db *bun.DB) error {
	m := migrate.NewMigrator(db, migrations.Migrations)
	if err := m.Init(ctx); err != nil {
		return err
	}
	if err := m.Lock(ctx); err != nil {
		return err
	}
	defer m.Unlock(ctx) //nolint:errcheck
	_, err := m.Migrate(ctx)
	return err
}

// Rollback undoes the last migration group.
func Rollback(ctx context.Context, db *bun.DB) error {
	m := migrate.NewMigrator(db, migrations.Migrations)
	if err := m.Lock(ctx); err != nil {
		return err
	}
	defer m.Unlock(ctx) //nolint:errcheck
	_, err := m.Rollback(ctx)
	return err
}
