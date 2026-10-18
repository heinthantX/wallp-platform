package api_test

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/heinthant/wallp-backend/internal/checks"
	"github.com/heinthant/wallp-backend/internal/releases"
)

// approve creates an item as designer, requests review and approves it.
func approveItem(t *testing.T, s *testServer, toks roleTokens, path string, payload map[string]any) {
	t.Helper()
	id := payload["id"].(string)
	if st, b := s.do(t, "POST", path, toks.designer, payload); st != 201 {
		t.Fatalf("create %s: %d %v", id, st, b)
	}
	reviewItem(t, s, toks, path, id)
}

func reviewItem(t *testing.T, s *testServer, toks roleTokens, path, id string) {
	t.Helper()
	if st, b := s.do(t, "POST", path+"/"+id+"/review", toks.designer, map[string]any{"action": "request"}); st != 200 {
		t.Fatalf("request %s: %d %v", id, st, b)
	}
	if st, b := s.do(t, "POST", path+"/"+id+"/review", toks.reviewer, map[string]any{"action": "approve"}); st != 200 {
		t.Fatalf("approve %s: %d %v", id, st, b)
	}
}

func publish(t *testing.T, s *testServer, token string, body map[string]any) (int, map[string]any) {
	t.Helper()
	return s.do(t, "POST", "/admin/v1/releases", token, body)
}

func getPublic(t *testing.T, s *testServer, path string) (int, []byte) {
	t.Helper()
	return s.doRaw(t, "GET", path, "", nil, nil)
}

func errCode(body map[string]any) string {
	e, _ := body["error"].(map[string]any)
	c, _ := e["code"].(string)
	return c
}

func createFestival(t *testing.T, s *testServer, toks roleTokens) {
	t.Helper()
	if st, b := s.do(t, "POST", "/admin/v1/festivals", toks.designer, validFestivalPayload("halloween", 10)); st != 201 {
		t.Fatalf("festival: %d %v", st, b)
	}
}

func seedTwoThemes(t *testing.T, s *testServer, toks roleTokens) {
	t.Helper()
	createFestival(t, s, toks)
	approveItem(t, s, toks, "/admin/v1/themes", validThemePayload("spider-night", "halloween"))
	approveItem(t, s, toks, "/admin/v1/themes", validThemePayload("bat-night", "halloween"))
}

func manifestOf(t *testing.T, s *testServer) map[string]any {
	t.Helper()
	st, b := getPublic(t, s, "/catalog/v1/manifest.json")
	if st != 200 {
		t.Fatalf("manifest: %d %s", st, b)
	}
	var m map[string]any
	if err := json.Unmarshal(b, &m); err != nil {
		t.Fatal(err)
	}
	return m
}

func themeRevs(t *testing.T, s *testServer, m map[string]any) map[string]float64 {
	t.Helper()
	_, b := getPublic(t, s, "/catalog/v1/"+m["catalog"].(string))
	var cat struct {
		Themes []struct {
			ID  string  `json:"id"`
			Rev float64 `json:"rev"`
		} `json:"themes"`
	}
	if err := json.Unmarshal(b, &cat); err != nil {
		t.Fatal(err)
	}
	out := map[string]float64{}
	for _, th := range cat.Themes {
		out[th.ID] = th.Rev
	}
	return out
}

