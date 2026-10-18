package api_test

import (
	"bytes"
	"context"
	"encoding/binary"
	"fmt"
	"hash/crc32"
	"image"
	"image/png"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/pquerna/otp/totp"

	"github.com/heinthant/wallp-backend/internal/api"
	"github.com/heinthant/wallp-backend/internal/assets"
	"github.com/heinthant/wallp-backend/internal/config"
	"github.com/heinthant/wallp-backend/internal/server"
)

func seedItem(t *testing.T, s *testServer, table, id string) {
	t.Helper()
	now := time.Now().UTC()
	_, err := s.db.ExecContext(context.Background(),
		"INSERT INTO "+table+" (id, status, sort, search, data, rev, published_hash, created_by, updated_by, created_at, updated_at) VALUES (?, 'draft', 0, '', '{}', 0, '', 'x', 'x', ?, ?)",
		id, now, now)
	if err != nil {
		t.Fatal(err)
	}
}

// restart serves the same DB with a changed config.
func restart(t *testing.T, s *testServer, mutate func(*config.Config)) *testServer {
	t.Helper()
	d := *s.deps
	mutate(&d.Cfg)
	h, _ := server.New(&d)
	srv := httptest.NewServer(h)
	t.Cleanup(srv.Close)
	return &testServer{server: srv, db: s.db, deps: &d}
}

// H1: X-Forwarded-For must not change the rate-limit key.
func TestForwardedForIgnoredByRateLimit(t *testing.T) {
	s := restart(t, newServer(t), func(c *config.Config) { c.AuthRateLimit = 2 })
	var last int
	for i := 0; i < 3; i++ {
		last, _ = s.doWithHeaders(t, "POST", "/admin/v1/auth/login", "", map[string]any{"email": "a@b.co", "password": "x"},
			map[string]string{"X-Forwarded-For": fmt.Sprintf("10.0.0.%d", i+1)})
	}
	if last != 429 {
		t.Fatalf("third attempt with spoofed XFF: %d, want 429", last)
	}
}

func mfaSetup(t *testing.T, s *testServer) (secret, mfaToken string) {
	t.Helper()
	_, body := s.do(t, "POST", "/admin/v1/auth/setup", "", map[string]any{"email": "admin@example.com", "name": "Admin", "password": "password12345"})
	tok := body["accessToken"].(string)
	_, body = s.do(t, "POST", "/admin/v1/auth/totp/setup", tok, nil)
	secret = body["secret"].(string)
	code, _ := totp.GenerateCode(secret, time.Now())
	if st, b := s.do(t, "POST", "/admin/v1/auth/totp/enable", tok, map[string]any{"code": code}); st != 200 {
		t.Fatalf("enable: %d %v", st, b)
	}
	_, body = s.do(t, "POST", "/admin/v1/auth/login", "", map[string]any{"email": "admin@example.com", "password": "password12345"})
	return secret, body["mfaToken"].(string)
}

// M1: a TOTP code works once.
func TestMFAReplayRejected(t *testing.T) {
	s := newServer(t)
	secret, mt := mfaSetup(t, s)
	code, _ := totp.GenerateCode(secret, time.Now())
	if st, b := s.do(t, "POST", "/admin/v1/auth/mfa", "", map[string]any{"mfaToken": mt, "code": code}); st != 200 {
		t.Fatalf("first use: %d %v", st, b)
	}
	st, b := s.do(t, "POST", "/admin/v1/auth/mfa", "", map[string]any{"mfaToken": mt, "code": code})
	if st != 401 || errCode(b) != "totp_replayed" {
		t.Fatalf("replay: %d %v", st, b)
	}
}

