// Package stats turns the raw events table into popularity and usage numbers.
// Rows are aggregated in Go so day bucketing is identical on Postgres and SQLite.
package stats

import (
	"context"
	"math"
	"sort"
	"time"

	"github.com/uptrace/bun"

	"github.com/heinthant/wallp-backend/internal/model"
)

const (
	TypeApplied      = "theme_applied"
	TypeFavourited   = "theme_favourited"
	Window           = 7 * 24 * time.Hour
	HalfLife         = 3 * 24 * time.Hour
	RetentionDays    = 180
	applyWeight      = 1.0
	favouriteWeight  = 2.0
	themeEventsLimit = 1_000_000 // ponytail: rows are summed in Go; move to SQL GROUP BY if the table outgrows this
)

type row struct {
	Type   string    `bun:"type"`
	ItemID string    `bun:"item_id"`
	At     time.Time `bun:"at"`
}

func load(ctx context.Context, db *bun.DB, from, to time.Time, itemID, festivalID string) ([]row, error) {
	var rows []row
	q := db.NewSelect().Table("events").Column("type", "item_id", "at").
		Where("type IN (?)", bun.In([]string{TypeApplied, TypeFavourited})).
		Where("at >= ?", from).Where("at < ?", to).Limit(themeEventsLimit)
	if itemID != "" {
		q = q.Where("item_id = ?", itemID)
	}
	if festivalID != "" {
		q = q.Where("item_id IN (SELECT id FROM themes WHERE festival_id = ?)", festivalID)
	}
	return rows, q.Scan(ctx, &rows)
}

// Popularity is the 7-day decayed score per theme: applies x1 + favourites x2,
// each event halving every 3 days.
func Popularity(ctx context.Context, db *bun.DB, now time.Time) (map[string]float64, error) {
	rows, err := load(ctx, db, now.Add(-Window), now.Add(time.Minute*5), "", "")
	if err != nil {
		return nil, err
	}
	out := map[string]float64{}
	for _, r := range rows {
		age := now.Sub(r.At)
		if age < 0 {
			age = 0
		}
		w := applyWeight
		if r.Type == TypeFavourited {
			w = favouriteWeight
		}
		out[r.ItemID] += w * math.Pow(0.5, float64(age)/float64(HalfLife))
	}
	return out, nil
}

type ThemeStat struct {
	ThemeID    string  `json:"themeId"`
	Applies    int     `json:"applies"`
	Favourites int     `json:"favourites"`
	Popularity float64 `json:"popularity"`
}

// Themes counts events in [from, to) per theme; popularity is as of now.
func Themes(ctx context.Context, db *bun.DB, from, to time.Time, festivalID string, now time.Time) ([]ThemeStat, error) {
	rows, err := load(ctx, db, from, to, "", festivalID)
	if err != nil {
		return nil, err
	}
	pop, err := Popularity(ctx, db, now)
	if err != nil {
		return nil, err
	}
	by := map[string]*ThemeStat{}
	for _, r := range rows {
		s := by[r.ItemID]
		if s == nil {
			s = &ThemeStat{ThemeID: r.ItemID, Popularity: math.Round(pop[r.ItemID]*100) / 100}
			by[r.ItemID] = s
		}
		if r.Type == TypeFavourited {
			s.Favourites++
		} else {
			s.Applies++
		}
	}
	out := make([]ThemeStat, 0, len(by))
	for _, s := range by {
		out = append(out, *s)
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].Popularity != out[j].Popularity {
			return out[i].Popularity > out[j].Popularity
		}
		return out[i].ThemeID < out[j].ThemeID
	})
	return out, nil
}

type DayStat struct {
	Day        string `json:"day"`
	Applies    int    `json:"applies"`
	Favourites int    `json:"favourites"`
}

// Daily buckets events per UTC day over [from, to), with zero days filled in.
func Daily(ctx context.Context, db *bun.DB, from, to time.Time, themeID string) ([]DayStat, error) {
	rows, err := load(ctx, db, from, to, themeID, "")
	if err != nil {
		return nil, err
	}
	idx := map[string]int{}
	out := []DayStat{}
	for d := from.UTC().Truncate(24 * time.Hour); d.Before(to); d = d.AddDate(0, 0, 1) {
		idx[d.Format("2006-01-02")] = len(out)
		out = append(out, DayStat{Day: d.Format("2006-01-02")})
	}
	for _, r := range rows {
		i, ok := idx[r.At.UTC().Format("2006-01-02")]
		if !ok {
			continue
		}
		if r.Type == TypeFavourited {
			out[i].Favourites++
		} else {
			out[i].Applies++
		}
	}
	return out, nil
}

// Prune deletes events older than the retention window.
func Prune(ctx context.Context, db *bun.DB, now time.Time) error {
	_, err := db.NewDelete().Model((*model.Event)(nil)).
		Where("created_at < ?", now.AddDate(0, 0, -RetentionDays)).Exec(ctx)
	return err
}