func TestPublishWritesFilesAndManifest(t *testing.T) {
	s := newServer(t)
	s.deps.Checker = noChecks // fixtures are minimal; this test is about release files
	toks := setupRoleUsers(t, s)
	seedTwoThemes(t, s, toks)

	st, rel := publish(t, s, toks.reviewer, map[string]any{"notes": "first"})
	if st != 201 {
		t.Fatalf("publish: %d %v", st, rel)
	}
	version := time.Now().UTC().Format("2006-01-02") + ".1"
	if rel["version"] != version || rel["status"] != "live" {
		t.Fatalf("unexpected release: %v", rel)
	}
	if txt := rel["summary"].(map[string]any)["text"].(string); !strings.Contains(txt, "+2 themes") {
		t.Fatalf("summary text %q", txt)
	}

	m := manifestOf(t, s)
	if m["catalogVersion"] != version || m["catalog"] != "catalog."+version+".json" || m["schemaVersion"] != float64(1) {
		t.Fatalf("manifest: %v", m)
	}
	st, cat := getPublic(t, s, "/catalog/v1/"+m["catalog"].(string))
	if st != 200 {
		t.Fatalf("catalog: %d", st)
	}
	sum := sha256.Sum256(cat)
	if hex.EncodeToString(sum[:]) != m["catalogSha256"] {
		t.Fatal("catalogSha256 does not match the catalog bytes")
	}
	var doc map[string]any
	_ = json.Unmarshal(cat, &doc)
	if doc["catalogVersion"] != version || len(doc["themes"].([]any)) != 2 || len(doc["festivals"].([]any)) != 1 {
		t.Fatalf("catalog content: %v", doc)
	}
	for _, f := range []string{"themes/spider-night.1.json", "themes/bat-night.1.json"} {
		if st, _ := getPublic(t, s, "/catalog/v1/"+f); st != 200 {
			t.Fatalf("%s: %d", f, st)
		}
		if _, err := os.Stat(filepath.Join(s.deps.Cfg.StorageDir, "catalog", "v1", f)); err != nil {
			t.Fatal(err)
		}
	}

	// Items are now published, and the release is listed.
	_, it := s.do(t, "GET", "/admin/v1/themes/spider-night", toks.viewer, nil)
	if it["status"] != "published" || it["rev"] != float64(1) || it["hasUnpublishedChanges"] != false {
		t.Fatalf("item after publish: %v", it)
	}
	st, list := s.do(t, "GET", "/admin/v1/releases", toks.viewer, nil)
	if st != 200 || list["total"] != float64(1) {
		t.Fatalf("list: %d %v", st, list)
	}
	if st, _ := s.do(t, "GET", "/admin/v1/releases/"+version, toks.viewer, nil); st != 200 {
		t.Fatalf("get release: %d", st)
	}
	if st, _ := publish(t, s, toks.designer, map[string]any{}); st != 403 {
		t.Fatalf("designer publish: %d", st)
	}
}

func TestSecondPublishBumpsOnlyChangedTheme(t *testing.T) {
	s := newServer(t)
	s.deps.Checker = noChecks // fixtures are minimal; this test is about versioning
	toks := setupRoleUsers(t, s)
	seedTwoThemes(t, s, toks)
	if st, b := publish(t, s, toks.admin, map[string]any{}); st != 201 {
		t.Fatalf("publish 1: %d %v", st, b)
	}

	p := validThemePayload("spider-night", "halloween")
	p["name"] = map[string]any{"en": "Spider Night II"}
	if st, b := s.do(t, "PATCH", "/admin/v1/themes/spider-night", toks.designer, p); st != 200 {
		t.Fatalf("patch: %d %v", st, b)
	}
	reviewItem(t, s, toks, "/admin/v1/themes", "spider-night")

	st, rel := publish(t, s, toks.admin, map[string]any{})
	if st != 201 {
		t.Fatalf("publish 2: %d %v", st, rel)
	}
	if !strings.HasSuffix(rel["version"].(string), ".2") {
		t.Fatalf("version %v", rel["version"])
	}
	if txt := rel["summary"].(map[string]any)["text"].(string); txt != "1 theme edited" {
		t.Fatalf("summary %q", txt)
	}
	revs := themeRevs(t, s, manifestOf(t, s))
	if revs["spider-night"] != 2 || revs["bat-night"] != 1 {
		t.Fatalf("revs: %v", revs)
	}
	if st, _ := getPublic(t, s, "/catalog/v1/themes/spider-night.2.json"); st != 200 {
		t.Fatalf("spider-night.2: %d", st)
	}
	if st, _ := getPublic(t, s, "/catalog/v1/themes/bat-night.2.json"); st != 404 {
		t.Fatalf("bat-night.2 should not exist: %d", st)
	}
}