// M1: 5 wrong codes lock MFA for that user.
func TestMFALockout(t *testing.T) {
	s := newServer(t)
	secret, mt := mfaSetup(t, s)
	for i := 0; i < 5; i++ {
		if st, _ := s.do(t, "POST", "/admin/v1/auth/mfa", "", map[string]any{"mfaToken": mt, "code": "000000"}); st != 401 {
			t.Fatalf("wrong code %d: %d", i, st)
		}
	}
	code, _ := totp.GenerateCode(secret, time.Now())
	st, b := s.do(t, "POST", "/admin/v1/auth/mfa", "", map[string]any{"mfaToken": mt, "code": code})
	if st != 429 || errCode(b) != "mfa_locked" {
		t.Fatalf("locked: %d %v", st, b)
	}
}

// M3: an oversized image is rejected from its header, before decoding.
func TestImagePixelCapBeforeDecode(t *testing.T) {
	var buf bytes.Buffer
	if err := png.Encode(&buf, image.NewRGBA(image.Rect(0, 0, 1, 1))); err != nil {
		t.Fatal(err)
	}
	b := buf.Bytes()
	binary.BigEndian.PutUint32(b[16:], 6000)
	binary.BigEndian.PutUint32(b[20:], 5000)
	binary.BigEndian.PutUint32(b[29:], crc32.ChecksumIEEE(b[12:29])) // IHDR crc
	_, _, err := assets.ProcessImage(b, false)
	if err == nil || !strings.Contains(err.Error(), "25 megapixels") {
		t.Fatalf("want megapixel rejection, got %v", err)
	}
}

// M4: unknown items are dropped and (type,item) is counted once per batch.
func TestEventsDropUnknownAndDedupe(t *testing.T) {
	s := newServer(t)
	seedItem(t, s, "themes", "real")
	now := time.Now().UTC()
	st, _ := s.do(t, "POST", "/v1/events", "", eventBody(uuid.NewString(),
		ev("theme_applied", "real", now), ev("theme_applied", "real", now), ev("theme_applied", "ghost", now)))
	if st != 202 {
		t.Fatalf("status %d", st)
	}
	if n := countEvents(t, s); n != 1 {
		t.Fatalf("stored %d, want 1", n)
	}
}

// M5: a redirect to a host outside the allowlist is not followed.
func TestGoogleFontsRedirectBlocked(t *testing.T) {
	var hit bool
	evil := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { hit = true }))
	t.Cleanup(evil.Close)
	evilURL := strings.Replace(evil.URL, "127.0.0.1", "localhost", 1)
	good := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, evilURL+"/x", http.StatusFound)
	}))
	t.Cleanup(good.Close)
	s := newServerWithGoogleFonts(t, good.URL+"/metadata/fonts", good.URL+"/download/list")
	toks := setupRoleUsers(t, s)
	st, _ := s.do(t, "GET", "/admin/v1/fonts/google?q=a", toks.admin, nil)
	if st != 502 || hit {
		t.Fatalf("status %d, redirect target hit=%v", st, hit)
	}
}

// M6: at most 20 variants.
func TestGoogleFontsVariantCap(t *testing.T) {
	s := newServerWithGoogleFonts(t, "http://127.0.0.1:1/m", "http://127.0.0.1:1/d")
	toks := setupRoleUsers(t, s)
	v := make([]string, 21)
	for i := range v {
		v[i] = fmt.Sprint(100 + i)
	}
	st, _ := s.do(t, "POST", "/admin/v1/fonts/google/import", toks.admin, map[string]any{"family": "Roboto", "variants": v})
	if st != 422 {
		t.Fatalf("21 variants: %d", st)
	}
}

// L3: an install linked to one account cannot be taken over by another.
func TestLinkInstallConflict(t *testing.T) {
	s := newServer(t)
	reg := func(email string) string {
		_, b := s.do(t, "POST", "/v1/auth/register", "", map[string]any{"email": email, "password": "password12345", "displayName": "U"})
		return b["accessToken"].(string)
	}
	a, b := reg("a@example.com"), reg("b@example.com")
	in := map[string]any{"installId": uuid.NewString(), "appVersion": "1.0.0"}
	for _, step := range []struct {
		tok  string
		want int
	}{{a, 204}, {a, 204}, {b, 409}} {
		if st, body := s.do(t, "POST", "/v1/me/installs", step.tok, in); st != step.want {
			t.Fatalf("link: %d want %d %v", st, step.want, body)
		}
	}
}

