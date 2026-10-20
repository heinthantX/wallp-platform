// Package releases turns approved catalog items into the public files
// (theme-api §3): theme files, catalog.<version>.json, then manifest.json last.
package releases

import (
	"bytes"
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"math"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/uptrace/bun"

	"github.com/heinthant/wallp-backend/internal/apierr"
	"github.com/heinthant/wallp-backend/internal/audit"
	"github.com/heinthant/wallp-backend/internal/catalog"
	"github.com/heinthant/wallp-backend/internal/checks"
	"github.com/heinthant/wallp-backend/internal/items"
	"github.com/heinthant/wallp-backend/internal/model"
	"github.com/heinthant/wallp-backend/internal/stats"
)

// Checker runs the pre-publish checks.
type Checker func(ctx context.Context) (checks.Report, error)

const (
	schemaVersion = 1
	// A "building" row older than this is a crashed publish and no longer blocks.
	staleBuilding = 10 * time.Minute
)

// ponytail: one process-wide lock; the DB "building" row also guards a second process.
var mu sync.Mutex

// Dir is where the public files live inside the storage dir.
func Dir(storageDir string) string { return filepath.Join(storageDir, "catalog", "v1") }

// Changes is stored in releases.changes ("summary" in the API).
type Changes struct {
	Text    string         `json:"text"`
	Added   map[string]int `json:"added"`
	Edited  map[string]int `json:"edited"`
	Removed map[string]int `json:"removed"`
}

type kindInfo struct {
	kind *items.Kind
	key  string // key in catalog.<version>.json
}

var kinds = []kindInfo{
	{items.FestivalKind, "festivals"},
	{items.CategoryKind, "categories"},
	{items.ThemeKind, "themes"},
	{items.WallpaperKind, "wallpapers"},
	{items.FontKind, "fonts"},
	{items.IconPackKind, "iconPacks"},
	{items.BannerKind, "banners"},
}

type catalogDoc struct {
	CatalogVersion    string                 `json:"catalogVersion"`
	Festivals         []json.RawMessage      `json:"festivals"`
	Categories        []json.RawMessage      `json:"categories"`
	Themes            []catalog.ThemeSummary `json:"themes"`
	Wallpapers        []json.RawMessage      `json:"wallpapers"`
	Fonts             []json.RawMessage      `json:"fonts"`
	IconPacks         []json.RawMessage      `json:"iconPacks"`
	Banners           []json.RawMessage      `json:"banners"`
	AccentPresets     json.RawMessage        `json:"accentPresets"`
	SearchSuggestions json.RawMessage        `json:"searchSuggestions"`
}

type goingRow struct {
	table string
	id    string
	data  []byte
	rev   int
	hash  string
}

// Publish builds a new release from the approved items.
func Publish(ctx context.Context, db *bun.DB, storageDir, actor, notes string, checker Checker, ackWarnings bool) (*model.Release, error) {
	if !mu.TryLock() {
		return nil, inProgress()
	}
	defer mu.Unlock()

	n, err := db.NewSelect().Model((*model.Release)(nil)).
		Where("target = ?", model.TargetLive).Where("status = ?", model.ReleaseBuilding).
		Where("published_at > ?", time.Now().UTC().Add(-staleBuilding)).Count(ctx)
	if err != nil {
		return nil, err
	}
	if n > 0 {
		return nil, inProgress()
	}

	if checker != nil {
		rep, err := checker(ctx)
		if err != nil {
			return nil, err
		}
		if len(rep.Errors) > 0 {
			return nil, withIssues(apierr.New(http.StatusUnprocessableEntity, "checks_failed",
				fmt.Sprintf("%d check error(s) must be fixed before publishing", len(rep.Errors))), rep.Errors)
		}
		if len(rep.Warnings) > 0 && !ackWarnings {
			return nil, withIssues(apierr.Conflict("warnings_need_ack",
				fmt.Sprintf("%d warning(s) need to be reviewed and acknowledged", len(rep.Warnings))), rep.Warnings)
		}
	}

	now := time.Now().UTC().Truncate(time.Second)
	version, err := nextVersion(ctx, db, now)
	if err != nil {
		return nil, err
	}
	rel := &model.Release{Target: model.TargetLive, Version: version, Status: model.ReleaseBuilding,
		Manifest: model.JSON("{}"), Changes: model.JSON("{}"), Notes: notes, PublishedBy: actor, PublishedAt: now}
	if _, err := db.NewInsert().Model(rel).Exec(ctx); err != nil {
		return nil, err
	}

	if err := build(ctx, db, storageDir, rel, actor, now); err != nil {
		rel.Status = model.ReleaseFailed
		_, _ = db.NewUpdate().Model(rel).Column("status").WherePK().Exec(context.WithoutCancel(ctx))
		return nil, err
	}
	return rel, nil
}

