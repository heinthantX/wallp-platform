package api

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"sort"
	"time"

	"github.com/danielgtaylor/huma/v2"

	"github.com/heinthant/wallp-backend/internal/apierr"
	"github.com/heinthant/wallp-backend/internal/auth"
	"github.com/heinthant/wallp-backend/internal/catalog"
	"github.com/heinthant/wallp-backend/internal/items"
	"github.com/heinthant/wallp-backend/internal/model"
	"github.com/heinthant/wallp-backend/internal/stats"
)

const (
	maxRangeDays    = 366
	warnWithinNight = 30
	minThemes       = 3
)

type RangeParams struct {
	From string `query:"from" pattern:"^\\d{4}-\\d{2}-\\d{2}$" doc:"First day (UTC, YYYY-MM-DD). Default: 29 days before 'to'"`
	To   string `query:"to" pattern:"^\\d{4}-\\d{2}-\\d{2}$" doc:"Last day, inclusive. Default: today"`
}

// window turns the params into [from, to+1d), at most a year.
func (p RangeParams) window(now time.Time) (time.Time, time.Time, error) {
	to := now.Truncate(24 * time.Hour)
	var err error
	if p.To != "" {
		if to, err = time.Parse("2006-01-02", p.To); err != nil {
			return to, to, apierr.Invalid("to", "to must be a real date, YYYY-MM-DD")
		}
	}
	from := to.AddDate(0, 0, -29)
	if p.From != "" {
		if from, err = time.Parse("2006-01-02", p.From); err != nil {
			return from, to, apierr.Invalid("from", "from must be a real date, YYYY-MM-DD")
		}
	}
	if from.After(to) {
		return from, to, apierr.Invalid("from", "from must not be after to")
	}
	if to.Sub(from) > maxRangeDays*24*time.Hour {
		return from, to, apierr.Invalid("from", fmt.Sprintf("The range can span at most %d days", maxRangeDays))
	}
	return from, to.AddDate(0, 0, 1), nil
}

type ThemeStatsInput struct {
	RangeParams
	FestivalID string `query:"festivalId" maxLength:"100"`
}
type ThemeStatsOutput struct {
	Body struct {
		Items []stats.ThemeStat `json:"items"`
	}
}

type DailyStatsInput struct {
	RangeParams
	ThemeID string `query:"themeId" maxLength:"100"`
}
type DailyStatsOutput struct {
	Body struct {
		Items []stats.DayStat `json:"items"`
	}
}

type OverviewFestival struct {
	ID              string `json:"id"`
	Name            string `json:"name"`
	NextDate        string `json:"nextDate"`
	NightsUntil     int    `json:"nightsUntil"`
	PublishedThemes int    `json:"publishedThemes"`
	Warning         string `json:"warning,omitempty"`
}
type ReviewQueueItem struct {
	Type      string    `json:"type"`
	ID        string    `json:"id"`
	Name      string    `json:"name"`
	UpdatedAt time.Time `json:"updatedAt"`
}
type TopTheme struct {
	stats.ThemeStat
	Name string `json:"name"`
}
type OverviewOutput struct {
	Body struct {
		NextFestivals []OverviewFestival `json:"nextFestivals"`
		ReviewQueue   []ReviewQueueItem  `json:"reviewQueue"`
		LastRelease   *ReleaseView       `json:"lastRelease"`
		TopThemesWeek []TopTheme         `json:"topThemesWeek"`
	}
}

var statsRoles = []string{model.RoleViewer, model.RoleDesigner, model.RoleReviewer}

func registerStats(h huma.API, d *Deps) {
	tags := []string{"Statistics"}

	huma.Register(h, auth.Admin(huma.Operation{OperationID: "stats-themes", Method: http.MethodGet,
		Path: adminPrefix + "/stats/themes", Summary: "Applies, favourites and popularity per theme", Tags: tags}, statsRoles...),
		func(ctx context.Context, in *ThemeStatsInput) (*ThemeStatsOutput, error) {
			now := d.now()
			from, to, err := in.window(now)
			if err != nil {
				return nil, err
			}
			rows, err := stats.Themes(ctx, d.DB, from, to, in.FestivalID, now)
			if err != nil {
				return nil, err
			}
			out := &ThemeStatsOutput{}
			out.Body.Items = rows
			return out, nil
		})

	huma.Register(h, auth.Admin(huma.Operation{OperationID: "stats-daily", Method: http.MethodGet,
		Path: adminPrefix + "/stats/daily", Summary: "Applies and favourites per day", Tags: tags}, statsRoles...),
		func(ctx context.Context, in *DailyStatsInput) (*DailyStatsOutput, error) {
			from, to, err := in.window(d.now())
			if err != nil {
				return nil, err
			}
			rows, err := stats.Daily(ctx, d.DB, from, to, in.ThemeID)
			if err != nil {
				return nil, err
			}
			out := &DailyStatsOutput{}
			out.Body.Items = rows
			return out, nil
		})

	huma.Register(h, auth.Admin(huma.Operation{OperationID: "overview", Method: http.MethodGet,
		Path: adminPrefix + "/overview", Summary: "Dashboard home: next festivals, review queue, last release, top themes", Tags: tags}, statsRoles...),
		func(ctx context.Context, _ *struct{}) (*OverviewOutput, error) {
			out := &OverviewOutput{}
			var err error
			now := d.now()
			if out.Body.NextFestivals, err = nextFestivals(ctx, d, now); err != nil {
				return nil, err
			}
			if out.Body.ReviewQueue, err = reviewQueue(ctx, d); err != nil {
				return nil, err
			}
			var rel model.Release
			err = d.DB.NewSelect().Model(&rel).Where("target = ?", model.TargetLive).Where("current = ?", true).Limit(1).Scan(ctx)
			if err == nil {
				v := toReleaseView(&rel)
				out.Body.LastRelease = &v
			}
			top, err := stats.Themes(ctx, d.DB, now.Add(-stats.Window), now.Add(time.Minute), "", now)
			if err != nil {
				return nil, err
			}
			if len(top) > 5 {
				top = top[:5]
			}
			out.Body.TopThemesWeek = []TopTheme{}
			for _, t := range top {
				out.Body.TopThemesWeek = append(out.Body.TopThemesWeek, TopTheme{ThemeStat: t, Name: itemName(ctx, d, "themes", t.ThemeID)})
			}
			return out, nil
		})
}