// L5: security headers.
func TestSecurityHeaders(t *testing.T) {
	s := restart(t, newServer(t), func(c *config.Config) { c.Env = "production" })
	get := func(p string) http.Header {
		resp, err := http.Get(s.server.URL + p)
		if err != nil {
			t.Fatal(err)
		}
		resp.Body.Close()
		return resp.Header
	}
	h := get("/healthz")
	if !strings.Contains(h.Get("Strict-Transport-Security"), "max-age=31536000") || !strings.Contains(h.Get("Content-Security-Policy"), "default-src 'none'") {
		t.Fatalf("healthz headers: %v", h)
	}
	plain := newServer(t)
	resp, err := http.Get(plain.server.URL + "/docs")
	if err != nil {
		t.Fatal(err)
	}
	resp.Body.Close()
	if resp.StatusCode != 200 || resp.Header.Get("Content-Security-Policy") == "default-src 'none'; frame-ancestors 'none'" {
		t.Fatalf("/docs must work and not carry the API CSP: %d %q", resp.StatusCode, resp.Header.Get("Content-Security-Policy"))
	}
}

// /docs and the OpenAPI document are hidden in production unless DOCS_PUBLIC.
func TestDocsHiddenInProd(t *testing.T) {
	status := func(s *testServer, p string) int {
		resp, err := http.Get(s.server.URL + p)
		if err != nil {
			t.Fatal(err)
		}
		resp.Body.Close()
		return resp.StatusCode
	}
	base := newServer(t)
	prod := restart(t, base, func(c *config.Config) { c.Env = "production" })
	if a, b := status(prod, "/docs"), status(prod, "/openapi.json"); a != 404 || b != 404 {
		t.Fatalf("prod docs=%d openapi=%d, want 404", a, b)
	}
	pub := restart(t, base, func(c *config.Config) { c.Env = "production"; c.DocsPublic = true })
	if a, b := status(pub, "/docs"), status(pub, "/openapi.json"); a != 200 || b != 200 {
		t.Fatalf("DOCS_PUBLIC docs=%d openapi=%d, want 200", a, b)
	}
}

var _ = api.ResetGoogleFontsCache

// L2: setup is single-shot, and the lock row itself refuses a second claim.
func TestSetupLock(t *testing.T) {
	s := newServer(t)
	body := map[string]any{"email": "admin@example.com", "name": "Admin", "password": "password12345"}
	if st, b := s.do(t, "POST", "/admin/v1/auth/setup", "", body); st != 200 {
		t.Fatalf("first setup: %d %v", st, b)
	}
	if st, b := s.do(t, "POST", "/admin/v1/auth/setup", "", body); st != 409 || errCode(b) != "setup_done" {
		t.Fatalf("second setup: %d %v", st, b)
	}
	// The lock was claimed by the first setup, so a direct claim fails too.
	if err := api.ClaimSetupLock(context.Background(), s.db); err == nil {
		t.Fatal("second lock claim succeeded")
	}
}

// Registering a taken email looks the same as other non-field failures.
func TestRegisterTakenEmailNotDistinguishable(t *testing.T) {
	s := newServer(t)
	in := map[string]any{"email": "u@example.com", "password": "password12345", "displayName": "U"}
	s.do(t, "POST", "/v1/auth/register", "", in)
	st, b := s.do(t, "POST", "/v1/auth/register", "", in)
	if st != 422 || errCode(b) != "registration_failed" {
		t.Fatalf("taken email: %d %v", st, b)
	}
}

func importDir(t *testing.T, files map[string][]byte) string {
	t.Helper()
	dir := t.TempDir()
	if err := os.MkdirAll(filepath.Join(dir, "assets"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "catalog.json"), []byte(`{"festivals":[]}`), 0o644); err != nil {
		t.Fatal(err)
	}
	for name, b := range files {
		if err := os.WriteFile(filepath.Join(dir, "assets", name), b, 0o644); err != nil {
			t.Fatal(err)
		}
	}
	return dir
}