func build(ctx context.Context, db *bun.DB, storageDir string, rel *model.Release, actor string, now time.Time) error {
	dir := Dir(storageDir)
	manifestPath := filepath.Join(dir, "manifest.json")
	oldManifest, _ := os.ReadFile(manifestPath)
	wroteManifest := false

	// Read before the tx opens: SQLite has one connection.
	pop, perr := stats.Popularity(ctx, db, now)
	if perr != nil {
		slog.Warn("popularity unavailable, publishing without it", "err", perr)
	}

	err := db.RunInTx(ctx, nil, func(ctx context.Context, tx bun.Tx) error {
		doc := catalogDoc{CatalogVersion: rel.Version, Festivals: []json.RawMessage{}, Categories: []json.RawMessage{}, Themes: []catalog.ThemeSummary{},
			Wallpapers: []json.RawMessage{}, Fonts: []json.RawMessage{}, IconPacks: []json.RawMessage{}, Banners: []json.RawMessage{}}
		ch := Changes{Added: map[string]int{}, Edited: map[string]int{}, Removed: map[string]int{}}
		var going []goingRow
		var removed []goingRow

		for _, ki := range kinds {
			k := ki.kind
			var rows []items.ItemRow
			if err := tx.NewSelect().Table(k.Plural).
				Column("id", "status", "sort", "data", "published_data", "rev", "scheduled_at").
				Scan(ctx, &rows); err != nil {
				return err
			}
			sort.Slice(rows, func(i, j int) bool {
				if (k == items.FestivalKind || k == items.CategoryKind || k == items.BannerKind) && rows[i].Sort != rows[j].Sort {
					return rows[i].Sort < rows[j].Sort
				}
				return rows[i].ID < rows[j].ID
			})
			isTheme := k == items.ThemeKind
			for _, r := range rows {
				publishNow := r.Status == model.StatusApproved ||
					(r.Status == model.StatusScheduled && r.ScheduledAt != nil && !r.ScheduledAt.After(now))
				// Festivals have no review workflow: every unarchived one ships.
				if k == items.FestivalKind && r.Status != model.StatusArchived {
					publishNow = true
				}
				var src []byte
				rev := r.Rev
				switch {
				case publishNow:
					src = r.Data
					oldC, _ := canon(r.PublishedData, isTheme, 0)
					newC, err := canon(r.Data, isTheme, 0)
					if err != nil {
						return fmt.Errorf("%s %s: %w", k.Name, r.ID, err)
					}
					switch {
					case len(r.PublishedData) == 0:
						ch.Added[ki.key]++
						rev++
					case !bytes.Equal(oldC, newC):
						ch.Edited[ki.key]++
						rev++
					}
				case r.Status != model.StatusArchived && len(r.PublishedData) > 0:
					src = r.PublishedData
				case r.Status == model.StatusArchived && len(r.PublishedData) > 0:
					ch.Removed[ki.key]++
					removed = append(removed, goingRow{table: k.Plural, id: r.ID})
					continue
				default:
					continue
				}
				if rev < 1 {
					rev = 1
				}
				if publishNow && (isTheme || k == items.WallpaperKind || k == items.IconPackKind) {
					var err error
					if src, err = stampPublishedAt(src, now); err != nil {
						return fmt.Errorf("%s %s: %w", k.Name, r.ID, err)
					}
				}
				data, err := canon(src, isTheme, rev)
				if err != nil {
					return fmt.Errorf("%s %s: %w", k.Name, r.ID, err)
				}
				if publishNow {
					h := sha256.Sum256(data)
					going = append(going, goingRow{k.Plural, r.ID, data, rev, hex.EncodeToString(h[:])})
				}
				switch k {
				case items.ThemeKind:
					var t catalog.ThemeDetail
					if err := json.Unmarshal(data, &t); err != nil {
						return fmt.Errorf("theme %s: %w", r.ID, err)
					}
					if err := writeAtomic(filepath.Join(dir, "themes", fmt.Sprintf("%s.%d.json", r.ID, rev)), data); err != nil {
						return err
					}
					sum := t.Summary()
					if score := pop[r.ID]; score > 0 {
						// ponytail: the catalog field is an int, so the score is shipped x10 rounded
						p := int(math.Round(score * 10))
						sum.Popularity = &p
					}
					doc.Themes = append(doc.Themes, sum)
				case items.FestivalKind:
					doc.Festivals = append(doc.Festivals, data)
				case items.CategoryKind:
					doc.Categories = append(doc.Categories, data)
				case items.WallpaperKind:
					doc.Wallpapers = append(doc.Wallpapers, data)
				case items.FontKind:
					doc.Fonts = append(doc.Fonts, data)
				case items.IconPackKind:
					doc.IconPacks = append(doc.IconPacks, data)
				case items.BannerKind:
					doc.Banners = append(doc.Banners, data)
				}
			}
		}

		doc.AccentPresets, doc.SearchSuggestions = json.RawMessage(`{"solids":[],"gradients":[]}`), json.RawMessage(`[]`)
		var ss model.StoreSettings
		if err := tx.NewSelect().Model(&ss).Where("id = 1").Scan(ctx); err == nil {
			if len(ss.AccentPresets) > 0 {
				doc.AccentPresets = json.RawMessage(ss.AccentPresets)
			}
			if len(ss.SearchSuggestions) > 0 {
				doc.SearchSuggestions = json.RawMessage(ss.SearchSuggestions)
			}
		}

		catBytes, err := json.Marshal(doc)
		if err != nil {
			return err
		}
		sum := sha256.Sum256(catBytes)
		catName := "catalog." + rel.Version + ".json"
		if err := writeAtomic(filepath.Join(dir, catName), catBytes); err != nil {
			return err
		}
		man := catalog.Manifest{SchemaVersion: schemaVersion, CatalogVersion: rel.Version, Catalog: catName,
			CatalogSHA256: hex.EncodeToString(sum[:]), MinAppVersion: "1.0.0", // ponytail: fixed floor, derive from items' minAppVersion if needed
			PublishedAt: now.Format(time.RFC3339)}

		for _, g := range going {
			if _, err := tx.ExecContext(ctx, `UPDATE ? SET status = ?, scheduled_at = NULL, rev = ?, data = ?, published_data = ?,
 published_hash = ?, first_published = COALESCE(first_published, ?), updated_by = ?, updated_at = ? WHERE id = ?`,
				bun.Ident(g.table), model.StatusPublished, g.rev, model.JSON(g.data), model.JSON(g.data),
				g.hash, now, actor, now, g.id); err != nil {
				return err
			}
		}
		for _, g := range removed {
			if _, err := tx.ExecContext(ctx, "UPDATE ? SET published_data = NULL, published_hash = '' WHERE id = ?",
				bun.Ident(g.table), g.id); err != nil {
				return err
			}
		}

		ch.Text = summaryText(ch)
		if _, err := tx.NewUpdate().Model((*model.Release)(nil)).
			Set("status = ?", model.ReleaseSuperseded).Set("current = ?", false).
			Where("target = ?", model.TargetLive).Where("status = ?", model.ReleaseLive).Exec(ctx); err != nil {
			return err
		}
		rel.Status, rel.Current, rel.CatalogSHA256 = model.ReleaseLive, true, man.CatalogSHA256
		rel.Manifest, rel.Changes = model.MustJSON(man), model.MustJSON(ch)
		if _, err := tx.NewUpdate().Model(rel).
			Column("status", "current", "catalog_sha256", "manifest", "changes").WherePK().Exec(ctx); err != nil {
			return err
		}
		if err := audit.Record(ctx, tx, "publish", "release", rel.Version, nil, rel); err != nil {
			return err
		}
		mb, _ := manifestBytes(man)
		wroteManifest = true
		return writeAtomic(manifestPath, mb)
	})
	if err != nil && wroteManifest && len(oldManifest) > 0 {
		_ = writeAtomic(manifestPath, oldManifest)
	}
	return err
}