func localizedEN(m map[string]string, fallback string) string {
	if m["en"] != "" {
		return m["en"]
	}
	return fallback
}

func itemName(ctx context.Context, d *Deps, table, id string) string {
	var data []byte
	if err := d.DB.NewSelect().Table(table).Column("data").Where("id = ?", id).Scan(ctx, &data); err != nil {
		return id
	}
	return nameFromData(data, id)
}

func nameFromData(data []byte, id string) string {
	var v struct {
		Name   catalog.Localized `json:"name"`
		Family string            `json:"family"`
	}
	_ = json.Unmarshal(data, &v)
	if v.Family != "" && len(v.Name) == 0 {
		return v.Family
	}
	return localizedEN(v.Name, id)
}

// nextFestivals lists dated festivals by their next date, soonest first.
func nextFestivals(ctx context.Context, d *Deps, now time.Time) ([]OverviewFestival, error) {
	var rows []struct {
		ID   string `bun:"id"`
		Data []byte `bun:"data"`
	}
	if err := d.DB.NewSelect().Table("festivals").Column("id", "data").
		Where("status <> ?", model.StatusArchived).Scan(ctx, &rows); err != nil {
		return nil, err
	}
	var counts []struct {
		FestivalID string `bun:"festival_id"`
		N          int    `bun:"n"`
	}
	if err := d.DB.NewSelect().Table("themes").ColumnExpr("festival_id, COUNT(*) AS n").
		Where("status = ?", model.StatusPublished).GroupExpr("festival_id").Scan(ctx, &counts); err != nil {
		return nil, err
	}
	published := map[string]int{}
	for _, c := range counts {
		published[c.FestivalID] = c.N
	}

	today := now.Truncate(24 * time.Hour)
	out := []OverviewFestival{}
	for _, r := range rows {
		var f catalog.Festival
		if json.Unmarshal(r.Data, &f) != nil {
			continue
		}
		next, ok := nextDate(f, today)
		if !ok {
			continue
		}
		o := OverviewFestival{ID: r.ID, Name: localizedEN(f.Name, r.ID), NextDate: next.Format("2006-01-02"),
			NightsUntil: int(next.Sub(today).Hours() / 24), PublishedThemes: published[r.ID]}
		if o.NightsUntil <= warnWithinNight && o.PublishedThemes < minThemes {
			o.Warning = fmt.Sprintf("%s in %d %s · %d %s — needs at least %d",
				o.Name, o.NightsUntil, plural1("night", o.NightsUntil), o.PublishedThemes, plural1("theme", o.PublishedThemes), minThemes)
		}
		out = append(out, o)
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].NextDate != out[j].NextDate {
			return out[i].NextDate < out[j].NextDate
		}
		return out[i].ID < out[j].ID
	})
	if len(out) > 5 {
		out = out[:5]
	}
	return out, nil
}

func plural1(w string, n int) string {
	if n == 1 {
		return w
	}
	return w + "s"
}

func nextDate(f catalog.Festival, today time.Time) (time.Time, bool) {
	for _, o := range f.Occurrences {
		if t, err := time.Parse("2006-01-02", o); err == nil && !t.Before(today) {
			return t, true
		}
	}
	if fb := f.FallbackDate; fb != nil {
		for y := today.Year(); y <= today.Year()+1; y++ {
			t := time.Date(y, time.Month(fb.Month), fb.Day, 0, 0, 0, 0, time.UTC)
			if !t.Before(today) {
				return t, true
			}
		}
	}
	return time.Time{}, false
}

func reviewQueue(ctx context.Context, d *Deps) ([]ReviewQueueItem, error) {
	out := []ReviewQueueItem{}
	for _, k := range []*items.Kind{items.CategoryKind, items.ThemeKind, items.WallpaperKind, items.FontKind, items.IconPackKind, items.BannerKind} {
		var rows []struct {
			ID        string    `bun:"id"`
			Data      []byte    `bun:"data"`
			UpdatedAt time.Time `bun:"updated_at"`
		}
		if err := d.DB.NewSelect().Table(k.Plural).Column("id", "data", "updated_at").
			Where("status = ?", model.StatusInReview).OrderExpr("updated_at DESC").Limit(20).Scan(ctx, &rows); err != nil {
			return nil, err
		}
		for _, r := range rows {
			out = append(out, ReviewQueueItem{Type: k.Name, ID: r.ID, Name: nameFromData(r.Data, r.ID), UpdatedAt: r.UpdatedAt})
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].UpdatedAt.After(out[j].UpdatedAt) })
	if len(out) > 20 {
		out = out[:20]
	}
	return out, nil
}