func TestRollbackRepointsManifest(t *testing.T) {
	s := newServer(t)
	s.deps.Checker = noChecks // fixtures are minimal; this test is about versioning
	toks := setupRoleUsers(t, s)
	seedTwoThemes(t, s, toks)
	_, r1 := publish(t, s, toks.admin, map[string]any{})
	v1 := r1["version"].(string)
	_, r2 := publish(t, s, toks.admin, map[string]any{})
	v2 := r2["version"].(string)
	if manifestOf(t, s)["catalogVersion"] != v2 {
		t.Fatal("expected v2 live")
	}
	if st, _ := s.do(t, "POST", "/admin/v1/releases/"+v1+"/rollback", toks.reviewer, nil); st != 403 {
		t.Fatalf("reviewer rollback: %d", st)
	}
	if st, b := s.do(t, "POST", "/admin/v1/releases/"+v2+"/rollback", toks.admin, nil); st != 409 || errCode(b) != "already_live" {
		t.Fatalf("rollback to live: %d %v", st, b)
	}
	st, b := s.do(t, "POST", "/admin/v1/releases/"+v1+"/rollback", toks.admin, nil)
	if st != 200 || b["status"] != "live" || b["current"] != true {
		t.Fatalf("rollback: %d %v", st, b)
	}
	m := manifestOf(t, s)
	if m["catalogVersion"] != v1 || m["catalog"] != "catalog."+v1+".json" {
		t.Fatalf("manifest after rollback: %v", m)
	}
	_, g := s.do(t, "GET", "/admin/v1/releases/"+v2, toks.viewer, nil)
	if g["status"] != "rolled_back" {
		t.Fatalf("v2 status: %v", g["status"])
	}
}

func TestPublicCatalogETagAndTraversal(t *testing.T) {
	s := newServer(t)
	s.deps.Checker = noChecks // fixtures are minimal; this test is about release files
	toks := setupRoleUsers(t, s)
	seedTwoThemes(t, s, toks)
	publish(t, s, toks.admin, map[string]any{})

	get := func(path, inm string) *http.Response {
		req, _ := http.NewRequest("GET", s.server.URL+path, nil)
		if inm != "" {
			req.Header.Set("If-None-Match", inm)
		}
		resp, err := s.server.Client().Do(req)
		if err != nil {
			t.Fatal(err)
		}
		resp.Body.Close()
		return resp
	}
	resp := get("/catalog/v1/manifest.json", "")
	etag := resp.Header.Get("ETag")
	if resp.StatusCode != 200 || etag == "" || resp.Header.Get("Cache-Control") != "public, max-age=300" {
		t.Fatalf("manifest headers: %d %q %q", resp.StatusCode, etag, resp.Header.Get("Cache-Control"))
	}
	if r := get("/catalog/v1/manifest.json", etag); r.StatusCode != 304 {
		t.Fatalf("expected 304, got %d", r.StatusCode)
	}
	if r := get("/catalog/v1/themes/spider-night.1.json", ""); !strings.Contains(r.Header.Get("Cache-Control"), "immutable") {
		t.Fatalf("theme cache: %q", r.Header.Get("Cache-Control"))
	}

	for _, p := range []string{
		"/catalog/v1/themes/..%2f..%2fmanifest.json",
		"/catalog/v1/themes/../manifest.json/x",
		"/catalog/v1/%2e%2e/%2e%2e/secret",
		"/catalog/v1/assets/..%2f..%2fcatalog%2fv1%2fmanifest.json",
		"/catalog/v1/themes/Spider.1.json",
		"/catalog/v1/assets/abc.png",
		"/catalog/v1/catalog.json",
	} {
		if r := get(p, ""); r.StatusCode == 200 {
			t.Fatalf("%s served", p)
		}
	}
	st, b := getPublic(t, s, "/catalog/v1/themes/nope.1.json")
	var body map[string]any
	_ = json.Unmarshal(b, &body)
	if st != 404 || errCode(body) != "not_found" {
		t.Fatalf("404 shape: %d %s", st, b)
	}
}

func TestPublishChecks(t *testing.T) {
	s := newServer(t)
	toks := setupRoleUsers(t, s)
	seedTwoThemes(t, s, toks)

	s.deps.Checker = func(context.Context) (checks.Report, error) {
		return checks.Report{Errors: []checks.Issue{{Code: "contrast_too_low", Level: "error", Message: "bad", ItemType: "theme", ItemID: "spider-night", Field: "palette.text"}}}, nil
	}
	st, b := publish(t, s, toks.admin, map[string]any{"ackWarnings": true})
	if st != 422 || errCode(b) != "checks_failed" {
		t.Fatalf("checks_failed: %d %v", st, b)
	}
	if d := b["error"].(map[string]any)["details"].([]any); len(d) != 1 {
		t.Fatalf("details: %v", d)
	}
	if st, _ := getPublic(t, s, "/catalog/v1/manifest.json"); st != 404 {
		t.Fatal("nothing should be published after failed checks")
	}

	s.deps.Checker = func(context.Context) (checks.Report, error) {
		return checks.Report{Warnings: []checks.Issue{{Code: "festival_few_dates", Level: "warning", Message: "few"}}}, nil
	}
	st, b = publish(t, s, toks.admin, map[string]any{})
	if st != 409 || errCode(b) != "warnings_need_ack" {
		t.Fatalf("warnings_need_ack: %d %v", st, b)
	}
	if st, b = publish(t, s, toks.admin, map[string]any{"ackWarnings": true}); st != 201 {
		t.Fatalf("acked publish: %d %v", st, b)
	}
}

