package api_test

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/heinthant/wallp-backend/internal/model"
	"github.com/heinthant/wallp-backend/internal/stats"
)

func eventBody(install string, evs ...map[string]any) map[string]any {
	return map[string]any{"installId": install, "appVersion": "1.0.0", "events": evs}
}

func ev(typ, id string, at time.Time) map[string]any {
	return map[string]any{"type": typ, "themeId": id, "at": at.Format(time.RFC3339)}
}

func countEvents(t *testing.T, s *testServer) int {
	t.Helper()
	n, err := s.db.NewSelect().Model((*model.Event)(nil)).Count(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	return int(n)
}

func TestEventsStoreAndDrop(t *testing.T) {
	s := newServer(t)
	seedItem(t, s, "themes", "a")
	now := time.Now().UTC()
	id := uuid.NewString()
	st, _ := s.do(t, "POST", "/v1/events", "", eventBody(id,
		ev("theme_applied", "a", now.Add(-time.Hour)),
		ev("theme_favourited", "a", now),
		ev("bogus_type", "a", now),
		ev("theme_applied", "a", now.Add(-8*24*time.Hour)), // too old
		ev("theme_applied", "a", now.Add(time.Hour)),       // future
	))
	if st != http.StatusAccepted {
		t.Fatalf("status %d", st)
	}
	if n := countEvents(t, s); n != 2 {
		t.Fatalf("stored %d events, want 2", n)
	}
}

func TestEventsValidation(t *testing.T) {
	s := newServer(t)
	now := time.Now().UTC()
	if st, _ := s.do(t, "POST", "/v1/events", "", eventBody("not-a-uuid", ev("theme_applied", "a", now))); st != 422 {
		t.Fatalf("bad installId: %d", st)
	}
	many := make([]map[string]any, 101)
	for i := range many {
		many[i] = ev("theme_applied", "a", now)
	}
	if st, _ := s.do(t, "POST", "/v1/events", "", eventBody(uuid.NewString(), many...)); st != 422 {
		t.Fatalf("101 events: %d", st)
	}
}

func TestEventsRateLimit(t *testing.T) {
	s := newServer(t)
	s.deps.Cfg.EventsPerInstallHour = 2
	id := uuid.NewString()
	now := time.Now().UTC()
	for i := 0; i < 2; i++ {
		if st, _ := s.do(t, "POST", "/v1/events", "", eventBody(id, ev("theme_applied", "a", now))); st != 202 {
			t.Fatalf("call %d: %d", i, st)
		}
	}
	st, raw := s.doRaw(t, "POST", "/v1/events", "", eventBody(id, ev("theme_applied", "a", now)), nil)
	if st != 429 {
		t.Fatalf("third call: %d %s", st, raw)
	}
	// another install is unaffected
	if st, _ := s.do(t, "POST", "/v1/events", "", eventBody(uuid.NewString(), ev("theme_applied", "a", now))); st != 202 {
		t.Fatalf("other install: %d", st)
	}
}

func TestEventsRetryAfterHeader(t *testing.T) {
	s := newServer(t)
	s.deps.Cfg.EventsPerIPHour = 1
	body := eventBody(uuid.NewString(), ev("theme_applied", "a", time.Now()))
	s.do(t, "POST", "/v1/events", "", body)
	jb, _ := json.Marshal(body)
	resp, err := http.Post(s.server.URL+"/v1/events", "application/json", bytes.NewReader(jb))
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != 429 || resp.Header.Get("Retry-After") == "" {
		t.Fatalf("status %d retry-after %q", resp.StatusCode, resp.Header.Get("Retry-After"))
	}
}

func insertEvent(t *testing.T, s *testServer, typ, item string, at time.Time) {
	t.Helper()
	e := &model.Event{InstallID: "i", Type: typ, ItemID: item, At: at, CreatedAt: at}
	if _, err := s.db.NewInsert().Model(e).Exec(context.Background()); err != nil {
		t.Fatal(err)
	}
}

func TestPopularityDecayOrdering(t *testing.T) {
	s := newServer(t)
	now := time.Date(2026, 10, 10, 12, 0, 0, 0, time.UTC)
	// fresh: 1 apply; stale: 1 apply 6 days ago; fav: 1 favourite 3 days ago (2 * 0.5 = 1)
	insertEvent(t, s, "theme_applied", "fresh", now.Add(-time.Hour))
	insertEvent(t, s, "theme_applied", "stale", now.Add(-6*24*time.Hour))
	insertEvent(t, s, "theme_favourited", "fav", now.Add(-24*time.Hour))
	insertEvent(t, s, "theme_applied", "ancient", now.Add(-9*24*time.Hour))
	pop, err := stats.Popularity(context.Background(), s.db, now)
	if err != nil {
		t.Fatal(err)
	}
	if !(pop["fav"] > pop["fresh"] && pop["fresh"] > pop["stale"] && pop["stale"] > 0) {
		t.Fatalf("ordering wrong: %v", pop)
	}
	if _, ok := pop["ancient"]; ok {
		t.Fatalf("event outside the window counted: %v", pop)
	}
}

func TestStatsDailyAndThemes(t *testing.T) {
	s := newServer(t)
	toks := setupRoleUsers(t, s)
	s.deps.Now = func() time.Time { return time.Date(2026, 10, 10, 12, 0, 0, 0, time.UTC) }
	insertEvent(t, s, "theme_applied", "a", time.Date(2026, 10, 8, 23, 30, 0, 0, time.UTC))
	insertEvent(t, s, "theme_applied", "a", time.Date(2026, 10, 9, 0, 30, 0, 0, time.UTC))
	insertEvent(t, s, "theme_favourited", "a", time.Date(2026, 10, 9, 5, 0, 0, 0, time.UTC))
	insertEvent(t, s, "theme_applied", "b", time.Date(2026, 10, 9, 6, 0, 0, 0, time.UTC))

	st, b := s.do(t, "GET", "/admin/v1/stats/daily?from=2026-10-08&to=2026-10-10&themeId=a", toks.viewer, nil)
	if st != 200 {
		t.Fatalf("daily: %d %v", st, b)
	}
	days := b["items"].([]any)
	if len(days) != 3 {
		t.Fatalf("days: %v", days)
	}
	got := fmt.Sprint(days[0], days[1], days[2])
	want := "map[applies:1 day:2026-10-08 favourites:0] map[applies:1 day:2026-10-09 favourites:1] map[applies:0 day:2026-10-10 favourites:0]"
	if got != want {
		t.Fatalf("got %s", got)
	}

	st, b = s.do(t, "GET", "/admin/v1/stats/themes?from=2026-10-08&to=2026-10-10", toks.designer, nil)
	if st != 200 {
		t.Fatalf("themes: %d %v", st, b)
	}
	rows := b["items"].([]any)
	first := rows[0].(map[string]any)
	if len(rows) != 2 || first["themeId"] != "a" || first["applies"] != float64(2) || first["favourites"] != float64(1) {
		t.Fatalf("rows: %v", rows)
	}

	if st, _ := s.do(t, "GET", "/admin/v1/stats/daily?from=2025-01-01&to=2026-10-10", toks.viewer, nil); st != 422 {
		t.Fatalf("range too long: %d", st)
	}
}

func TestStatsNeedLogin(t *testing.T) {
	s := newServer(t)
	for _, p := range []string{"/admin/v1/stats/themes", "/admin/v1/stats/daily", "/admin/v1/overview"} {
		if st, _ := s.do(t, "GET", p, "", nil); st != 401 {
			t.Fatalf("%s anonymous: %d", p, st)
		}
	}
}

func TestOverviewCountdownAndWarning(t *testing.T) {
	s := newServer(t)
	s.deps.Checker = noChecks
	toks := setupRoleUsers(t, s)
	seedTwoThemes(t, s, toks)
	if st, b := publish(t, s, toks.reviewer, map[string]any{}); st != 201 {
		t.Fatalf("publish: %d %v", st, b)
	}
	now := time.Date(2026, 10, 1, 9, 0, 0, 0, time.UTC)
	s.deps.Now = func() time.Time { return now }
	insertEvent(t, s, "theme_applied", "spider-night", now.Add(-time.Hour))

	st, b := s.do(t, "GET", "/admin/v1/overview", toks.viewer, nil)
	if st != 200 {
		t.Fatalf("overview: %d %v", st, b)
	}
	f := b["nextFestivals"].([]any)[0].(map[string]any)
	if f["nextDate"] != "2026-10-15" || f["nightsUntil"] != float64(14) || f["publishedThemes"] != float64(2) {
		t.Fatalf("festival: %v", f)
	}
	if f["warning"] != "Thadingyut Festival in 14 nights · 2 themes — needs at least 3" {
		t.Fatalf("warning: %v", f["warning"])
	}
	if b["lastRelease"] == nil {
		t.Fatal("lastRelease missing")
	}
	top := b["topThemesWeek"].([]any)
	if len(top) != 1 || top[0].(map[string]any)["themeId"] != "spider-night" {
		t.Fatalf("top: %v", top)
	}
	if _, ok := b["reviewQueue"].([]any); !ok {
		t.Fatalf("reviewQueue: %v", b["reviewQueue"])
	}
}

func TestPublishWritesPopularity(t *testing.T) {
	s := newServer(t)
	s.deps.Checker = noChecks
	toks := setupRoleUsers(t, s)
	seedTwoThemes(t, s, toks)
	for i := 0; i < 3; i++ {
		insertEvent(t, s, "theme_applied", "spider-night", time.Now().UTC().Add(-time.Hour))
	}
	if st, b := publish(t, s, toks.reviewer, map[string]any{}); st != 201 {
		t.Fatalf("publish: %d %v", st, b)
	}
	m := manifestOf(t, s)
	_, raw := getPublic(t, s, "/catalog/v1/"+m["catalog"].(string))
	var cat struct {
		Themes []struct {
			ID         string `json:"id"`
			Popularity int    `json:"popularity"`
		} `json:"themes"`
	}
	if err := json.Unmarshal(raw, &cat); err != nil {
		t.Fatal(err)
	}
	got := map[string]int{}
	for _, th := range cat.Themes {
		got[th.ID] = th.Popularity
	}
	// spider-night: 3 fresh applies (score ~2.9, shipped x10); bat-night keeps its authored value
	if got["spider-night"] < 25 || got["spider-night"] > 30 || got["bat-night"] != 10 {
		t.Fatalf("popularity: %v", got)
	}
}