// L4: asset type comes from content; unknown types are skipped (never stored) without failing the batch.
func TestImportSkipsUnknownAssetType(t *testing.T) {
	s := newServer(t)
	png := []byte("\x89PNG\r\n\x1a\n\x00\x00\x00\x0dIHDR")
	dir := importDir(t, map[string][]byte{"payload.png": []byte("MZ\x90\x00 not an image"), "ok.png": png})
	res, err := api.RunImportDir(context.Background(), s.deps, dir, "cli")
	if err != nil {
		t.Fatalf("import: %v", err)
	}
	if len(res.SkippedAssets) != 1 || res.SkippedAssets[0] != "payload.png" {
		t.Fatalf("skipped = %v", res.SkippedAssets)
	}
	entries, _ := os.ReadDir(filepath.Join(s.deps.Cfg.StorageDir, "assets"))
	if len(entries) != 1 || !strings.HasSuffix(entries[0].Name(), ".png") {
		t.Fatalf("stored assets = %v", entries)
	}
}

// Hidden files from macOS archives ("._*", .DS_Store) are ignored, not imported or rejected.
func TestImportIgnoresHiddenFiles(t *testing.T) {
	s := newServer(t)
	dir := importDir(t, map[string][]byte{"._ok.png": {0, 5, 22, 7}, ".DS_Store": {0, 0, 0, 1}})
	if err := os.MkdirAll(filepath.Join(dir, "themes"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "themes", "._x.2.json"), []byte{0, 5, 22, 7}, 0o644); err != nil {
		t.Fatal(err)
	}
	res, err := api.RunImportDir(context.Background(), s.deps, dir, "cli")
	if err != nil {
		t.Fatalf("import: %v", err)
	}
	if len(res.SkippedAssets) != 0 {
		t.Fatalf("hidden files reported as skipped: %v", res.SkippedAssets)
	}
}

// L4: symlinks in the import dir are skipped, not followed.
func TestImportSkipsSymlinks(t *testing.T) {
	s := newServer(t)
	dir := importDir(t, nil)
	outside := filepath.Join(t.TempDir(), "secret.txt")
	if err := os.WriteFile(outside, []byte("not an asset type"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(outside, filepath.Join(dir, "assets", "link.png")); err != nil {
		t.Skip("symlinks unavailable")
	}
	if _, err := api.RunImportDir(context.Background(), s.deps, dir, "cli"); err != nil {
		t.Fatalf("symlink should be skipped, got %v", err)
	}
}

// L6: a manifest write failure after rollback leaves the DB current release unchanged.
func TestRollbackManifestWriteFailureRestores(t *testing.T) {
	s := newServer(t)
	s.deps.Checker = noChecks
	toks := setupRoleUsers(t, s)
	seedTwoThemes(t, s, toks)
	_, r1 := publish(t, s, toks.admin, map[string]any{})
	_, r2 := publish(t, s, toks.admin, map[string]any{})
	v1, v2 := r1["version"].(string), r2["version"].(string)

	// Make manifest.json un-replaceable: a non-empty directory sits in its place.
	mp := filepath.Join(s.deps.Cfg.StorageDir, "catalog", "v1", "manifest.json")
	_ = os.Remove(mp)
	if err := os.MkdirAll(filepath.Join(mp, "x"), 0o755); err != nil {
		t.Fatal(err)
	}
	if st, _ := s.do(t, "POST", "/admin/v1/releases/"+v1+"/rollback", toks.admin, nil); st < 500 {
		t.Fatalf("rollback should fail, got %d", st)
	}
	_, g2 := s.do(t, "GET", "/admin/v1/releases/"+v2, toks.viewer, nil)
	_, g1 := s.do(t, "GET", "/admin/v1/releases/"+v1, toks.viewer, nil)
	if g2["current"] != true || g2["status"] != "live" || g1["current"] == true || g1["status"] == "live" {
		t.Fatalf("DB not restored: v2=%v v1=%v", g2, g1)
	}
}