func TestConcurrentPublishConflict(t *testing.T) {
	s := newServer(t)
	toks := setupRoleUsers(t, s)
	seedTwoThemes(t, s, toks)

	entered, release := make(chan struct{}), make(chan struct{})
	var once sync.Once
	s.deps.Checker = func(context.Context) (checks.Report, error) {
		once.Do(func() { close(entered) })
		<-release
		return checks.Report{}, nil
	}
	var wg sync.WaitGroup
	var firstStatus int
	wg.Add(1)
	go func() {
		defer wg.Done()
		firstStatus, _ = publish(t, s, toks.admin, map[string]any{})
	}()
	<-entered
	st, b := publish(t, s, toks.reviewer, map[string]any{})
	if st != 409 || errCode(b) != "publish_in_progress" {
		t.Fatalf("second publish: %d %v", st, b)
	}
	close(release)
	wg.Wait()
	if firstStatus != 201 {
		t.Fatalf("first publish: %d", firstStatus)
	}
}

func TestSchedulerTickPublishesDueItem(t *testing.T) {
	s := newServer(t)
	toks := setupRoleUsers(t, s)
	ctx := context.Background()
	chk := noChecks // fixtures are minimal; this test is about scheduling

	if ok, err := releases.Tick(ctx, s.db, s.deps.Cfg.StorageDir, chk); ok || err != nil {
		t.Fatalf("idle tick: %v %v", ok, err)
	}
	createFestival(t, s, toks)
	approveItem(t, s, toks, "/admin/v1/themes", validThemePayload("spider-night", "halloween"))
	at := time.Now().Add(time.Hour).UTC().Format(time.RFC3339)
	if st, b := s.do(t, "POST", "/admin/v1/themes/spider-night/schedule", toks.reviewer, map[string]any{"at": at}); st != 200 {
		t.Fatalf("schedule: %d %v", st, b)
	}
	if ok, _ := releases.Tick(ctx, s.db, s.deps.Cfg.StorageDir, chk); ok {
		t.Fatal("tick published before the item was due")
	}
	if _, err := s.db.ExecContext(ctx, "UPDATE themes SET scheduled_at = ? WHERE id = ?", time.Now().Add(-time.Minute).UTC(), "spider-night"); err != nil {
		t.Fatal(err)
	}
	ok, err := releases.Tick(ctx, s.db, s.deps.Cfg.StorageDir, chk)
	if !ok || err != nil {
		t.Fatalf("tick: %v %v", ok, err)
	}
	if revs := themeRevs(t, s, manifestOf(t, s)); revs["spider-night"] != 1 {
		t.Fatalf("revs: %v", revs)
	}
	_, it := s.do(t, "GET", "/admin/v1/themes/spider-night", toks.viewer, nil)
	if it["status"] != "published" {
		t.Fatalf("status: %v", it["status"])
	}
	_, rel := s.do(t, "GET", "/admin/v1/releases", toks.viewer, nil)
	if rel["items"].([]any)[0].(map[string]any)["createdBy"] != "scheduler" {
		t.Fatalf("release: %v", rel)
	}
}

func noChecks(context.Context) (checks.Report, error) { return checks.Report{}, nil }

// The default checker is the real one: a theme pointing at missing fonts blocks the publish.
func TestPublishUsesRealChecksByDefault(t *testing.T) {
	s := newServer(t)
	toks := setupRoleUsers(t, s)
	createFestival(t, s, toks)
	approveItem(t, s, toks, "/admin/v1/themes", validThemePayload("spider-night", "halloween"))
	st, b := s.do(t, "POST", "/admin/v1/releases", toks.admin, map[string]any{})
	if st != 422 || b["error"].(map[string]any)["code"] != "checks_failed" {
		t.Fatalf("want 422 checks_failed, got %d %v", st, b)
	}
}
