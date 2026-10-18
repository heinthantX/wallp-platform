package api

import (
	"context"
	"net/http"
	"strconv"
	"sync"
	"time"

	"github.com/danielgtaylor/huma/v2"
	"github.com/ulule/limiter/v3"
	"github.com/ulule/limiter/v3/drivers/store/memory"

	"github.com/heinthant/wallp-backend/internal/apierr"
	"github.com/heinthant/wallp-backend/internal/auth"
	"github.com/heinthant/wallp-backend/internal/model"
)

var eventTypes = map[string]bool{
	"theme_applied": true, "theme_favourited": true, "theme_unfavourited": true,
	"wallpaper_applied": true, "icon_pack_applied": true, "font_applied": true,
}

type EventIn struct {
	Type    string    `json:"type" maxLength:"40"`
	ThemeID string    `json:"themeId,omitempty" maxLength:"100"`
	ItemID  string    `json:"itemId,omitempty" maxLength:"100"`
	At      time.Time `json:"at"`
}

type PostEventsInput struct {
	Body struct {
		InstallID  string    `json:"installId" format:"uuid"`
		AppVersion string    `json:"appVersion" maxLength:"40"`
		Events     []EventIn `json:"events" maxItems:"100" doc:"Unknown types are dropped; 'at' must be within the last 7 days to 5 minutes ahead"`
	}
}

func registerEvents(h huma.API, d *Deps) {
	var once sync.Once
	var perInstall, perIP *limiter.Limiter
	limits := func() { // lazy so tests can lower the limits before the first call
		once.Do(func() {
			rate := func(n, def int) limiter.Rate {
				if n <= 0 {
					n = def
				}
				return limiter.Rate{Period: time.Hour, Limit: int64(n)}
			}
			perInstall = limiter.New(memory.NewStore(), rate(d.Cfg.EventsPerInstallHour, 30))
			perIP = limiter.New(memory.NewStore(), rate(d.Cfg.EventsPerIPHour, 120))
		})
	}
	tooMany := func(reset int64) error {
		wait := max(reset-time.Now().Unix(), 1)
		return huma.ErrorWithHeaders(
			apierr.New(http.StatusTooManyRequests, "rate_limited", "Too many event uploads, retry in "+strconv.FormatInt(wait, 10)+"s"),
			http.Header{"Retry-After": {strconv.FormatInt(wait, 10)}})
	}

	huma.Register(h, auth.AppOptional(huma.Operation{OperationID: "post-events", Method: http.MethodPost,
		Path: appPrefix + "/events", Summary: "Upload anonymous usage events",
		Description: "Telemetry only: the app never depends on it. Max 100 events and 64 KB per request; 30 requests/hour per install and 120/hour per IP.",
		Tags:        []string{"Events"}, DefaultStatus: http.StatusAccepted, MaxBodyBytes: 64 << 10}),
		func(ctx context.Context, in *PostEventsInput) (*struct{}, error) {
			limits()
			if c, err := perIP.Get(ctx, auth.MetaFrom(ctx).IP); err == nil && c.Reached {
				return nil, tooMany(c.Reset)
			}
			if c, err := perInstall.Get(ctx, in.Body.InstallID); err == nil && c.Reached {
				return nil, tooMany(c.Reset)
			}
			now := d.now()
			var userID *string
			if p := auth.From(ctx); p != nil && p.Kind == model.SubjectApp {
				userID = &p.ID
			}
			var rows []model.Event
			for _, e := range in.Body.Events {
				id := e.ItemID
				if id == "" {
					id = e.ThemeID
				}
				at := e.At.UTC()
				if !eventTypes[e.Type] || id == "" || at.Before(now.Add(-7*24*time.Hour)) || at.After(now.Add(5*time.Minute)) {
					continue
				}
				rows = append(rows, model.Event{InstallID: in.Body.InstallID, AppUserID: userID, Type: e.Type, ItemID: id, At: at, CreatedAt: now})
			}
			if len(rows) > 0 {
				if _, err := d.DB.NewInsert().Model(&rows).Exec(ctx); err != nil {
					return nil, err
				}
			}
			return nil, nil
		})
}