// Rollback points manifest.json back at an earlier release. Item rows are not
// reverted: the next publish still ships whatever is approved then.
func Rollback(ctx context.Context, db *bun.DB, storageDir, version string) (*model.Release, error) {
	if !mu.TryLock() {
		return nil, inProgress()
	}
	defer mu.Unlock()

	var rel model.Release
	var man catalog.Manifest
	var prevID int64
	var oldStatus string
	err := db.RunInTx(ctx, nil, func(ctx context.Context, tx bun.Tx) error {
		if err := tx.NewSelect().Model(&rel).Where("target = ?", model.TargetLive).Where("version = ?", version).Scan(ctx); err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				return apierr.NotFound("Release")
			}
			return err
		}
		if rel.Status != model.ReleaseLive && rel.Status != model.ReleaseSuperseded && rel.Status != model.ReleaseRolledBack {
			return apierr.Conflict("invalid_state", "Only a release that went live can be rolled back to")
		}
		if rel.Current {
			return apierr.Conflict("already_live", "That release is already live")
		}
		oldStatus = rel.Status
		if err := json.Unmarshal(rel.Manifest, &man); err != nil {
			return err
		}
		if _, err := os.Stat(filepath.Join(Dir(storageDir), filepath.Base(man.Catalog))); err != nil {
			return apierr.Conflict("files_missing", "The files of that release are no longer on disk")
		}
		if err := tx.NewSelect().Model((*model.Release)(nil)).Column("id").
			Where("target = ?", model.TargetLive).Where("current = ?", true).Scan(ctx, &prevID); err != nil && !errors.Is(err, sql.ErrNoRows) {
			return err
		}
		if _, err := tx.NewUpdate().Model((*model.Release)(nil)).
			Set("status = ?", model.ReleaseRolledBack).Set("current = ?", false).
			Where("target = ?", model.TargetLive).Where("current = ?", true).Exec(ctx); err != nil {
			return err
		}
		rel.Status, rel.Current = model.ReleaseLive, true
		if _, err := tx.NewUpdate().Model(&rel).Column("status", "current").WherePK().Exec(ctx); err != nil {
			return err
		}
		return audit.Record(ctx, tx, "rollback", "release", rel.Version, nil, rel)
	})
	if err != nil {
		return nil, err
	}
	// The DB change is committed first; the manifest is written after it.
	mb, _ := manifestBytes(man)
	if werr := writeAtomic(filepath.Join(Dir(storageDir), "manifest.json"), mb); werr != nil {
		cerr := db.RunInTx(context.WithoutCancel(ctx), nil, func(ctx context.Context, tx bun.Tx) error {
			if _, err := tx.NewUpdate().Model((*model.Release)(nil)).
				Set("status = ?", oldStatus).Set("current = ?", false).Where("id = ?", rel.ID).Exec(ctx); err != nil {
				return err
			}
			if prevID == 0 {
				return nil
			}
			_, err := tx.NewUpdate().Model((*model.Release)(nil)).
				Set("status = ?", model.ReleaseLive).Set("current = ?", true).Where("id = ?", prevID).Exec(ctx)
			return err
		})
		return nil, errors.Join(werr, cerr)
	}
	return &rel, nil
}

