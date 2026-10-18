package api_test

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/heinthant/wallp-backend/internal/api"
	"github.com/heinthant/wallp-backend/internal/auth"
	"github.com/heinthant/wallp-backend/internal/config"
	"github.com/heinthant/wallp-backend/internal/db"
	"github.com/heinthant/wallp-backend/internal/server"
	"github.com/uptrace/bun"
)

type testServer struct {
	server *httptest.Server
	db     *bun.DB
	deps   *api.Deps
}

func newServer(t *testing.T) *testServer {
	t.Helper()
	ctx := context.Background()

	testDBURL := os.Getenv("TEST_DATABASE_URL")
	var bdb *bun.DB
	var err error

	if testDBURL != "" {
		bdb, err = db.Open(testDBURL)
		if err != nil {
			t.Fatalf("failed to connect to TEST_DATABASE_URL: %v", err)
		}
		if _, err := bdb.ExecContext(ctx, "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"); err != nil {
			t.Fatalf("failed to reset public schema: %v", err)
		}
		if err := db.Migrate(ctx, bdb); err != nil {
			t.Fatalf("failed to run migrations on test pg: %v", err)
		}
	} else {
		dbPath := filepath.Join(t.TempDir(), "test.db")
		bdb, err = db.Open("file:" + dbPath)
		if err != nil {
			t.Fatalf("failed to open sqlite test db: %v", err)
		}
		if err := db.Migrate(ctx, bdb); err != nil {
			t.Fatalf("failed to run migrations on sqlite: %v", err)
		}
	}

	t.Cleanup(func() {
		_ = bdb.Close()
	})

	cfg := config.Config{
		Env:             "test",
		JWTSecret:       "a-very-long-test-jwt-secret-with-more-than-32-characters!",
		AccessTokenTTL:  15 * time.Minute,
		RefreshTokenTTL: 720 * time.Hour,
		TOTPIssuer:      "wallp-test",
		CORSOrigins:     []string{"*"},
		AuthRateLimit:   1000,
	}

	authSvc := &auth.Service{
		DB:         bdb,
		Secret:     []byte(cfg.JWTSecret),
		AccessTTL:  cfg.AccessTokenTTL,
		RefreshTTL: cfg.RefreshTokenTTL,
		Issuer:     cfg.TOTPIssuer,
	}

	deps := &api.Deps{
		Cfg:  cfg,
		DB:   bdb,
		Auth: authSvc,
	}

	handler, _ := server.New(deps)
	srv := httptest.NewServer(handler)
	t.Cleanup(srv.Close)

	return &testServer{
		server: srv,
		db:     bdb,
		deps:   deps,
	}
}

func (s *testServer) do(t *testing.T, method, path, token string, body any) (int, map[string]any) {
	t.Helper()
	return s.doWithHeaders(t, method, path, token, body, nil)
}

func (s *testServer) doWithHeaders(t *testing.T, method, path, token string, body any, headers map[string]string) (int, map[string]any) {
	t.Helper()

	url := path
	if !strings.HasPrefix(url, "http://") && !strings.HasPrefix(url, "https://") {
		url = s.server.URL + path
	}

	var reqBody io.Reader
	if body != nil {
		b, err := json.Marshal(body)
		if err != nil {
			t.Fatalf("failed to marshal request body: %v", err)
		}
		reqBody = bytes.NewReader(b)
	}

	req, err := http.NewRequest(method, url, reqBody)
	if err != nil {
		t.Fatalf("failed to create http request: %v", err)
	}

	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	for k, v := range headers {
		req.Header.Set(k, v)
	}

	resp, err := s.server.Client().Do(req)
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	defer resp.Body.Close()

	respBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		t.Fatalf("failed to read response body: %v", err)
	}

	var jsonMap map[string]any
	if len(respBytes) > 0 {
		_ = json.Unmarshal(respBytes, &jsonMap)
	}

	return resp.StatusCode, jsonMap
}