// Tick publishes once if any scheduled item is due. It reports whether it did.
func Tick(ctx context.Context, db *bun.DB, storageDir string, checker Checker) (bool, error) {
	now := time.Now().UTC()
	for _, ki := range kinds {
		n, err := db.NewSelect().Table(ki.kind.Plural).
			Where("status = ?", model.StatusScheduled).Where("scheduled_at <= ?", now).Count(ctx)
		if err != nil {
			return false, err
		}
		if n == 0 {
			continue
		}
		_, err = Publish(ctx, db, storageDir, "scheduler", "Scheduled publish", checker, true)
		var ae *apierr.Error
		if errors.As(err, &ae) && ae.Err.Code == "publish_in_progress" {
			return false, nil
		}
		return err == nil, err
	}
	return false, nil
}

// RunScheduler ticks until ctx is done. Errors are logged, never fatal.
// After a failed publish it waits for an item edit, or for a backoff that
// doubles up to an hour, so a blocking check is not retried every tick.
func RunScheduler(ctx context.Context, db *bun.DB, storageDir string, checker Checker, every time.Duration) {
	t := time.NewTicker(every)
	defer t.Stop()
	var lastPrune time.Time
	gate := failGate{every: every}
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			now := time.Now().UTC()
			if now.Sub(lastPrune) >= 24*time.Hour {
				if err := stats.Prune(ctx, db, now); err != nil {
					slog.Error("event retention failed", "err", err)
				} else {
					lastPrune = now
				}
			}
			mark, err := editMark(ctx, db)
			if err != nil {
				slog.Error("scheduled publish failed", "err", err)
				continue
			}
			if !gate.ready(now, mark) {
				continue
			}
			ok, err := Tick(ctx, db, storageDir, checker)
			if err != nil {
				if gate.failed(now, mark, err) {
					slog.Error("scheduled publish failed", "err", err, "issues", issueLines(err), "retry_at", gate.retryAt)
				}
				continue
			}
			gate.reset()
			if ok {
				slog.Info("scheduled publish done")
			}
		}
	}
}

// failGate holds back scheduled publishes after a failure.
type failGate struct {
	every   time.Duration
	backoff time.Duration
	retryAt time.Time
	mark    string // editMark when the last publish failed
	lastErr string
}

// ready reports whether to try a publish: no failure is pending, the backoff
// has run out, or an item changed since the failure.
func (g *failGate) ready(now time.Time, mark string) bool {
	return g.retryAt.IsZero() || !now.Before(g.retryAt) || mark != g.mark
}

// failed records a failure and reports whether it is new and worth logging.
func (g *failGate) failed(now time.Time, mark string, err error) bool {
	g.backoff = min(max(g.backoff*2, 2*g.every), time.Hour)
	g.retryAt = now.Add(g.backoff)
	g.mark = mark
	msg := strings.Join(append([]string{err.Error()}, issueLines(err)...), "\n")
	if msg == g.lastErr {
		return false
	}
	g.lastErr = msg
	return true
}

func (g *failGate) reset() {
	g.backoff, g.retryAt, g.mark, g.lastErr = 0, time.Time{}, "", ""
}

// editMark changes whenever any catalog item is added, edited or removed.
func editMark(ctx context.Context, db bun.IDB) (string, error) {
	var b strings.Builder
	for _, ki := range kinds {
		var n int
		var last sql.NullString
		if err := db.NewSelect().Table(ki.kind.Plural).ColumnExpr("COUNT(*)").ColumnExpr("MAX(updated_at)").
			Scan(ctx, &n, &last); err != nil {
			return "", err
		}
		fmt.Fprintf(&b, "%s:%d:%s;", ki.key, n, last.String)
	}
	return b.String(), nil
}

// issueLines lists the check details of a failed publish, e.g.
// "theme/x#iconPackId  ref_missing: icon pack "y" does not exist".
func issueLines(err error) []string {
	var ae *apierr.Error
	if !errors.As(err, &ae) {
		return nil
	}
	out := make([]string, 0, len(ae.Err.Details))
	for _, d := range ae.Err.Details {
		out = append(out, d.Field+"  "+d.Message)
	}
	return out
}

func inProgress() *apierr.Error {
	return apierr.Conflict("publish_in_progress", "Another publish is running, try again in a moment")
}

func withIssues(e *apierr.Error, issues []checks.Issue) *apierr.Error {
	for _, i := range issues {
		field := strings.Trim(i.ItemType+"/"+i.ItemID, "/")
		if i.Field != "" {
			field += "#" + i.Field
		}
		e.Err.Details = append(e.Err.Details, apierr.Detail{Field: field, Message: i.Code + ": " + i.Message})
	}
	return e
}

func nextVersion(ctx context.Context, db *bun.DB, now time.Time) (string, error) {
	day := now.Format("2006-01-02")
	var vs []string
	if err := db.NewSelect().Model((*model.Release)(nil)).Column("version").
		Where("target = ?", model.TargetLive).Where("version LIKE ?", day+".%").Scan(ctx, &vs); err != nil {
		return "", err
	}
	max := 0
	for _, v := range vs {
		if n, err := strconv.Atoi(strings.TrimPrefix(v, day+".")); err == nil && n > max {
			max = n
		}
	}
	return fmt.Sprintf("%s.%d", day, max+1), nil
}

func summaryText(c Changes) string {
	var parts []string
	for _, ki := range kinds {
		name := ki.kind.Name
		if n := c.Added[ki.key]; n > 0 {
			parts = append(parts, fmt.Sprintf("+%d %s", n, plural(name, n)))
		}
		if n := c.Edited[ki.key]; n > 0 {
			parts = append(parts, fmt.Sprintf("%d %s edited", n, plural(name, n)))
		}
		if n := c.Removed[ki.key]; n > 0 {
			parts = append(parts, fmt.Sprintf("%d %s removed", n, plural(name, n)))
		}
	}
	if len(parts) == 0 {
		return "No changes"
	}
	return strings.Join(parts, ", ")
}

func plural(name string, n int) string {
	if n == 1 {
		return name
	}
	if strings.HasSuffix(name, "y") {
		return strings.TrimSuffix(name, "y") + "ies"
	}
	return name + "s"
}

// canon re-encodes JSON with sorted keys. For themes the "rev" key is dropped
// (rev == 0) or set, so two versions compare equal when only rev differs.
func canon(b []byte, theme bool, rev int) ([]byte, error) {
	if len(b) == 0 {
		return nil, nil
	}
	dec := json.NewDecoder(bytes.NewReader(b))
	dec.UseNumber()
	var v any
	if err := dec.Decode(&v); err != nil {
		return nil, err
	}
	if m, ok := v.(map[string]any); ok && theme {
		delete(m, "rev")
		if rev > 0 {
			m["rev"] = json.Number(strconv.Itoa(rev))
		}
	}
	return json.Marshal(v)
}

// stampPublishedAt fills an empty publishedAt with the release time; admin drafts never set it.
func stampPublishedAt(b []byte, now time.Time) ([]byte, error) {
	dec := json.NewDecoder(bytes.NewReader(b))
	dec.UseNumber()
	var m map[string]any
	if err := dec.Decode(&m); err != nil {
		return nil, err
	}
	if v, _ := m["publishedAt"].(string); v != "" {
		return b, nil
	}
	m["publishedAt"] = now.UTC().Format(time.RFC3339)
	return json.Marshal(m)
}

func manifestBytes(m catalog.Manifest) ([]byte, error) { return json.MarshalIndent(m, "", "  ") }

// writeAtomic writes next to the target and renames, so readers never see half a file.
func writeAtomic(path string, data []byte) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	f, err := os.CreateTemp(filepath.Dir(path), ".tmp-*")
	if err != nil {
		return err
	}
	_, werr := f.Write(data)
	cerr := f.Close()
	if werr != nil || cerr != nil {
		_ = os.Remove(f.Name())
		return errors.Join(werr, cerr)
	}
	if err := os.Chmod(f.Name(), 0o644); err != nil {
		_ = os.Remove(f.Name())
		return err
	}
	if err := os.Rename(f.Name(), path); err != nil {
		_ = os.Remove(f.Name())
		return err
	}
	return nil
}
